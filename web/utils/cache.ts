// Cópia local (perfil, lista de conversas) para o app abrir na hora, antes de o servidor responder.
export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem espaço ou armazenamento bloqueado: só não guarda */
  }
}

export function clearCaches() {
  writeCache('zynko.me', null);
  writeCache('zynko.conversations', null);
}
