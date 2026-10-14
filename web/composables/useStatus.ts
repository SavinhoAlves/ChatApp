export interface StatusItem {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO';
  text: string | null;
  background: string | null;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  /** Meus: quantas pessoas viram. */
  views?: number;
  /** Dos outros: se eu já vi. */
  viewed?: boolean;
}

export interface StatusAuthor {
  user: { id: string; displayName: string; avatarUrl: string | null };
  statuses: StatusItem[];
  allViewed: boolean;
}

/** Status ("Atualizações"): lista, criar, ver e apagar. Atualiza sozinho quando alguém publica. */
export function useStatus() {
  const { api, upload } = useAuth();
  const mine = useState<StatusItem[]>('status.mine', () => []);
  const others = useState<StatusAuthor[]>('status.others', () => []);
  const loaded = useState('status.loaded', () => false);

  async function load() {
    const res = await api<{ mine: StatusItem[]; others: StatusAuthor[] }>('/status');
    mine.value = res.mine;
    others.value = res.others;
    loaded.value = true;
  }

  async function postText(text: string, background: string) {
    await api('/status', { method: 'POST', body: { type: 'TEXT', text, background } });
    await load();
  }

  async function postMedia(file: Blob, name: string, caption?: string) {
    const att = await upload(file, name);
    const type = att.type === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    await api('/status', { method: 'POST', body: { type, mediaUrl: att.url, text: caption || null } });
    await load();
  }

  async function markViewed(author: StatusAuthor, status: StatusItem) {
    if (status.viewed) return;
    status.viewed = true;
    author.allViewed = author.statuses.every((s) => s.viewed);
    await api(`/status/${status.id}/view`, { method: 'POST' }).catch(() => {});
  }

  async function remove(id: string) {
    await api(`/status/${id}`, { method: 'DELETE' });
    mine.value = mine.value.filter((s) => s.id !== id);
  }

  const viewers = (id: string) =>
    api<{ viewers: { id: string; displayName: string; avatarUrl: string | null; viewedAt: string }[] }>(`/status/${id}/viewers`);

  return { mine, others, loaded, load, postText, postMedia, markViewed, remove, viewers };
}
