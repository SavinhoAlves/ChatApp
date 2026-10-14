import type { Socket } from 'socket.io-client';

/**
 * Ligações de voz e vídeo por WebRTC. O servidor só repassa a sinalização (ver server/src/calls.ts);
 * áudio e vídeo vão direto entre os aparelhos. Em grupo é uma malha: cada participante tem uma conexão
 * com cada um dos outros. Regra para não haver "ofertas cruzadas": quem acabou de entrar oferece.
 */

export type CallStatus = 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';
export type CallPerson = { id: string; displayName: string; avatarUrl?: string | null };

export interface CallState {
  id: string;
  conversationId: string | null;
  video: boolean;
  group: boolean;
  status: CallStatus;
  /** Quem ligou (chamada recebida). */
  from?: CallPerson;
  startedAt?: number;
  endedReason?: 'ended' | 'missed' | 'declined' | 'failed';
}

type Signal = { type: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RTCIceCandidateInit };

// Fora do estado reativo: objetos do navegador que o Vue não deve "embrulhar".
const peers = new Map<string, RTCPeerConnection>();
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
let localStream: MediaStream | null = null;
let iceServers: RTCIceServer[] | null = null;
// A senha do TURN é temporária: pede outra depois de 1 hora (ela vale 12h no servidor).
let iceFetchedAt = 0;
const ICE_REFRESH_MS = 60 * 60_000;
let boundSocket: Socket | null = null;
let ringer: { stop: () => void } | null = null;
let endTimer: ReturnType<typeof setTimeout> | undefined;
/** Vídeo/áudio que chega de cada participante (compartilhado entre os componentes). */
const streams = shallowRef<Record<string, MediaStream>>({});

/** Toque simples gerado na hora (sem arquivo de áudio): "trim-trim" de entrada ou "tuuu" de chamada saindo. */
function startTone(kind: 'incoming' | 'outgoing') {
  try {
    const ctx = new AudioContext();
    let stopped = false;
    const beep = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(kind === 'incoming' ? 0.18 : 0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    const cycle = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      if (kind === 'incoming') {
        beep(880, t, 0.35);
        beep(660, t + 0.45, 0.35);
      } else beep(440, t, 1.2);
    };
    cycle();
    const timer = setInterval(cycle, kind === 'incoming' ? 2000 : 3000);
    return {
      stop() {
        stopped = true;
        clearInterval(timer);
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return { stop() {} };
  }
}

export function useCall() {
  const { api } = useAuth();
  const call = useState<CallState | null>('call', () => null);
  /** Pessoas na chamada (fora eu): nome, foto e o stream que está chegando. */
  const people = useState<Record<string, CallPerson & { connected: boolean }>>('call.people', () => ({}));
  const local = useState<MediaStream | null>('call.local', () => null);
  const muted = useState('call.muted', () => false);
  const cameraOff = useState('call.cameraOff', () => false);
  const error = useState('call.error', () => '');
  /** Aparelho sem microfone (ou sem câmera numa chamada de vídeo): entra só para ouvir/ver. */
  const noMic = useState('call.noMic', () => false);
  const noCamera = useState('call.noCamera', () => false);

  const socket = () => boundSocket ?? useChat().getSocket();

  function emit<T = Record<string, unknown>>(event: string, data: unknown): Promise<T & { ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const s = socket();
      if (!s?.connected) return resolve({ ok: false, error: 'Sem conexão com o servidor' } as T & { ok: boolean; error?: string });
      s.emit(event, data, (res: T & { ok: boolean; error?: string }) => resolve(res));
    });
  }

  async function getIceServers() {
    if (iceServers && Date.now() - iceFetchedAt < ICE_REFRESH_MS) return iceServers;
    try {
      iceServers = (await api<{ iceServers: RTCIceServer[] }>('/calls/ice')).iceServers;
      iceFetchedAt = Date.now();
    } catch {
      // Sem conexão com a API: tenta só com STUN (sem guardar, para buscar o TURN na próxima).
      return iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    return iceServers;
  }

  async function getLocalMedia(video: boolean) {
    if (localStream) return localStream;
    // Usa o que o aparelho tiver: sem microfone ainda dá para ouvir; sem câmera, entra só com voz.
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const hasMic = devices.some((d) => d.kind === 'audioinput');
    const hasCam = devices.some((d) => d.kind === 'videoinput');
    const wantVideo = video && hasCam;
    noMic.value = !hasMic;
    noCamera.value = video && !hasCam;
    localStream =
      hasMic || wantVideo
        ? await navigator.mediaDevices.getUserMedia({
            audio: hasMic ? { echoCancellation: true, noiseSuppression: true } : false,
            video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
          })
        : new MediaStream();
    local.value = localStream;
    muted.value = !hasMic;
    cameraOff.value = false;
    return localStream;
  }

  function setPeopleStream(userId: string, stream: MediaStream) {
    streams.value = { ...streams.value, [userId]: stream };
  }

  async function createPeer(userId: string) {
    peers.get(userId)?.close();
    const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
    peers.set(userId, pc);
    localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream!));
    // Sem microfone/câmera local: ainda assim recebe o áudio/vídeo dos outros.
    if (!localStream?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (call.value?.video && !localStream?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });

    pc.onicecandidate = (e) => {
      if (e.candidate && call.value) {
        void emit('call:signal', { callId: call.value.id, to: userId, data: { type: 'candidate', candidate: e.candidate.toJSON() } });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setPeopleStream(userId, stream);
    };
    pc.onconnectionstatechange = () => {
      const person = people.value[userId];
      if (person) person.connected = pc.connectionState === 'connected';
      if (pc.connectionState === 'connected' && call.value && call.value.status !== 'active') {
        call.value.status = 'active';
        call.value.startedAt = Date.now();
        ringer?.stop();
        ringer = null;
      }
      if (pc.connectionState === 'failed') removePeer(userId);
    };
    return pc;
  }

  function removePeer(userId: string) {
    peers.get(userId)?.close();
    peers.delete(userId);
    pendingCandidates.delete(userId);
    const { [userId]: _gone, ...rest } = people.value;
    people.value = rest;
    const { [userId]: _s, ...restStreams } = streams.value;
    streams.value = restStreams;
  }

  async function offerTo(userId: string) {
    if (!call.value) return;
    const pc = await createPeer(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await emit('call:signal', { callId: call.value.id, to: userId, data: { type: 'offer', sdp: offer.sdp } });
  }

  async function flushCandidates(userId: string, pc: RTCPeerConnection) {
    for (const c of pendingCandidates.get(userId) ?? []) await pc.addIceCandidate(c).catch(() => {});
    pendingCandidates.delete(userId);
  }

  async function onSignal({ callId, from, data }: { callId: string; from: string; data: Signal }) {
    if (!call.value || call.value.id !== callId) return;
    let pc = peers.get(from);
    if (data.type === 'offer') {
      pc = await createPeer(from);
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      await flushCandidates(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await emit('call:signal', { callId, to: from, data: { type: 'answer', sdp: answer.sdp } });
    } else if (data.type === 'answer' && pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      await flushCandidates(from, pc);
    } else if (data.type === 'candidate' && data.candidate) {
      if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else pendingCandidates.set(from, [...(pendingCandidates.get(from) ?? []), data.candidate]);
    }
  }

  function cleanup(reason?: CallState['endedReason']) {
    ringer?.stop();
    ringer = null;
    for (const pc of peers.values()) pc.close();
    peers.clear();
    pendingCandidates.clear();
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    local.value = null;
    streams.value = {};
    people.value = {};
    clearTimeout(endTimer);
    if (call.value && reason) {
      // Mostra "Chamada encerrada / perdida / recusada" por um instante antes de sumir.
      call.value.status = 'ended';
      call.value.endedReason = reason;
      endTimer = setTimeout(() => (call.value = null), 1800);
    } else call.value = null;
  }

  function personFromChat(userId: string): CallPerson {
    const chat = useChat();
    for (const conv of [...chat.conversations.value, ...chat.archivedConversations.value]) {
      const p = conv.participants.find((x) => x.userId === userId);
      if (p) return { id: userId, displayName: p.user.displayName, avatarUrl: p.user.avatarUrl };
    }
    return { id: userId, displayName: 'Participante' };
  }

  function addPerson(person: CallPerson) {
    const known = personFromChat(person.id);
    // O nome que você salvou nos contatos vale mais que o nome do perfil.
    const displayName = known.displayName !== 'Participante' ? known.displayName : person.displayName;
    people.value = { ...people.value, [person.id]: { ...person, ...known, displayName, avatarUrl: person.avatarUrl ?? known.avatarUrl, connected: false } };
  }

  // ---- Ações ----

  async function startCall(target: { conversationId: string } | { userIds: string[] }, video: boolean) {
    if (call.value && call.value.status !== 'ended') return;
    error.value = '';
    try {
      await getLocalMedia(video);
    } catch {
      error.value = video ? 'Não foi possível usar a câmera e o microfone.' : 'Não foi possível usar o microfone.';
      return;
    }
    const res = await emit<{ callId: string; conversationId: string | null }>('call:start', { ...target, video });
    if (!res.ok) {
      error.value = res.error ?? 'Não foi possível ligar';
      cleanup();
      return;
    }
    const group = 'userIds' in target ? target.userIds.length > 1 : false;
    call.value = { id: res.callId, conversationId: res.conversationId, video, group, status: 'outgoing' };
    // Quem vai ser chamado aparece já na tela (nome/foto), antes de atender.
    const chat = useChat();
    const conv = 'conversationId' in target ? chat.findConversation(target.conversationId) : null;
    const ids = conv ? conv.participants.map((p) => p.userId).filter((id) => id !== useAuth().me.value?.id) : 'userIds' in target ? target.userIds : [];
    if (conv) call.value.group = conv.type === 'GROUP';
    ids.forEach((id) => addPerson(personFromChat(id)));
    ringer = startTone('outgoing');
  }

  /** Atende a chamada recebida (ou entra por link). Quem entra manda oferta para quem já está. */
  async function join(callId: string, video: boolean) {
    error.value = '';
    try {
      await getLocalMedia(video);
    } catch {
      error.value = 'Não foi possível usar o microfone' + (video ? ' e a câmera.' : '.');
      if (call.value?.status === 'incoming') await decline();
      return;
    }
    ringer?.stop();
    ringer = null;
    const res = await emit<{ callId: string; conversationId: string | null; video: boolean; participants: string[]; people: CallPerson[] }>(
      'call:join',
      { callId },
    );
    if (!res.ok) {
      error.value = res.error ?? 'Não foi possível entrar na ligação';
      cleanup();
      return;
    }
    call.value = {
      ...(call.value ?? { group: res.participants.length > 1 }),
      id: res.callId,
      conversationId: res.conversationId,
      video: res.video && video,
      status: res.participants.length ? 'connecting' : 'active',
      startedAt: res.participants.length ? undefined : Date.now(),
    } as CallState;
    res.people.forEach(addPerson);
    for (const id of res.participants) await offerTo(id);
  }

  const accept = (video: boolean) => (call.value ? join(call.value.id, video) : Promise.resolve());

  async function decline() {
    if (!call.value) return;
    await emit('call:decline', { callId: call.value.id });
    cleanup();
  }

  async function hangup() {
    if (!call.value) return;
    if (call.value.status === 'incoming') return decline();
    await emit('call:leave', { callId: call.value.id });
    cleanup('ended');
  }

  function toggleMute() {
    if (noMic.value) return;
    muted.value = !muted.value;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted.value));
  }

  function toggleCamera() {
    cameraOff.value = !cameraOff.value;
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff.value));
  }

  /** "Enviar link de ligação": cria o link e manda na conversa. */
  async function sendCallLink(conversationId: string, video = true) {
    const res = await api<{ link: { id: string } }>('/calls/links', { method: 'POST', body: { conversationId, video } });
    const url = `${location.origin}/?call=${res.link.id}`;
    useChat().send(conversationId, `${video ? '📹 Ligação de vídeo' : '📞 Ligação de voz'} — toque para entrar: ${url}`);
  }

  return { call, people, streams, local, muted, cameraOff, error, noMic, noCamera, startCall, accept, join, decline, hangup, toggleMute, toggleCamera, sendCallLink, cleanup, onSignal, addPerson, removePeer };
}

/** Liga os eventos de chamada no socket (chamado uma vez, ao conectar). */
export function bindCallListeners(s: Socket) {
  if (boundSocket === s) return;
  boundSocket = s;
  const c = useCall();

  s.on('call:incoming', (p: { callId: string; conversationId: string | null; video: boolean; group: boolean; from: CallPerson }) => {
    // A mesma ligação de novo (reconectou enquanto tocava): já está na tela, não é "ocupado".
    if (c.call.value?.id === p.callId) return;
    // Já em outra ligação: recusa (ocupado).
    if (c.call.value && c.call.value.status !== 'ended') {
      s.emit('call:decline', { callId: p.callId }, () => {});
      return;
    }
    clearTimeout(endTimer);
    c.addPerson(p.from);
    const from = { ...p.from, displayName: c.people.value[p.from.id]?.displayName ?? p.from.displayName };
    c.call.value = { id: p.callId, conversationId: p.conversationId, video: p.video, group: p.group, status: 'incoming', from };
    ringer?.stop();
    ringer = startTone('incoming');
  });

  s.on('call:peer-joined', (p: { callId: string; userId: string; user?: CallPerson }) => {
    if (c.call.value?.id !== p.callId) return;
    c.addPerson(p.user ?? { id: p.userId, displayName: 'Participante' });
    if (c.call.value.status === 'outgoing') c.call.value.status = 'connecting';
    ringer?.stop();
    ringer = null;
    // Quem entrou vai mandar a oferta; aqui só esperamos.
  });

  s.on('call:signal', (p) => void c.onSignal(p).catch(() => {}));

  s.on('call:peer-left', (p: { callId: string; userId: string }) => {
    if (c.call.value?.id === p.callId) c.removePeer(p.userId);
  });

  s.on('call:ended', (p: { callId: string; reason: 'ended' | 'missed' | 'declined' }) => {
    if (c.call.value?.id !== p.callId) return;
    // Quem recusou não precisa ver "recusada".
    if (c.call.value.status === 'incoming') c.cleanup();
    else c.cleanup(p.reason);
  });

  s.on('call:answered-elsewhere', (p: { callId: string; socketId: string }) => {
    if (c.call.value?.id === p.callId && c.call.value.status === 'incoming' && p.socketId !== s.id) c.cleanup();
  });
}
