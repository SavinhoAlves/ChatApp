import { Capacitor } from '@capacitor/core';

// Bloqueio do app (Configurações › Privacidade), como no WhatsApp: ao abrir (ou voltar depois do tempo
// escolhido) pede o Face ID/digital do celular. O PIN do app é opcional (alternativa, ou o único meio
// em aparelho sem biometria). Tudo fica só neste aparelho.
// App Android: biometria nativa. iPhone/navegador: o Face ID/Touch ID do próprio navegador (WebAuthn).
// Atenção: no iPhone o Face ID só pode ser pedido logo depois de um toque; por isso as funções que o
// pedem são chamadas direto do clique, sem nada demorado antes.

type LockSettings = {
  enabled: boolean;
  biometric: boolean;
  /** Id da credencial do navegador (WebAuthn) usada para pedir o Face ID/Touch ID. */
  credentialId?: string;
  /** PIN opcional (guardado só como hash). */
  salt?: string;
  pinHash?: string;
  pinLength?: number;
  /** Depois de quantos segundos fora do app ele volta bloqueado. 0 = sempre. */
  after: number;
};

const KEY = 'zynko.lock';
const MAX_TRIES = 5;

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toB64(await crypto.subtle.digest('SHA-256', data));
}

function load(): LockSettings | null {
  const s = readCache<LockSettings>(KEY);
  // Bloqueio sem nenhum meio de desbloquear (dado antigo/corrompido): ignora.
  return s?.enabled && (s.biometric || s.pinHash) ? s : null;
}

export const isAndroidApp = () => isNativeApp() && Capacitor.getPlatform() === 'android';

export function useAppLock() {
  const settings = useState<LockSettings | null>('lock.settings', () => (import.meta.client ? load() : null));
  // Começa bloqueado se o bloqueio estiver ligado.
  const locked = useState('lock.locked', () => !!settings.value);
  const tries = useState('lock.tries', () => 0);
  const waitUntil = useState('lock.waitUntil', () => 0);
  const hasPin = computed(() => !!settings.value?.pinHash);

  function save(s: LockSettings | null) {
    settings.value = s;
    writeCache(KEY, s);
  }

  /** Este aparelho tem Face ID/digital que dá para usar? */
  async function biometricAvailable(): Promise<boolean> {
    try {
      if (isAndroidApp()) {
        const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
        // useFallback: conta também o PIN/padrão/senha do celular (aparelho sem digital/rosto).
        return (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable;
      }
      return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      return false;
    }
  }

  /** Pede o Face ID/digital. true = é o dono. */
  async function verifyBiometric(credentialId = settings.value?.credentialId): Promise<boolean> {
    try {
      if (isAndroidApp()) {
        const { NativeBiometric, BiometryType } = await import('@capgo/capacitor-native-biometric');
        // Qualquer biometria do aparelho (digital, rosto, íris) ou o PIN/padrão/senha da tela de bloqueio.
        await NativeBiometric.verifyIdentity({
          title: 'Desbloquear o Zynko',
          reason: 'Desbloquear o Zynko',
          allowedBiometryTypes: [BiometryType.MULTIPLE, BiometryType.DEVICE_CREDENTIAL],
        });
        return true;
      }
      if (!credentialId) return false;
      const res = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: fromB64(credentialId) }],
          userVerification: 'required',
          timeout: 60_000,
        },
      });
      return !!res;
    } catch {
      return false;
    }
  }

  /** Navegador/iPhone: cria a credencial que depois pede o Face ID/Touch ID (já pede o Face ID uma vez). */
  async function createWebCredential(): Promise<string | null> {
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Zynko', id: location.hostname },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Bloqueio do Zynko', displayName: 'Bloqueio do Zynko' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      return cred ? toB64(cred.rawId) : null;
    } catch {
      return null;
    }
  }

  /** Liga o Face ID/digital (chamar direto do toque). Liga o bloqueio se ainda não estava. */
  async function enableBiometric(): Promise<boolean> {
    let credentialId: string | undefined;
    if (isAndroidApp()) {
      if (!(await verifyBiometric())) return false;
    } else {
      credentialId = (await createWebCredential()) ?? undefined;
      if (!credentialId) return false;
    }
    const s = settings.value;
    save({ ...(s ?? { after: 0 }), enabled: true, biometric: true, credentialId: credentialId ?? s?.credentialId });
    return true;
  }

  /** Desliga só o Face ID/digital (precisa de PIN para o bloqueio continuar). */
  function disableBiometric() {
    const s = settings.value;
    if (!s) return;
    if (!s.pinHash) save(null);
    else save({ ...s, biometric: false, credentialId: undefined });
  }

  /** Cria ou troca o PIN. Liga o bloqueio se ainda não estava. */
  async function setPin(pin: string) {
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const s = settings.value;
    save({ ...(s ?? { after: 0, biometric: false }), enabled: true, salt, pinHash: await hashPin(pin, salt), pinLength: pin.length });
  }

  /** Remove o PIN (só se o Face ID/digital estiver ligado; senão desliga o bloqueio). */
  function removePin() {
    const s = settings.value;
    if (!s) return;
    if (!s.biometric) save(null);
    else save({ ...s, salt: undefined, pinHash: undefined, pinLength: undefined });
  }

  function disable() {
    save(null);
    locked.value = false;
  }

  function update(patch: Partial<Pick<LockSettings, 'after'>>) {
    if (settings.value) save({ ...settings.value, ...patch });
  }

  async function checkPin(pin: string) {
    const s = settings.value;
    if (!s?.pinHash || !s.salt) return false;
    if (Date.now() < waitUntil.value) return false;
    if ((await hashPin(pin, s.salt)) === s.pinHash) {
      tries.value = 0;
      return true;
    }
    tries.value++;
    // Muitas tentativas erradas: espera 30 s antes de tentar de novo.
    if (tries.value >= MAX_TRIES) {
      tries.value = 0;
      waitUntil.value = Date.now() + 30_000;
    }
    return false;
  }

  async function unlockWithPin(pin: string) {
    const ok = await checkPin(pin);
    if (ok) locked.value = false;
    return ok;
  }

  async function unlockWithBiometric() {
    if (!settings.value?.biometric) return false;
    const ok = await verifyBiometric();
    if (ok) locked.value = false;
    return ok;
  }

  return {
    settings,
    locked,
    waitUntil,
    hasPin,
    biometricAvailable,
    verifyBiometric,
    enableBiometric,
    disableBiometric,
    setPin,
    removePin,
    disable,
    update,
    checkPin,
    unlockWithPin,
    unlockWithBiometric,
  };
}
