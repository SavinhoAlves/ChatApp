export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva (bloquear, apagar, sair...): deixa o botão de confirmar e o ícone em vermelho. */
  danger?: boolean;
}

export interface AlertOptions {
  title?: string;
  message: string;
  okLabel?: string;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  value?: string;
  confirmLabel?: string;
  maxLength?: number;
  /** Campo de senha/PIN: esconde o que é digitado. */
  secret?: boolean;
  /** Abre o teclado numérico no celular. */
  numeric?: boolean;
}

type ConfirmModal = { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void };
type PromptModal = { kind: 'prompt'; options: PromptOptions & { message: string }; resolve: (ok: boolean) => void };
type AlertModal = { kind: 'alert'; options: AlertOptions; resolve: (ok: boolean) => void };

/**
 * Substitui window.confirm/window.alert por um modal no estilo do app. Um único <ConfirmDialog>
 * montado em app.vue cuida da renderização; aqui só pedimos ("confirm"/"alert") e esperamos a resposta.
 */
export function useConfirm() {
  const modal = useState<ConfirmModal | AlertModal | PromptModal | null>('confirm.modal', () => null);
  const promptValue = useState('confirm.promptValue', () => '');

  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      modal.value = { kind: 'confirm', options: opts, resolve };
    });
  }

  function alert(options: AlertOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      modal.value = { kind: 'alert', options: opts, resolve };
    });
  }

  /** Pede um texto (ex.: nome de lista). Resolve com o texto ou null se cancelar. */
  function prompt(options: PromptOptions): Promise<string | null> {
    promptValue.value = options.value ?? '';
    return new Promise((resolve) => {
      modal.value = {
        kind: 'prompt',
        options: { ...options, message: options.message ?? '' },
        resolve: (ok) => resolve(ok && promptValue.value.trim() ? promptValue.value.trim() : null),
      };
    });
  }

  function settle(ok: boolean) {
    const current = modal.value;
    if (!current) return;
    modal.value = null;
    current.resolve(ok);
  }

  return { modal, promptValue, confirm, alert, prompt, settle };
}
