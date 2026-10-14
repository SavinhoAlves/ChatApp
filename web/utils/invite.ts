export interface PendingContact {
  id: string;
  phone: string;
  displayName: string;
  createdAt: string;
}

/** Texto do convite ("Convidar para o Zynko"). */
export function inviteText(name?: string) {
  const hi = name ? `Oi, ${name.split(' ')[0]}!` : 'Oi!';
  return `${hi} Vamos conversar pelo Zynko? É só entrar com seu número em ${location.origin}`;
}

/**
 * Compartilha o convite: no celular abre a folha de compartilhar (WhatsApp, SMS, e-mail…);
 * no computador copia o texto. Devolve o que aconteceu, para a tela avisar.
 */
export async function shareInvite(name?: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = inviteText(name);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Convite para o Zynko', text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
