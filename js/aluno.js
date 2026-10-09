import {
  auth, db, configurado, isAdminEmail, avisoConfiguracao,
  onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, updateDoc, query, where, arrayUnion, arrayRemove,
} from "./firebase.js";
import {
  $, $$, esc, fmtDate, hojeISO, initials, thumb, planoLabel, ordenarAulas, toast,
  abrirModal, mensagemErroAuth, CONFIG_PADRAO, aplicarPlanos, aplicarTema, botaoWhatsapp, linkWhatsapp, temAcessoTotal,
} from "./comum.js";
import "./pwa.js";
import { abrirVideo } from "./player.js";

let aluno = null;
let refAluno = null;
let config = { ...CONFIG_PADRAO };
let materiais = []; // materiais de apoio cadastrados no superadmin
let aulas = []; // aulas que o aluno pode assistir
let bloqueadas = []; // aulas de outro plano (vêm da vitrine, sem o vídeo)
let pagina = "inicio";

// ===================== ACESSO =====================
if (!configurado) {
  avisoConfiguracao();
  $("#carregando").innerHTML = '<div class="empty">Configure o Firebase em <code>js/firebase-config.js</code>.<br/><br/><a class="btn btn-red btn-sm" href="index.html">Voltar ao site</a></div>';
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = "login.html");
    if (isAdminEmail(user.email)) return (window.location.href = "admin.html");
    try {
      await carregar(user);
    } catch (e) {
      console.error(e);
      bloquearTela(mensagemErroAuth(e));
    }
  });
}

$("#btnSair").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

function bloquearTela(msg) {
  $("#carregando").innerHTML = `<div class="empty"><i class="fa-solid fa-lock" style="font-size:2rem;color:var(--primary)"></i><br/><br/>${esc(msg)}<br/><br/>
    <button class="btn btn-red btn-sm" id="sairBloqueado">Voltar ao site</button></div>`;
  $("#sairBloqueado").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

async function carregar(user) {
  refAluno = doc(db, "alunos", user.uid);
  const snap = await getDoc(refAluno);
  if (!snap.exists() || snap.data().status === "excluido") return bloquearTela("Cadastro não encontrado. Fale com o suporte.");
  aluno = snap.data();
  if (aluno.status === "bloqueado") return bloquearTela("Seu acesso está bloqueado. Fale com o suporte.");
  if (aluno.status === "pendente") return bloquearTela("Pagamento ainda não confirmado. Assim que confirmar, o acesso é liberado.");
  if (aluno.validade && aluno.validade < hojeISO()) return bloquearTela("Seu acesso expirou. Fale com o suporte para renovar.");
  aluno.progresso = aluno.progresso || [];

  const cfg = await getDoc(doc(db, "config", "site"));
  if (cfg.exists()) config = { ...CONFIG_PADRAO, ...cfg.data() };
  aplicarPlanos(config);
  aplicarTema(config);
  botaoWhatsapp(config);

  // As regras do Firestore só liberam as aulas do plano do aluno,
  // então a consulta precisa pedir exatamente essas aulas.
  const col = collection(db, "aulas");
  const consultas =
    temAcessoTotal(aluno)
      ? [query(col, where("status", "==", "publicada"))]
      : [
          query(col, where("status", "==", "publicada"), where("plano", "==", "todos")),
          query(col, where("status", "==", "publicada"), where("gratuita", "==", true)),
        ];
  const mapa = new Map();
  for (const q of consultas) (await getDocs(q)).forEach((d) => mapa.set(d.id, { id: d.id, ...d.data() }));
  aulas = ordenarAulas([...mapa.values()], config.modulos);

  // Materiais de apoio: mesma regra de plano das aulas
  const colMat = collection(db, "materiais");
  const consultaMat = temAcessoTotal(aluno)
    ? query(colMat, where("status", "==", "publicada"))
    : query(colMat, where("status", "==", "publicada"), where("plano", "==", "todos"));
  materiais = (await getDocs(consultaMat)).docs.map((d) => ({ id: d.id, ...d.data() }));

  const vitrine = await getDocs(query(collection(db, "vitrine"), where("status", "==", "publicada")));
  bloqueadas = ordenarAulas(
    vitrine.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => !mapa.has(v.id)),
    config.modulos
  );

  if (aluno.ultimoAcesso !== hojeISO()) {
    aluno.ultimoAcesso = hojeISO();
    updateDoc(refAluno, { ultimoAcesso: aluno.ultimoAcesso }).catch(console.error);
  }

  $("#alunoAvatar").textContent = initials(aluno.nome);
  $("#alunoNome").textContent = aluno.nome;
  $("#alunoPlano").textContent = "Plano " + (planoLabel[aluno.plano] || "");
  $("#carregando").classList.add("hidden");
  render();
}


// ===================== PROGRESSO =====================
const concluida = (id) => aluno.progresso.includes(id);
const pct = (lista = aulas) => (lista.length ? Math.round((lista.filter((a) => concluida(a.id)).length / lista.length) * 100) : 0);

async function marcarConcluida(aula, feita = true) {
  if (concluida(aula.id) === feita) return;
  const antes = [...aluno.progresso];
  aluno.progresso = feita ? [...aluno.progresso, aula.id] : aluno.progresso.filter((x) => x !== aula.id);
  render();
  try {
    await updateDoc(refAluno, { progresso: feita ? arrayUnion(aula.id) : arrayRemove(aula.id), ultimoAcesso: hojeISO() });
    toast(feita ? "Aula concluída!" : "Aula desmarcada");
  } catch (e) {
    console.error(e);
    aluno.progresso = antes;
    render();
    toast(mensagemErroAuth(e), true);
  }
}

// ===================== PÁGINAS =====================
$$("#alunoNav button").forEach((b) =>
  b.addEventListener("click", () => {
    pagina = b.dataset.page;
    render();
    window.scrollTo(0, 0);
  })
);

function render() {
  $$("#alunoNav button").forEach((b) => b.classList.toggle("active", b.dataset.page === pagina));
  const paginas = { inicio: pgInicio, progresso: pgProgresso, materiais: pgMateriais, perfil: pgPerfil };
  $("#alunoMain").innerHTML = paginas[pagina]();
  $$("[data-play]", $("#alunoMain")).forEach((el) =>
    el.addEventListener("click", () => abrirPlayer(aulas.find((a) => a.id === el.dataset.play)))
  );
  const reset = $("#btnSenha");
  if (reset)
    reset.addEventListener("click", async () => {
      try {
        await sendPasswordResetEmail(auth, aluno.email);
        toast("Enviamos um link para " + aluno.email);
      } catch (e) {
        toast(mensagemErroAuth(e), true);
      }
    });
}

const cardAula = (a, i) => `
  <button class="lesson-card" data-play="${a.id}">
    <div class="thumb" style="background-image:url('${thumb(a.yt)}')">
      ${concluida(a.id) ? '<span class="done"><i class="fa-solid fa-check"></i> Concluída</span>' : ""}
      ${a.duracao ? `<span class="dur">${esc(a.duracao)}</span>` : ""}
    </div>
    <div class="body"><small>Aula ${i + 1}</small><h3>${esc(a.titulo)}</h3></div>
  </button>`;

const modulosComAulas = () =>
  [...new Set([...config.modulos, ...aulas.map((a) => a.modulo)])]
    .map((m) => ({ nome: m, aulas: aulas.filter((a) => a.modulo === m) }))
    .filter((m) => m.aulas.length);

function pgInicio() {
  const feitas = aulas.filter((a) => concluida(a.id)).length;
  const proxima = aulas.find((a) => !concluida(a.id)) || aulas[0];
  const p = pct();
  return `
  <div class="page-head"><div><h1>Olá, ${esc(aluno.nome.split(" ")[0])} 👋</h1><p>${feitas ? "Continue de onde parou" : "Bem-vindo(a)! Comece pela primeira aula"}</p></div></div>
  ${proxima ? `<div class="continue">
    <div class="thumb" style="background-image:url('${thumb(proxima.yt)}')" data-play="${proxima.id}"></div>
    <div class="info">
      <span class="eyebrow">${feitas === aulas.length ? "CURSO CONCLUÍDO · REVER" : "PRÓXIMA AULA"} · ${esc(proxima.modulo.toUpperCase())}</span>
      <h2>${esc(proxima.titulo)}</h2><p>${esc(proxima.descricao)}</p>
      <div class="progress-big"><div class="progress"><span style="width:${p}%"></span></div><strong>${p}%</strong></div>
      <small style="color:var(--text-muted)">${feitas} de ${aulas.length} aulas concluídas</small>
      <div style="margin-top:18px"><button class="btn btn-red" data-play="${proxima.id}"><i class="fa-solid fa-play"></i> ${feitas ? "Continuar" : "Começar"}</button></div>
    </div></div>` : '<div class="empty">Nenhuma aula disponível ainda.</div>'}
  ${modulosComAulas().map((m) => `
    <div class="module-title"><span></span><h2>${esc(m.nome)}</h2><small>${m.aulas.filter((a) => concluida(a.id)).length}/${m.aulas.length} concluídas</small></div>
    <div class="lesson-grid">${m.aulas.map(cardAula).join("")}</div>`).join("")}
  ${bloqueadas.length ? `
    <div class="module-title"><span style="background:var(--text-muted)"></span><h2>Disponível em outros planos</h2></div>
    <div class="lesson-grid">${bloqueadas.map((a) => `
      <div class="lesson-card locked"><div class="thumb thumb-placeholder"><div class="lock"><i class="fa-solid fa-lock"></i></div></div>
      <div class="body"><small>${esc(a.modulo)}</small><h3>${esc(a.titulo)}</h3></div></div>`).join("")}</div>
    <div style="margin-top:16px"><a class="btn btn-ghost btn-sm" href="${esc(linkWhatsapp(config.whatsappSuporte, "Olá! Quero fazer upgrade do meu plano.") || config.suporte)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Quero fazer upgrade</a></div>` : ""}`;
}

function pgProgresso() {
  const feitas = aulas.filter((a) => concluida(a.id)).length;
  const p = pct();
  return `
  <div class="page-head"><div><h1>Meu progresso</h1><p>Acompanhe sua evolução no curso</p></div></div>
  <div class="kpis">
    <div class="kpi"><div class="label">Progresso geral <i class="fa-solid fa-chart-pie"></i></div><div class="value">${p}%</div><div class="progress" style="margin-top:8px"><span style="width:${p}%"></span></div></div>
    <div class="kpi"><div class="label">Aulas concluídas <i class="fa-solid fa-circle-check"></i></div><div class="value">${feitas}</div><div class="delta">de ${aulas.length}</div></div>
    <div class="kpi"><div class="label">Faltam <i class="fa-solid fa-hourglass-half"></i></div><div class="value">${aulas.length - feitas}</div></div>
    <div class="kpi"><div class="label">Conclusão <i class="fa-solid fa-award"></i></div><div class="value" style="font-size:1rem;margin-top:12px">${p === 100 ? '<span class="badge b-green">Curso concluído!</span>' : '<span class="badge b-gray">Em andamento</span>'}</div></div>
  </div>
  ${modulosComAulas().map((m) => {
    const pm = pct(m.aulas);
    return `<div class="panel"><div class="panel-head"><h2>${esc(m.nome)}</h2><small style="color:var(--text-muted)">${m.aulas.filter((a) => concluida(a.id)).length}/${m.aulas.length} · ${pm}%</small></div>
      <div class="progress" style="margin-bottom:16px"><span style="width:${pm}%"></span></div>
      <div class="list">${m.aulas.map((a) => `<div class="list-item"><i class="fa-solid ${concluida(a.id) ? "fa-circle-check" : "fa-circle"}" style="color:${concluida(a.id) ? "var(--green)" : "var(--text-muted)"}"></i><div class="grow">${esc(a.titulo)}<small>${esc(a.duracao || "")}</small></div><button class="btn btn-ghost btn-sm" data-play="${a.id}"><i class="fa-solid fa-play"></i> Assistir</button></div>`).join("")}</div></div>`;
  }).join("")}`;
}

function pgMateriais() {
  const linha = (m, sub) => `
    <div class="list-item"><i class="fa-solid fa-file-arrow-down" style="color:var(--primary);font-size:1.2rem"></i>
      <div class="grow"><strong>${esc(m.nome)}</strong><small>${esc(sub || "")}</small></div>
      <a class="btn btn-ghost btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-download"></i> Baixar</a></div>`;
  const categorias = {};
  materiais.forEach((m) => (categorias[m.categoria || "Geral"] ||= []).push(m));
  const itens = aulas.flatMap((a) => (a.materiais || []).map((m) => ({ ...m, aula: a.titulo })));
  return `
  <div class="page-head"><div><h1>Materiais</h1><p>Materiais de apoio e arquivos das aulas</p></div></div>
  ${Object.entries(categorias).sort(([x], [y]) => x.localeCompare(y)).map(([cat, lista]) => `
    <div class="panel"><div class="panel-head"><h2>${esc(cat)}</h2></div>
      <div class="list">${lista.sort((x, y) => x.nome.localeCompare(y.nome)).map((m) => linha(m, m.descricao)).join("")}</div></div>`).join("")}
  ${itens.length ? `<div class="panel"><div class="panel-head"><h2>Materiais das aulas</h2></div>
    <div class="list">${itens.map((m) => linha(m, m.aula)).join("")}</div></div>` : ""}
  ${!itens.length && !materiais.length ? '<div class="panel"><div class="empty">Nenhum material disponível</div></div>' : ""}`;
}

function pgPerfil() {
  return `
  <div class="page-head"><div><h1>Meu perfil</h1><p>Seus dados de acesso</p></div></div>
  <div class="panel"><div class="form-grid">
    <div class="field"><label>Nome</label><input value="${esc(aluno.nome)}" disabled /></div>
    <div class="field"><label>E-mail</label><input value="${esc(aluno.email)}" disabled /></div>
    <div class="field"><label>WhatsApp</label><input value="${esc(aluno.telefone || "—")}" disabled /></div>
    <div class="field"><label>Plano</label><input value="${planoLabel[aluno.plano] || ""}" disabled /></div>
    <div class="field"><label>Matrícula</label><input value="${fmtDate(aluno.matricula)}" disabled /></div>
    <div class="field"><label>Acesso até</label><input value="${aluno.validade ? fmtDate(aluno.validade) : "Vitalício"}" disabled /></div>
  </div>
  <div class="form-actions">
    <button class="btn btn-ghost" id="btnSenha"><i class="fa-solid fa-key"></i> Alterar senha</button>
    <a class="btn btn-green" href="${esc(config.suporte)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Suporte</a>
  </div></div>`;
}

// ===================== PLAYER (YouTube) =====================
let player = null;
let aulaAtual = null;

async function abrirPlayer(aula) {
  if (!aula) return;
  aulaAtual = aula;
  $("#playerModulo").textContent = aula.modulo.toUpperCase();
  $("#playerTitulo").textContent = aula.titulo;
  $("#playerDesc").textContent = aula.descricao || "";
  renderAcoesPlayer();
  abrirModal("#playerModal");

  destruirPlayer();
  const p = await abrirVideo($("#playerFrame"), aula.yt, {
    // Marca como concluída automaticamente quando o vídeo termina
    aoTerminar: () => {
      if (aulaAtual === aula && !concluida(aula.id)) marcarConcluida(aula).then(renderAcoesPlayer);
    },
  });
  if (aulaAtual !== aula) return p.destruir();
  player = p;
}
function destruirPlayer() {
  player?.destruir();
  player = null;
}

document.addEventListener("modais-fechados", () => {
  aulaAtual = null;
  destruirPlayer();
  $("#playerFrame").innerHTML = "";
});

function renderAcoesPlayer() {
  const aula = aulaAtual;
  if (!aula) return;
  const feita = concluida(aula.id);
  const proxima = aulas[aulas.findIndex((x) => x.id === aula.id) + 1];
  const mats = aula.materiais || [];
  $("#playerAcoes").innerHTML = `
    ${mats.map((m) => `<a class="btn btn-ghost btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener" download><i class="fa-solid fa-download"></i> ${esc(m.nome)}</a>`).join("")}
    <button class="btn ${feita ? "btn-ghost" : "btn-green"} btn-sm" id="btnConcluir"><i class="fa-solid fa-${feita ? "rotate-left" : "check"}"></i> ${feita ? "Desmarcar" : "Marcar como concluída"}</button>
    ${proxima ? '<button class="btn btn-red btn-sm" id="btnProxima">Próxima aula <i class="fa-solid fa-arrow-right"></i></button>' : ""}`;
  $("#btnConcluir").onclick = async () => {
    await marcarConcluida(aula, !feita);
    renderAcoesPlayer();
  };
  if (proxima)
    $("#btnProxima").onclick = async () => {
      await marcarConcluida(aula, true);
      abrirPlayer(proxima);
    };
}
