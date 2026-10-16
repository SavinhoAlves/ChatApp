// iPhone: ao abrir o teclado o Safari não diminui a altura da tela; ele empurra a página inteira para
// cima (o topo da conversa sumia) e mantém o espaço da barra de início (faixa preta acima do teclado).
// Aqui o app passa a ter exatamente a altura visível acima do teclado e a página não rola.
export default defineNuxtPlugin(() => {
  if (uiPlatform() !== 'ios' || !window.visualViewport) return;
  const vv = window.visualViewport;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    // Teclado aberto: a área visível fica bem menor que a janela.
    root.classList.toggle('kb-open', window.innerHeight - vv.height > 120);
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
});
