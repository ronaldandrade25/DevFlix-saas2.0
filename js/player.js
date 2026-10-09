// Player das aulas: o vídeo do YouTube roda por baixo de uma camada preta que bloqueia
// todos os cliques (título, logo, "assistir no YouTube", vídeos sugeridos).
// Os controles (play, barra, volume, velocidade, tela cheia) são nossos.

let apiPromise;
function carregarApiYoutube() {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ||= new Promise((resolve, reject) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("Não foi possível carregar o player."));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};

const VELOCIDADES = [1, 1.25, 1.5, 2, 0.75];

// Monta o player dentro de `container`. Retorna { destruir }.
export async function abrirVideo(container, ytId, { aoTerminar, autoplay = true } = {}) {
  container.innerHTML = `
    <div class="vp">
      <div class="vp-video"><div class="vp-yt"></div></div>
      <div class="vp-bloqueio" data-vp="bloqueio"></div>
      <div class="vp-topo"></div>
      <div class="vp-fim hidden"><button type="button" class="btn btn-red" data-vp="repetir"><i class="fa-solid fa-rotate-right"></i> Assistir novamente</button></div>
      <div class="vp-controles">
        <button type="button" class="vp-btn" data-vp="play" aria-label="Play/Pause"><i class="fa-solid fa-play"></i></button>
        <span class="vp-tempo" data-vp="tempo">0:00</span>
        <input type="range" class="vp-barra" data-vp="barra" min="0" max="1000" value="0" aria-label="Progresso" />
        <span class="vp-tempo" data-vp="duracao">0:00</span>
        <button type="button" class="vp-btn" data-vp="mudo" aria-label="Som"><i class="fa-solid fa-volume-high"></i></button>
        <button type="button" class="vp-btn vp-vel" data-vp="vel" aria-label="Velocidade">1x</button>
        <button type="button" class="vp-btn" data-vp="tela" aria-label="Tela cheia"><i class="fa-solid fa-expand"></i></button>
      </div>
    </div>`;
  const raiz = container.querySelector(".vp");
  const q = (n) => raiz.querySelector(`[data-vp="${n}"]`);
  let player = null;
  let timer = null;
  let destruido = false;
  let arrastando = false;

  const tocando = () => player?.getPlayerState?.() === 1;
  const alternar = () => {
    if (!player) return;
    raiz.querySelector(".vp-fim").classList.add("hidden");
    tocando() ? player.pauseVideo() : player.playVideo();
  };
  const atualizarBotao = () => {
    q("play").innerHTML = `<i class="fa-solid fa-${tocando() ? "pause" : "play"}"></i>`;
  };
  const atualizarTempo = () => {
    if (!player?.getDuration || arrastando) return;
    const dur = player.getDuration() || 0, atual = player.getCurrentTime() || 0;
    q("tempo").textContent = fmt(atual);
    q("duracao").textContent = fmt(dur);
    q("barra").value = dur ? Math.round((atual / dur) * 1000) : 0;
  };

  try {
    await carregarApiYoutube();
  } catch (e) {
    container.innerHTML = `<div class="empty" style="padding:40px">${e.message}</div>`;
    return { destruir() {} };
  }
  if (!container.contains(raiz)) return { destruir() {} };

  player = new YT.Player(raiz.querySelector(".vp-yt"), {
    videoId: ytId,
    host: "https://www.youtube-nocookie.com",
    playerVars: {
      autoplay: autoplay ? 1 : 0, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1,
      iv_load_policy: 3, playsinline: 1, cc_load_policy: 0, origin: location.origin,
    },
    events: {
      // Sem legendas nem descrição de áudio por cima do vídeo
      onReady: () => {
        try { player.unloadModule("captions"); player.unloadModule("cc"); } catch { /* sem legendas */ }
      },
      onStateChange: (e) => {
        atualizarBotao();
        if (e.data === YT.PlayerState.PLAYING) {
          try { player.unloadModule("captions"); player.unloadModule("cc"); } catch { /* sem legendas */ }
        }
        if (e.data === YT.PlayerState.ENDED) {
          raiz.querySelector(".vp-fim").classList.remove("hidden");
          aoTerminar?.();
        }
      },
    },
  });
  timer = setInterval(atualizarTempo, 300);

  q("bloqueio").addEventListener("click", alternar);
  q("bloqueio").addEventListener("contextmenu", (e) => e.preventDefault());
  q("play").addEventListener("click", alternar);
  q("repetir").addEventListener("click", () => {
    raiz.querySelector(".vp-fim").classList.add("hidden");
    player.seekTo(0, true);
    player.playVideo();
  });

  const barra = q("barra");
  barra.addEventListener("input", () => {
    arrastando = true;
    const dur = player.getDuration() || 0;
    q("tempo").textContent = fmt((barra.value / 1000) * dur);
  });
  barra.addEventListener("change", () => {
    player.seekTo((barra.value / 1000) * (player.getDuration() || 0), true);
    arrastando = false;
  });

  q("mudo").addEventListener("click", () => {
    const mudo = player.isMuted();
    mudo ? player.unMute() : player.mute();
    q("mudo").innerHTML = `<i class="fa-solid fa-volume-${mudo ? "high" : "xmark"}"></i>`;
  });

  let vel = 0;
  q("vel").addEventListener("click", () => {
    vel = (vel + 1) % VELOCIDADES.length;
    player.setPlaybackRate(VELOCIDADES[vel]);
    q("vel").textContent = VELOCIDADES[vel] + "x";
  });

  // Tela cheia da nossa caixa (assim a camada preta e os controles continuam por cima).
  // No iPhone, que não permite isso, usa uma tela cheia simulada.
  q("tela").addEventListener("click", () => {
    const cheia = document.fullscreenElement || document.webkitFullscreenElement;
    if (cheia) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (raiz.classList.contains("vp-pseudo")) return raiz.classList.remove("vp-pseudo");
    const pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    if (pedir) pedir.call(raiz).catch(() => raiz.classList.add("vp-pseudo"));
    else raiz.classList.add("vp-pseudo");
  });

  return {
    destruir() {
      if (destruido) return;
      destruido = true;
      clearInterval(timer);
      try { player?.destroy(); } catch { /* já removido */ }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      container.innerHTML = "";
    },
  };
}
