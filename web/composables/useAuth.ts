import type { Attachment, User } from '~/types';

const TOKEN_KEY = 'chat.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
};

/** Guarda (ou apaga) o login no armazenamento nativo do app. No navegador não faz nada. */
async function saveNativeToken(value: string | null) {
  if (!isNativeApp()) return;
  const { Preferences } = await import('@capacitor/preferences');
  if (value) await Preferences.set({ key: TOKEN_KEY, value });
  else await Preferences.remove({ key: TOKEN_KEY });
}

export function useAuth() {
  const token = useState<string | null>('auth.token', () =>
    import.meta.client ? localStorage.getItem(TOKEN_KEY) : null,
  );
  const me = useState<User | null>('auth.me', () => null);

  function setToken(value: string | null) {
    token.value = value;
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
    // App nativo: cópia no armazenamento do Android/iPhone (fora do navegador interno), ver plugins/session.client.ts.
    void saveNativeToken(value);
  }

  async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await $fetch<T>(`/api${path}`, {
        method: options.method ?? 'GET',
        body: options.body as Record<string, unknown> | undefined,
        query: options.query,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : undefined,
      });
    } catch (error) {
      const e = error as { response?: { status?: number }; data?: { error?: string } };
      const status = e.response?.status ?? 0;
      // Sessão expirada ou token inválido: volta para o login.
      if (status === 401 && token.value) await logout();
      const fallback = status === 0 ? 'Sem conexão com o servidor' : 'Algo deu errado. Tente novamente.';
      throw new ApiError(status, e.data?.error ?? fallback);
    }
  }

  /** Envia uma foto/áudio/arquivo para o servidor antes de anexar a uma mensagem. */
  async function upload(file: File | Blob, filename?: string) {
    const form = new FormData();
    form.append('file', file, filename);
    try {
      const res = await $fetch<{ attachment: Attachment }>('/api/uploads', {
        method: 'POST',
        body: form,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : undefined,
      });
      return res.attachment;
    } catch (error) {
      const e = error as { response?: { status?: number }; data?: { error?: string } };
      const status = e.response?.status ?? 0;
      if (status === 401 && token.value) await logout();
      const fallback = status === 0 ? 'Sem conexão com o servidor' : status === 413 ? 'Arquivo maior que 20 MB' : 'Falha ao enviar arquivo';
      throw new ApiError(status, e.data?.error ?? fallback);
    }
  }

  /** Identifica este aparelho na lista de "dispositivos conectados". */
  function deviceInfo() {
    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return {
      deviceName: [standalone ? 'App' : browser, os].filter(Boolean).join(' · ').slice(0, 60),
      platform: mobile ? ('mobile' as const) : ('desktop' as const),
    };
  }

  function startSession(res: { token: string; user: User }) {
    setToken(res.token);
    me.value = res.user;
  }

  /** Passo 1: pede o código por SMS. Devolve o número já normalizado. */
  async function requestCode(phone: string, channel?: 'sms' | 'call') {
    return api<{ phone: string; channel: 'sms' | 'call' | 'admin'; canSms: boolean; canCall?: boolean; resendInSeconds: number; devCode?: string }>('/auth/phone/request', {
      method: 'POST',
      body: { phone, channel },
    });
  }

  /** Passo 2: confere o código. Número novo → { signupToken } para completar o perfil. */
  async function verifyCode(phone: string, code: string) {
    const res = await api<{ token?: string; user?: User; needsProfile?: boolean; signupToken?: string }>('/auth/phone/verify', {
      method: 'POST',
      body: { phone, code, device: deviceInfo() },
    });
    if (res.token && res.user) startSession({ token: res.token, user: res.user });
    return { needsProfile: !!res.needsProfile, signupToken: res.signupToken };
  }

  /** Passo 3 (só para número novo): nome e usuário. */
  async function completeProfile(input: { signupToken: string; displayName: string; businessCategory?: string }) {
    startSession(await api<{ token: string; user: User }>('/auth/phone/profile', { method: 'POST', body: { ...input, device: deviceInfo() } }));
  }

  /** Troca a foto de perfil (JPG, PNG ou WebP até 5 MB). */
  async function uploadAvatar(file: File | Blob) {
    const form = new FormData();
    form.append('file', file, file instanceof File ? file.name : 'avatar.jpg');
    try {
      const res = await $fetch<{ user: User }>('/api/me/avatar', {
        method: 'POST',
        body: form,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : undefined,
      });
      me.value = res.user;
    } catch (error) {
      const e = error as { response?: { status?: number }; data?: { error?: string } };
      throw new ApiError(e.response?.status ?? 0, e.data?.error ?? 'Não foi possível enviar a foto');
    }
  }

  /** Configurações > Perfil: trocar o nome. */
  async function updateProfile(input: { displayName: string }) {
    me.value = (await api<{ user: User }>('/me', { method: 'PATCH', body: input })).user;
  }

  async function removeAvatar() {
    me.value = (await api<{ user: User }>('/me/avatar', { method: 'DELETE' })).user;
  }

  /** Login por QR code (desktop): cria o pedido; o celular aprova depois. */
  const createQr = () => api<{ code: string; expiresAt: string }>('/auth/qr', { method: 'POST', body: deviceInfo() });

  /** Consulta o pedido de QR. Quando o celular aprova, já inicia a sessão. */
  async function pollQr(code: string): Promise<'pending' | 'approved' | 'expired'> {
    const res = await api<{ status: 'pending' | 'approved' | 'expired'; token?: string; user?: User }>('/auth/qr/status', {
      method: 'POST',
      body: { code },
    });
    if (res.status === 'approved' && res.token && res.user) startSession({ token: res.token, user: res.user });
    return res.status;
  }

  /** Recupera o usuário logado a partir do token salvo. Retorna false se a sessão não vale mais. */
  async function restore(): Promise<boolean> {
    if (!token.value) return false;
    if (me.value) return true;
    // Abre na hora com o perfil guardado da última vez; confirma com o servidor em segundo plano.
    const cached = readCache<User>('zynko.me');
    const refresh = api<{ user: User; token?: string }>('/me').then((res) => {
      me.value = res.user;
      writeCache('zynko.me', res.user);
      // O servidor troca tokens antigos (com validade) por um que vale até desconectar.
      if (res.token) setToken(res.token);
    });
    if (cached) {
      me.value = cached;
      refresh.catch(() => {}); // 401 já derruba a sessão dentro de api()
      return true;
    }
    try {
      await refresh;
      return true;
    } catch {
      // 401 já derrubou a sessão dentro de api(); sem conexão mantém o token para tentar de novo.
      return false;
    }
  }

  async function logout() {
    const old = token.value;
    useChat().reset();
    useLists().reset();
    useCall().cleanup();
    setToken(null);
    me.value = null;
    clearCaches();
    // Encerra a sessão no servidor (some da lista de dispositivos). Se falhar, o token expira sozinho.
    if (old) void $fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${old}` } }).catch(() => {});
    await navigateTo('/login');
  }

  /** Configurações › Conta › Excluir minha conta: apaga no servidor e sai deste aparelho. */
  async function deleteAccount() {
    await api('/me', { method: 'DELETE', body: { confirm: 'EXCLUIR' } });
    await logout();
  }

  return { token, me, api, upload, uploadAvatar, removeAvatar, updateProfile, requestCode, verifyCode, completeProfile, createQr, pollQr, restore, logout, deleteAccount };
}
