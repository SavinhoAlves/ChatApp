/**
 * Gravação de mensagem de voz, estilo WhatsApp: mede o volume do microfone em tempo real (as "ondas"
 * que acompanham a voz) e escolhe o formato que o aparelho grava (WebM/Opus no Android e Chrome,
 * MP4/AAC no iPhone), para o arquivo sair com a extensão certa.
 */
const BAR_COUNT = 34;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

const extFor = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

export function useVoiceRecorder() {
  const recording = ref(false);
  /** Travada: continua gravando sem segurar o botão (arrastou para cima ou tocou rápido). */
  const locked = ref(false);
  const seconds = ref(0);
  /** Pausada (gravação travada): o tempo e as ondas param até continuar. */
  const paused = ref(false);
  /** Volume recente (0 a 1) para desenhar as ondas ao vivo. */
  const levels = ref<number[]>(Array(BAR_COUNT).fill(0.05));

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: BlobPart[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let audioCtx: AudioContext | null = null;
  let raf = 0;
  let startedAt = 0;
  // Tempo já gravado antes da última pausa.
  let accumulated = 0;
  const elapsed = () => accumulated + (paused.value ? 0 : Date.now() - startedAt);

  function cleanup() {
    clearInterval(timer);
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    void audioCtx?.close().catch(() => {});
    audioCtx = null;
    recording.value = false;
    locked.value = false;
    paused.value = false;
    levels.value = Array(BAR_COUNT).fill(0.05);
  }

  function meter(source: MediaStream) {
    try {
      audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(source).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (now - last < 80 || paused.value) return;
        last = now;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        // Realça a voz (o silêncio fica baixinho, a fala sobe bem).
        levels.value = [...levels.value.slice(1), Math.min(1, Math.max(0.05, peak * 2.4))];
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // Sem Web Audio: grava normalmente, só sem as ondas.
    }
  }

  /** Começa a gravar. Devolve false se não deu acesso ao microfone. */
  async function start() {
    if (recording.value) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      return false;
    }
    const mime = pickMime();
    // 64 kbps: voz bem clara (Opus/AAC) sem arquivo pesado.
    recorder = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 64_000 });
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(250);
    startedAt = Date.now();
    accumulated = 0;
    paused.value = false;
    seconds.value = 0;
    recording.value = true;
    timer = setInterval(() => (seconds.value = Math.floor(elapsed() / 1000)), 250);
    meter(stream);
    return true;
  }

  /** Para. Com send=true devolve o arquivo (ou null se ficou curto demais); com false, descarta. */
  function stop(send: boolean): Promise<{ blob: Blob; ext: string } | null> {
    const rec = recorder;
    recorder = null;
    if (!rec || !recording.value) {
      cleanup();
      return Promise.resolve(null);
    }
    const tooShort = elapsed() < 600;
    if (rec.state === 'paused') rec.resume();
    return new Promise((resolve) => {
      rec.addEventListener(
        'stop',
        () => {
          const type = rec.mimeType || 'audio/webm';
          cleanup();
          if (!send || tooShort || chunks.length === 0) return resolve(null);
          resolve({ blob: new Blob(chunks, { type }), ext: extFor(type) });
        },
        { once: true },
      );
      rec.stop();
    });
  }

  /** Pausar / continuar a gravação travada (como no WhatsApp). */
  function togglePause() {
    if (!recorder || !recording.value) return;
    if (paused.value) {
      recorder.resume();
      startedAt = Date.now();
      paused.value = false;
    } else {
      recorder.pause();
      accumulated += Date.now() - startedAt;
      paused.value = true;
    }
  }

  const label = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`);

  onBeforeUnmount(() => {
    if (recording.value) void stop(false);
  });

  return { recording, locked, paused, seconds, levels, label, start, stop, togglePause };
}
