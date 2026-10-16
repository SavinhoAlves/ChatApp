import { Capacitor } from '@capacitor/core';

// Bloqueio do app (Configurações › Privacidade), como no WhatsApp: ao abrir (ou voltar depois do tempo
// escolhido) pede a digital/rosto do celular; o PIN do app é a alternativa. Tudo fica só neste aparelho.
// App Android: biometria nativa. iPhone/navegador: o Face ID/Touch ID do próprio navegador (WebAuthn).

type LockSettings = {
  enabled: boolean;
  salt: string;
  pinHash: string;
  pinLength: number;
  biometric: boolean;
  /** Id da credencial do navegador (WebAuthn) usada para pedir o Face ID/Touch ID. */
  credentialId?: string;
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
  return s?.enabled ? s : null;
}

const isAndroidApp = () => isNativeApp() && Capacitor.getPlatform() === 'android';

export function useAppLock() {
  const settings = useState<LockSettings | null>('lock.settings', () => (import.meta.client ? load() : null));
  // Começa bloqueado se o bloqueio estiver ligado.
  const locked = useState('lock.locked', () => !!settings.value);
  const tries = useState('lock.tries', () => 0);
  const waitUntil = useState('lock.waitUntil', () => 0);

  function save(s: LockSettings | null) {
    settings.value = s;
    writeCache(KEY, s);
  }

  /** Este aparelho tem digital/rosto que dá para usar? */
  async function biometricAvailable(): Promise<boolean> {
    try {
      if (isAndroidApp()) {
        const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
        return (await NativeBiometric.isAvailable()).isAvailable;
      }
      return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      return false;
    }
  }

  /** Pede a digital/rosto. true = é o dono. */
  async function verifyBiometric(): Promise<boolean> {
    const s = settings.value;
    try {
      if (isAndroidApp()) {
        const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
        await NativeBiometric.verifyIdentity({ title: 'Desbloquear o Zynko', reason: 'Desbloquear o Zynko', negativeButtonText: 'Usar PIN' });
        return true;
      }
      if (!s?.credentialId) return false;
      const res = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: fromB64(s.credentialId) }],
          userVerification: 'required',
          timeout: 60_000,
        },
      });
      return !!res;
    } catch {
      return false;
    }
  }

  /** Navegador/iPhone: cria a credencial que depois pede o Face ID/Touch ID. */
  async function createWebCredential(): Promise<string | null> {
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Zynko', id: location.hostname },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'zynko-lock', displayName: 'Bloqueio do Zynko' },
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

  async function enable(pin: string, withBiometric: boolean, after = 0) {
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
    let biometric = false;
    let credentialId: string | undefined;
    if (withBiometric) {
      if (isAndroidApp()) biometric = await verifyBiometric();
      else {
        credentialId = (await createWebCredential()) ?? undefined;
        biometric = !!credentialId;
      }
    }
    save({ enabled: true, salt, pinHash: await hashPin(pin, salt), pinLength: pin.length, biometric, credentialId, after });
    return biometric;
  }

  function disable() {
    save(null);
    locked.value = false;
  }

  function update(patch: Partial<Pick<LockSettings, 'after' | 'biometric'>>) {
    if (settings.value) save({ ...settings.value, ...patch });
  }

  async function setBiometric(on: boolean) {
    const s = settings.value;
    if (!s) return false;
    if (!on) {
      update({ biometric: false });
      return false;
    }
    if (isAndroidApp()) {
      const ok = await verifyBiometric();
      update({ biometric: ok });
      return ok;
    }
    const credentialId = await createWebCredential();
    if (credentialId) save({ ...s, biometric: true, credentialId });
    return !!credentialId;
  }

  async function checkPin(pin: string) {
    const s = settings.value;
    if (!s) return true;
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
    biometricAvailable,
    enable,
    disable,
    update,
    setBiometric,
    checkPin,
    unlockWithPin,
    unlockWithBiometric,
  };
}
