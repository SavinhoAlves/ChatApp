export interface ChatList {
  id: string;
  name: string;
  conversationIds: string[];
}

/** Listas personalizadas de conversas (Família, Trabalho…), com os filtros do topo da lista. */
export function useLists() {
  const { api } = useAuth();
  const lists = useState<ChatList[]>('lists', () => []);
  const loaded = useState('lists.loaded', () => false);

  async function loadLists() {
    lists.value = (await api<{ lists: ChatList[] }>('/lists')).lists;
    loaded.value = true;
  }

  async function createList(name: string, conversationIds: string[] = []) {
    const res = await api<{ list: ChatList }>('/lists', { method: 'POST', body: { name, conversationIds } });
    lists.value = [...lists.value, res.list];
    return res.list;
  }

  async function renameList(id: string, name: string) {
    const res = await api<{ list: ChatList }>(`/lists/${id}`, { method: 'PATCH', body: { name } });
    lists.value = lists.value.map((l) => (l.id === id ? res.list : l));
  }

  async function deleteList(id: string) {
    await api(`/lists/${id}`, { method: 'DELETE' });
    lists.value = lists.value.filter((l) => l.id !== id);
  }

  async function toggleInList(listId: string, conversationId: string) {
    const list = lists.value.find((l) => l.id === listId);
    if (!list) return;
    const inside = list.conversationIds.includes(conversationId);
    if (inside) await api(`/lists/${listId}/items/${conversationId}`, { method: 'DELETE' });
    else await api(`/lists/${listId}/items`, { method: 'POST', body: { conversationId } });
    list.conversationIds = inside ? list.conversationIds.filter((id) => id !== conversationId) : [...list.conversationIds, conversationId];
  }

  function reset() {
    lists.value = [];
    loaded.value = false;
  }

  return { lists, loaded, loadLists, createList, renameList, deleteList, toggleInList, reset };
}
