const PREFS_KEY = 'chat.prefs';

export type Wallpaper = 'doodle' | 'bolhas' | 'ondas' | 'pontos' | 'constelacao' | 'nenhum';

export const WALLPAPERS: { id: Wallpaper; label: string }[] = [
  { id: 'doodle', label: 'Rabiscos' },
  { id: 'bolhas', label: 'Bolhas' },
  { id: 'ondas', label: 'Ondas' },
  { id: 'pontos', label: 'Pontos' },
  { id: 'constelacao', label: 'Constelação' },
  { id: 'nenhum', label: 'Sem papel de parede' },
];

/** Cor do app inteiro (destaques, brilhos e fundo). Roxo segue o estilo do print de referência. */
export type AppColor = 'turquesa' | 'roxo' | 'azul' | 'rosa';
export const APP_COLORS: { id: AppColor; label: string; rgb: string }[] = [
  { id: 'turquesa', label: 'Turquesa', rgb: '45 212 191' },
  { id: 'roxo', label: 'Roxo', rgb: '168 85 247' },
  { id: 'azul', label: 'Azul', rgb: '56 189 248' },
  { id: 'rosa', label: 'Rosa', rgb: '244 114 182' },
];

/** Cores das suas mensagens em "Tema da conversa" (rgb usado no balão). "app" acompanha a cor do app. */
export const CHAT_COLORS: { id: string; label: string; rgb: string }[] = [
  { id: 'app', label: 'Cor do app', rgb: 'var(--accent-rgb)' },
  { id: 'turquesa', label: 'Turquesa', rgb: '45 212 191' },
  { id: 'azul', label: 'Azul', rgb: '56 189 248' },
  { id: 'roxo', label: 'Roxo', rgb: '167 139 250' },
  { id: 'rosa', label: 'Rosa', rgb: '244 114 182' },
  { id: 'laranja', label: 'Laranja', rgb: '251 146 60' },
  { id: 'amarelo', label: 'Amarelo', rgb: '250 204 21' },
  { id: 'verde', label: 'Verde', rgb: '74 222 128' },
];

export interface ConversationTheme {
  color?: string;
  wallpaper?: Wallpaper;
}

export interface Prefs {
  /** Enter envia a mensagem (Shift+Enter quebra linha). Desligado: Enter quebra linha. */
  enterToSend: boolean;
  /** Fundo da conversa (arquivos em public/wallpapers). */
  wallpaper: Wallpaper;
  /** "Tema da conversa": cor e papel de parede próprios de uma conversa. */
  conversationThemes: Record<string, ConversationTheme>;
  /** Cor do app inteiro. */
  appColor: AppColor;
}

// Padrão: verde-água, a cor da logo do Zynko.
const defaults: Prefs = { enterToSend: true, wallpaper: 'doodle', conversationThemes: {}, appColor: 'turquesa' };
// Por um tempo o padrão foi roxo e pode ter ficado salvo sem a pessoa escolher: volta uma vez para o da logo.
const COLOR_FIX_KEY = 'zynko.colorFix';

function read(): Prefs {
  if (!import.meta.client) return { ...defaults };
  try {
    const stored = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } as Prefs;
    if (!localStorage.getItem(COLOR_FIX_KEY)) {
      localStorage.setItem(COLOR_FIX_KEY, '1');
      if (stored.appColor === 'roxo') {
        stored.appColor = 'turquesa';
        localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
      }
    }
    return stored;
  } catch {
    return { ...defaults };
  }
}

/** Preferências deste aparelho (ficam no navegador, não vão para o servidor). */
export function usePrefs() {
  const prefs = useState<Prefs>('prefs', read);

  function save() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.value));
    } catch {
      // Sem armazenamento (aba anônima, bloqueado): vale só nesta sessão.
    }
  }

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    prefs.value = { ...prefs.value, [key]: value };
    save();
  }

  function setConversationTheme(conversationId: string, theme: ConversationTheme | null) {
    const themes = { ...prefs.value.conversationThemes };
    if (theme && (theme.color || theme.wallpaper)) themes[conversationId] = theme;
    else delete themes[conversationId];
    setPref('conversationThemes', themes);
  }

  /** Tema efetivo de uma conversa: o dela, ou o padrão do aparelho. */
  function themeFor(conversationId: string) {
    const t = prefs.value.conversationThemes[conversationId] ?? {};
    const color = CHAT_COLORS.find((c) => c.id === t.color) ?? CHAT_COLORS[0]!;
    return { rgb: color.rgb, wallpaper: t.wallpaper ?? prefs.value.wallpaper };
  }

  /** Estilo (variáveis CSS) do papel de parede: vira máscara pintada com a cor do app (classe .wp). */
  function wallpaperStyle(id: Wallpaper | undefined) {
    return id && id !== 'nenhum' ? { '--wp': `url(/wallpapers/${id}.svg)` } : {};
  }

  return { prefs, setPref, setConversationTheme, themeFor, wallpaperStyle };
}
