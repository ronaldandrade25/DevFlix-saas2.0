// PWA: registra o service worker, abre direto no login quando instalado e cuida do botão "Instalar app"

export const emModoApp = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let registro;
export function registrarSW() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  registro ||= navigator.serviceWorker.register("sw.js").catch((e) => {
    console.error("Service worker:", e);
    return null;
  });
  return registro;
}
registrarSW();

// App instalado: a página inicial do site de vendas vira a tela de login
if (emModoApp() && /(^|\/)(index\.html)?$/.test(location.pathname)) location.replace("login.html");

let eventoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  document.dispatchEvent(new CustomEvent("pwa-instalavel"));
});
window.addEventListener("appinstalled", () => {
  eventoInstalar = null;
  document.querySelectorAll("[data-instalar]").forEach((b) => b.classList.add("hidden"));
});

// Liga os botões [data-instalar]: Android/Chrome abre o instalador; iPhone mostra o passo a passo
export function ligarBotoesInstalar() {
  document.querySelectorAll("[data-instalar]").forEach((btn) => {
    if (emModoApp()) return btn.classList.add("hidden");
    btn.classList.remove("hidden");
    btn.addEventListener("click", async () => {
      if (eventoInstalar) {
        eventoInstalar.prompt();
        await eventoInstalar.userChoice.catch(() => {});
        eventoInstalar = null;
      } else if (ehIOS()) {
        alert('Para instalar no iPhone/iPad:\n\n1. Abra este site no Safari\n2. Toque no botão Compartilhar (quadrado com seta)\n3. Escolha "Adicionar à Tela de Início"\n4. Toque em "Adicionar"');
      } else {
        alert('Para instalar: abra o menu do navegador (⋮) e escolha "Instalar app" ou "Adicionar à tela inicial".');
      }
    });
  });
}
