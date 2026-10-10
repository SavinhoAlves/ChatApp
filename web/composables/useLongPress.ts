/**
 * Toque longo no celular (e clique direito no computador) abre o menu de um item, como no WhatsApp.
 * O iOS não dispara "contextmenu" ao segurar, por isso o temporizador próprio nos eventos de toque.
 */
export function useLongPress(onPress: (point: { x: number; y: number }) => void, { delay = 450, rightClick = true } = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  // Depois de um toque longo o navegador ainda manda o "click": ele não pode abrir a conversa/mensagem.
  let fired = false;

  function cancel() {
    clearTimeout(timer);
    start = null;
  }

  function fire(point: { x: number; y: number }) {
    cancel();
    fired = true;
    navigator.vibrate?.(12);
    onPress(point);
  }

  return {
    onTouchstart(e: TouchEvent) {
      fired = false;
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return cancel();
      start = { x: t.clientX, y: t.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => start && fire(start), delay);
    },
    onTouchmove(e: TouchEvent) {
      const t = e.touches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
    },
    onTouchend: cancel,
    onTouchcancel: cancel,
    onContextmenu(e: MouseEvent) {
      // rightClick=false: no computador o clique direito continua sendo o menu do navegador (copiar texto).
      const duringTouch = fired || start !== null;
      if (!rightClick && !duringTouch) return;
      e.preventDefault();
      if (fired) return;
      fire({ x: e.clientX, y: e.clientY });
    },
    /** Use no @click: true quando o clique é só o fim de um toque longo e deve ser ignorado. */
    consumeClick() {
      const was = fired;
      fired = false;
      return was;
    },
  };
}
