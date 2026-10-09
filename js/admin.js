import {
  auth, db, configurado, isAdminEmail, criarContaAluno, avisoConfiguracao,
  onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp,
} from "./firebase.js";
import {
  $, $$, esc, brl, fmtDate, hojeISO, initials, thumb, extractYoutubeId, planoLabel, formaLabel,
  badge, capitalizar, ordenarAulas, materiaisParaTexto, textoParaMateriais, toast, abrirModal,
  fecharModais, baixarCsv, mensagemErroAuth, CONFIG_PADRAO, aplicarPlanos, planosDe, temAcessoTotal,
  aplicarTema, CORES_PADRAO,
} from "./comum.js";
import "./pwa.js";
import { abrirVideo } from "./player.js";

// ===================== ESTADO =====================
let config = { ...CONFIG_PADRAO };
let aulas = [];
let todosAlunos = []; // inclui os excluídos (para reaproveitar o cadastro)
let lancamentos = [];
let materiais = []; // materiais de apoio (aba Materiais do aluno)
let pagina = "dashboard";
const filtros = { aulas: { q: "", modulo: "", status: "" }, alunos: { q: "", plano: "", status: "" }, fin: { mes: "", tipo: "", status: "" } };
let abaGestao = "pendencias";

const alunos = () => todosAlunos.filter((a) => a.status !== "excluido");
const aulasPublicadas = () => ordenarAulas(aulas.filter((a) => a.status === "publicada"), config.modulos);
const aulasDoAluno = (al) => aulasPublicadas().filter((a) => temAcessoTotal(al) || a.plano === "todos" || a.gratuita);
const progressoDe = (al) => (al.progresso || []);
function progressoPct(al) {
  const lista = aulasDoAluno(al);
  if (!lista.length) return 0;
  return Math.round((lista.filter((a) => progressoDe(al).includes(a.id)).length / lista.length) * 100);
}

// ===================== ACESSO =====================
if (!configurado) {
  avisoConfiguracao();
  $("#carregando").innerHTML = '<div class="empty">Configure o Firebase em <code>js/firebase-config.js</code>.<br/><br/><a class="btn btn-red btn-sm" href="index.html">Voltar ao site</a></div>';
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) return (window.location.href = "login.html");
    if (!isAdminEmail(user.email)) return (window.location.href = "aluno.html");
    $("#adminEmail").textContent = user.email;
    iniciar();
  });
}

$("#btnSair").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

let iniciado = false;
function iniciar() {
  if (iniciado) return;
  iniciado = true;
  const pronto = new Set();
  const marcar = (nome) => {
    pronto.add(nome);
    if (pronto.size >= 5) $("#carregando").classList.add("hidden");
    render();
  };
  const erro = (e) => {
    console.error(e);
    toast(mensagemErroAuth(e), true);
    $("#carregando").classList.add("hidden");
  };
  onSnapshot(doc(db, "config", "site"), (s) => { config = { ...CONFIG_PADRAO, ...(s.data() || {}) }; aplicarPlanos(config); aplicarTema(config); marcar("config"); }, erro);
  onSnapshot(collection(db, "aulas"), (s) => { aulas = s.docs.map((d) => ({ id: d.id, ...d.data() })); marcar("aulas"); }, erro);
  onSnapshot(collection(db, "alunos"), (s) => { todosAlunos = s.docs.map((d) => ({ id: d.id, ...d.data() })); marcar("alunos"); }, erro);
  onSnapshot(collection(db, "materiais"), (s) => { materiais = s.docs.map((d) => ({ id: d.id, ...d.data() })); marcar("materiais"); }, erro);
  onSnapshot(collection(db, "lancamentos"), (s) => { lancamentos = s.docs.map((d) => ({ id: d.id, ...d.data() })); marcar("lancamentos"); }, erro);
}

// ===================== NAVEGAÇÃO =====================
$$("#adminNav button").forEach((b) =>
  b.addEventListener("click", () => {
    pagina = b.dataset.page;
    render();
    window.scrollTo(0, 0);
  })
);

function render() {
  $$("#adminNav button").forEach((b) => b.classList.toggle("active", b.dataset.page === pagina));
  const paginas = { dashboard: pgDashboard, aulas: pgAulas, alunos: pgAlunos, materiais: pgMateriais, gestao: pgGestao, financeiro: pgFinanceiro, config: pgConfig };
  $("#adminMain").innerHTML = paginas[pagina]();
  ligarEventosPagina();
}

// ===================== CÁLCULOS =====================
function totais(lista = lancamentos) {
  const pagos = lista.filter((l) => l.status === "pago");
  const entradas = pagos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const saidas = pagos.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
  const pendente = lista.filter((l) => l.tipo === "entrada" && l.status === "pendente").reduce((s, l) => s + Number(l.valor), 0);
  const reembolsos = lista.filter((l) => l.status === "reembolsado").reduce((s, l) => s + Number(l.valor), 0);
  const vendas = pagos.filter((l) => l.tipo === "entrada" && l.categoria === "Venda");
  const totalVendas = vendas.reduce((s, l) => s + Number(l.valor), 0);
  return { entradas, saidas, lucro: entradas - saidas, pendente, reembolsos, nVendas: vendas.length, ticket: vendas.length ? totalVendas / vendas.length : 0 };
}

function ultimosMeses(n = 6) {
  const hoje = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return out;
}

function graficoReceita() {
  const meses = ultimosMeses().map((m) => ({
    ...m,
    v: lancamentos.filter((l) => l.tipo === "entrada" && l.status === "pago" && (l.data || "").startsWith(m.key)).reduce((s, l) => s + Number(l.valor), 0),
  }));
  const max = Math.max(...meses.map((m) => m.v), 1);
  return `<div class="chart">${meses
    .map((m) => `<div class="bar-col"><div class="bar" style="height:${(m.v / max) * 85}%" data-v="${m.v ? brl(m.v).replace(",00", "") : ""}"></div><small>${m.label}</small></div>`)
    .join("")}</div>`;
}

const celulaAluno = (a) =>
  `<div class="cell-user"><div class="avatar">${initials(a.nome)}</div><div><strong>${esc(a.nome)}</strong><small>${esc(a.email)}</small></div></div>`;
const barraProgresso = (p) =>
  `<div style="display:flex;align-items:center;gap:8px;min-width:120px"><div class="progress" style="flex:1"><span style="width:${p}%"></span></div><small>${p}%</small></div>`;
const opcoes = (lista, atual) => lista.map(([v, l]) => `<option value="${v}" ${atual === v ? "selected" : ""}>${l}</option>`).join("");

// ===================== PÁGINAS =====================
function pgDashboard() {
  const t = totais();
  const ativos = alunos().filter((a) => a.status === "ativo");
  const media = ativos.length ? Math.round(ativos.reduce((s, a) => s + progressoPct(a), 0) / ativos.length) : 0;
  const recentes = [...alunos()].sort((a, b) => (b.matricula || "").localeCompare(a.matricula || "")).slice(0, 5);
  return `
  <div class="page-head"><div><h1>Dashboard</h1><p>Visão geral da plataforma</p></div>
    <div class="actions"><button class="btn btn-ghost btn-sm" data-act="nova-aula"><i class="fa-solid fa-plus"></i> Nova aula</button><button class="btn btn-red btn-sm" data-act="novo-aluno"><i class="fa-solid fa-user-plus"></i> Novo aluno</button></div></div>
  <div class="kpis">
    <div class="kpi"><div class="label">Receita total <i class="fa-solid fa-sack-dollar"></i></div><div class="value">${brl(t.entradas)}</div><div class="delta">${t.nVendas} vendas pagas</div></div>
    <div class="kpi"><div class="label">Lucro líquido <i class="fa-solid fa-chart-line"></i></div><div class="value">${brl(t.lucro)}</div><div class="delta">Despesas: ${brl(t.saidas)}</div></div>
    <div class="kpi"><div class="label">Alunos ativos <i class="fa-solid fa-users"></i></div><div class="value">${ativos.length}</div><div class="delta">${alunos().length} cadastrados</div></div>
    <div class="kpi"><div class="label">Progresso médio <i class="fa-solid fa-graduation-cap"></i></div><div class="value">${media}%</div><div class="delta">${aulasPublicadas().length} aulas publicadas</div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="panel-head"><h2>Receita dos últimos 6 meses</h2><button class="btn btn-ghost btn-sm" data-ir="financeiro">Ver financeiro</button></div>${graficoReceita()}</div>
    <div class="panel"><div class="panel-head"><h2>Últimas matrículas</h2></div>
      <div class="list">${recentes.map((a) => `<div class="list-item"><div class="avatar" style="width:32px;height:32px;font-size:.78rem">${initials(a.nome)}</div><div class="grow"><strong>${esc(a.nome)}</strong><small>${fmtDate(a.matricula)} · ${planoLabel[a.plano] || ""}</small></div>${badge(a.status)}</div>`).join("") || '<div class="empty">Nenhum aluno ainda</div>'}</div>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Conclusão por aula</h2></div>
    <div class="list">${aulasPublicadas().map((a) => {
      const n = alunos().filter((u) => progressoDe(u).includes(a.id)).length;
      const p = Math.round((n / Math.max(alunos().length, 1)) * 100);
      return `<div class="list-item"><div class="grow"><strong>${esc(a.titulo)}</strong><small>${esc(a.modulo)}</small></div><div style="width:160px"><div class="progress"><span style="width:${p}%"></span></div></div><small style="width:70px;text-align:right">${n} alunos</small></div>`;
    }).join("") || '<div class="empty">Nenhuma aula publicada</div>'}</div>
  </div>`;
}

function pgAulas() {
  const f = filtros.aulas;
  const lista = ordenarAulas(
    aulas.filter((a) => (!f.q || a.titulo.toLowerCase().includes(f.q.toLowerCase())) && (!f.modulo || a.modulo === f.modulo) && (!f.status || a.status === f.status)),
    config.modulos
  );
  return `
  <div class="page-head"><div><h1>Aulas</h1><p>Cadastre cada aula com o código do YouTube</p></div>
    <div class="actions">
      <button class="btn btn-ghost btn-sm" data-act="modulos"><i class="fa-solid fa-layer-group"></i> Módulos</button>
      <button class="btn btn-red btn-sm" data-act="nova-aula"><i class="fa-solid fa-plus"></i> Nova aula</button>
    </div></div>
  <div class="panel">
    <div class="toolbar">
      <div class="field"><input placeholder="Buscar aula..." data-filtro="aulas.q" value="${esc(f.q)}" /></div>
      <div class="field"><select data-filtro="aulas.modulo"><option value="">Todos os módulos</option>${opcoes(config.modulos.map((m) => [m, esc(m)]), f.modulo)}</select></div>
      <div class="field"><select data-filtro="aulas.status"><option value="">Todos os status</option>${opcoes([["publicada", "Publicada"], ["rascunho", "Rascunho"]], f.status)}</select></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Aula</th><th>Módulo</th><th>Ordem</th><th>Plano</th><th>Status</th><th>Concluída por</th><th></th></tr></thead>
      <tbody>${lista.map((a) => `<tr>
        <td><div class="cell-lesson"><img src="${thumb(a.yt)}" alt="" /><div><strong>${esc(a.titulo)}</strong><small>YouTube: ${esc(a.yt)}${a.duracao ? " · " + esc(a.duracao) : ""}</small></div></div></td>
        <td>${esc(a.modulo)}</td><td>${a.ordem}</td>
        <td>${badge(a.plano, a.plano === "todos" ? "Todos" : "Acesso total")}${a.gratuita ? ' <span class="badge b-green">Grátis</span>' : ""}</td>
        <td>${badge(a.status)}</td>
        <td>${alunos().filter((u) => progressoDe(u).includes(a.id)).length} alunos</td>
        <td><div class="row-actions">
          <button class="icon-btn" title="Assistir" data-act="ver-aula" data-id="${a.id}"><i class="fa-solid fa-play"></i></button>
          <button class="icon-btn" title="Editar" data-act="editar-aula" data-id="${a.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn danger" title="Excluir" data-act="excluir-aula" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button>
        </div></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhuma aula cadastrada</td></tr>`}</tbody>
    </table></div>
  </div>`;
}

function pgAlunos() {
  const f = filtros.alunos;
  const lista = alunos()
    .filter((a) => (!f.q || (a.nome + a.email).toLowerCase().includes(f.q.toLowerCase())) && (!f.plano || a.plano === f.plano) && (!f.status || a.status === f.status))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return `
  <div class="page-head"><div><h1>Alunos</h1><p>Cadastro e acesso dos alunos</p></div>
    <div class="actions"><button class="btn btn-ghost btn-sm" data-act="exportar-alunos"><i class="fa-solid fa-file-csv"></i> Exportar</button><button class="btn btn-red btn-sm" data-act="novo-aluno"><i class="fa-solid fa-user-plus"></i> Novo aluno</button></div></div>
  <div class="panel">
    <div class="toolbar">
      <div class="field"><input placeholder="Buscar por nome ou e-mail..." data-filtro="alunos.q" value="${esc(f.q)}" /></div>
      <div class="field"><select data-filtro="alunos.plano"><option value="">Todos os planos</option>${opcoes(planosDe(config).map((p) => [p.id, esc(p.nome)]), f.plano)}</select></div>
      <div class="field"><select data-filtro="alunos.status"><option value="">Todos os status</option>${opcoes([["ativo", "Ativo"], ["pendente", "Pendente"], ["bloqueado", "Bloqueado"]], f.status)}</select></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Aluno</th><th>Plano</th><th>Pagamento</th><th>Matrícula</th><th>Progresso</th><th>Acesso</th><th></th></tr></thead>
      <tbody>${lista.map((a) => `<tr>
        <td>${celulaAluno(a)}</td>
        <td>${planoLabel[a.plano] || ""}<small class="sub-cell">${brl(a.valor)}</small></td>
        <td>${badge(a.statusPag)}<small class="sub-cell">${formaLabel[a.pagamento] || ""}</small></td>
        <td>${fmtDate(a.matricula)}<small class="sub-cell">${a.validade ? "até " + fmtDate(a.validade) : "vitalício"}</small></td>
        <td>${barraProgresso(progressoPct(a))}</td>
        <td>${badge(a.status)}</td>
        <td><div class="row-actions">
          <button class="icon-btn" title="Detalhes" data-act="detalhe-aluno" data-id="${a.id}"><i class="fa-solid fa-eye"></i></button>
          <button class="icon-btn" title="Editar" data-act="editar-aluno" data-id="${a.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn" title="Reenviar e-mail de acesso" data-act="reenviar" data-id="${a.id}"><i class="fa-solid fa-envelope"></i></button>
          <button class="icon-btn" title="${a.status === "bloqueado" ? "Desbloquear" : "Bloquear"}" data-act="bloqueio" data-id="${a.id}"><i class="fa-solid fa-${a.status === "bloqueado" ? "lock-open" : "ban"}"></i></button>
          <button class="icon-btn danger" title="Excluir" data-act="excluir-aluno" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button>
        </div></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum aluno encontrado</td></tr>`}</tbody>
    </table></div>
  </div>`;
}

function pgGestao() {
  const hoje = hojeISO();
  const em30 = hojeISO(30);
  const limiteInativo = hojeISO(-14);
  const pendentes = alunos().filter((a) => a.status === "pendente" || a.statusPag === "pendente");
  const vencendo = alunos().filter((a) => a.validade && a.validade <= em30).sort((a, b) => a.validade.localeCompare(b.validade));
  const inativos = alunos().filter((a) => a.status === "ativo" && (!a.ultimoAcesso || a.ultimoAcesso < limiteInativo));
  const ranking = alunos().filter((a) => a.status === "ativo").sort((a, b) => progressoPct(b) - progressoPct(a));
  const zap = (tel) => (tel ? `https://wa.me/55${String(tel).replace(/\D/g, "").replace(/^55/, "")}` : "");

  let corpo = "";
  if (abaGestao === "pendencias") {
    corpo = pendentes.length
      ? `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Plano</th><th>Valor</th><th>Forma</th><th>Matrícula</th><th></th></tr></thead><tbody>${pendentes.map((a) => `<tr><td>${celulaAluno(a)}</td><td>${planoLabel[a.plano]}</td><td>${brl(a.valor)}</td><td>${formaLabel[a.pagamento] || ""}</td><td>${fmtDate(a.matricula)}</td><td><div class="row-actions"><button class="btn btn-green btn-sm" data-act="confirmar-pag" data-id="${a.id}"><i class="fa-solid fa-check"></i> Confirmar pagamento e liberar</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Nenhum pagamento pendente</div>`;
  } else if (abaGestao === "vencendo") {
    corpo = vencendo.length
      ? `<div class="list">${vencendo.map((a) => `<div class="list-item"><div class="avatar">${initials(a.nome)}</div><div class="grow"><strong>${esc(a.nome)}</strong><small>${a.validade < hoje ? "Venceu" : "Vence"} em ${fmtDate(a.validade)}</small></div><button class="btn btn-ghost btn-sm" data-act="renovar" data-id="${a.id}">Renovar +1 ano</button></div>`).join("")}</div>`
      : `<div class="empty">Nenhum acesso vencido ou vencendo nos próximos 30 dias</div>`;
  } else if (abaGestao === "inativos") {
    corpo = inativos.length
      ? `<div class="list">${inativos.map((a) => `<div class="list-item"><div class="avatar">${initials(a.nome)}</div><div class="grow"><strong>${esc(a.nome)}</strong><small>Último acesso: ${fmtDate(a.ultimoAcesso)} · ${progressoPct(a)}% concluído</small></div>${a.telefone ? `<a class="btn btn-green btn-sm" href="${zap(a.telefone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Chamar</a>` : ""}</div>`).join("")}</div>`
      : `<div class="empty">Todos os alunos ativos acessaram nos últimos 14 dias</div>`;
  } else {
    corpo = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Aluno</th><th>Aulas concluídas</th><th>Progresso</th><th>Último acesso</th></tr></thead><tbody>${ranking.map((a, i) => {
      const lista = aulasDoAluno(a);
      return `<tr><td>${i + 1}º</td><td>${celulaAluno(a)}</td><td>${lista.filter((x) => progressoDe(a).includes(x.id)).length} / ${lista.length}</td><td>${barraProgresso(progressoPct(a))}</td><td>${fmtDate(a.ultimoAcesso)}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="empty">Nenhum aluno ativo</td></tr>'}</tbody></table></div>`;
  }
  const abas = [["pendencias", "Pagamentos pendentes"], ["vencendo", "Acessos vencendo"], ["inativos", "Alunos inativos"], ["ranking", "Progresso dos alunos"]];
  return `
  <div class="page-head"><div><h1>Gestão</h1><p>Pendências, vencimentos, engajamento e progresso</p></div></div>
  <div class="kpis">
    <div class="kpi"><div class="label">Pagamentos pendentes <i class="fa-solid fa-hourglass-half"></i></div><div class="value">${pendentes.length}</div></div>
    <div class="kpi"><div class="label">Vencendo em 30 dias <i class="fa-solid fa-calendar-xmark"></i></div><div class="value">${vencendo.length}</div></div>
    <div class="kpi"><div class="label">Sem acesso há 14+ dias <i class="fa-solid fa-user-clock"></i></div><div class="value">${inativos.length}</div></div>
    <div class="kpi"><div class="label">Concluíram o curso <i class="fa-solid fa-trophy"></i></div><div class="value">${alunos().filter((a) => progressoPct(a) === 100).length}</div></div>
  </div>
  <div class="panel">
    <div class="tabs">${abas.map(([k, l]) => `<button data-aba="${k}" class="${abaGestao === k ? "active" : ""}">${l}</button>`).join("")}</div>
    ${corpo}
  </div>`;
}

function pgFinanceiro() {
  const f = filtros.fin;
  const lista = lancamentos
    .filter((l) => (!f.mes || (l.data || "").startsWith(f.mes)) && (!f.tipo || l.tipo === f.tipo) && (!f.status || l.status === f.status))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const t = totais(lista);
  const porCategoria = {};
  lista.filter((l) => l.status === "pago").forEach((l) => {
    const k = (l.tipo === "entrada" ? "+ " : "− ") + l.categoria;
    porCategoria[k] = (porCategoria[k] || 0) + Number(l.valor);
  });
  const porForma = {};
  lista.filter((l) => l.tipo === "entrada" && l.status === "pago").forEach((l) => {
    porForma[l.forma] = (porForma[l.forma] || 0) + Number(l.valor);
  });
  return `
  <div class="page-head"><div><h1>Relatório financeiro</h1><p>Entradas, saídas e lucro da plataforma</p></div>
    <div class="actions"><button class="btn btn-ghost btn-sm" data-act="exportar-fin"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button><button class="btn btn-red btn-sm" data-act="novo-lanc"><i class="fa-solid fa-plus"></i> Novo lançamento</button></div></div>
  <div class="panel" style="padding:16px 22px"><div class="toolbar" style="margin:0">
    <div class="field"><label>Período</label><select data-filtro="fin.mes"><option value="">Todo o período</option>${opcoes(ultimosMeses(12).reverse().map((m) => [m.key, `${m.label}/${m.key.slice(0, 4)}`]), f.mes)}</select></div>
    <div class="field"><label>Tipo</label><select data-filtro="fin.tipo"><option value="">Entradas e saídas</option>${opcoes([["entrada", "Entradas"], ["saida", "Saídas"]], f.tipo)}</select></div>
    <div class="field"><label>Status</label><select data-filtro="fin.status"><option value="">Todos</option>${opcoes([["pago", "Pago"], ["pendente", "Pendente"], ["reembolsado", "Reembolsado"]], f.status)}</select></div>
  </div></div>
  <div class="kpis">
    <div class="kpi"><div class="label">Entradas <i class="fa-solid fa-arrow-down"></i></div><div class="value" style="color:var(--green)">${brl(t.entradas)}</div><div class="delta">Ticket médio ${brl(t.ticket)}</div></div>
    <div class="kpi"><div class="label">Saídas <i class="fa-solid fa-arrow-up"></i></div><div class="value" style="color:var(--primary)">${brl(t.saidas)}</div></div>
    <div class="kpi"><div class="label">Lucro <i class="fa-solid fa-scale-balanced"></i></div><div class="value">${brl(t.lucro)}</div></div>
    <div class="kpi"><div class="label">A receber <i class="fa-solid fa-clock"></i></div><div class="value">${brl(t.pendente)}</div><div class="delta down">Reembolsado: ${brl(t.reembolsos)}</div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="panel-head"><h2>Receita por mês</h2></div>${graficoReceita()}</div>
    <div class="panel"><div class="panel-head"><h2>Por categoria</h2></div>
      <div class="list">${Object.entries(porCategoria).map(([k, v]) => `<div class="list-item"><div class="grow">${esc(k)}</div><strong style="color:${k.startsWith("+") ? "var(--green)" : "var(--primary)"}">${brl(v)}</strong></div>`).join("") || '<div class="empty">Sem dados</div>'}</div>
      <div class="panel-head" style="margin-top:22px"><h2>Por forma de pagamento</h2></div>
      <div class="list">${Object.entries(porForma).map(([k, v]) => `<div class="list-item"><div class="grow">${formaLabel[k] || esc(k)}</div><strong>${brl(v)}</strong></div>`).join("") || '<div class="empty">Sem dados</div>'}</div>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Lançamentos</h2><small style="color:var(--text-muted)">${lista.length} registros</small></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th>Status</th><th style="text-align:right">Valor</th><th></th></tr></thead>
      <tbody>${lista.map((l) => `<tr><td>${fmtDate(l.data)}</td><td>${esc(l.descricao)}</td><td>${esc(l.categoria)}</td><td>${formaLabel[l.forma] || ""}</td><td>${badge(l.status)}</td><td style="text-align:right;font-weight:600;white-space:nowrap;color:${l.tipo === "entrada" ? "var(--green)" : "var(--primary)"}">${l.tipo === "entrada" ? "+" : "−"} ${brl(l.valor)}</td><td><div class="row-actions"><button class="icon-btn" title="Editar" data-act="editar-lanc" data-id="${l.id}"><i class="fa-solid fa-pen"></i></button><button class="icon-btn danger" title="Excluir" data-act="excluir-lanc" data-id="${l.id}"><i class="fa-solid fa-trash"></i></button></div></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum lançamento</td></tr>`}</tbody>
    </table></div>
  </div>`;
}

function pgConfig() {
  const c = config;
  const planos = planosDe(c);
  const campoCor = (nome, rotulo) => `<div class="field"><label>${rotulo}</label><div class="cor-campo"><input type="color" name="${nome}" value="${esc(c[nome] || CORES_PADRAO[nome])}" /><input type="text" data-cor-texto="${nome}" value="${esc(c[nome] || CORES_PADRAO[nome])}" maxlength="7" /></div></div>`;
  return `
  <div class="page-head"><div><h1>Configurações</h1><p>Planos, aparência e dados que aparecem no site</p></div></div>

  <div class="panel">
    <div class="panel-head"><h2>Planos</h2><button class="btn btn-red btn-sm" data-act="novo-plano"><i class="fa-solid fa-plus"></i> Criar plano</button></div>
    <div class="plano-admin">${planos.map((p) => `
      <div class="item ${p.destaque ? "destaque" : ""}">
        <div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(p.nome)}</strong>${p.destaque ? `<span class="badge b-red">${esc(p.tag || "Destaque")}</span>` : ""}</div>
        <div style="font-size:1.4rem;font-weight:700">${brl(p.preco)} ${p.precoDe ? `<small style="color:var(--text-muted);text-decoration:line-through;font-size:.8rem">${brl(p.precoDe)}</small>` : ""}</div>
        <small style="color:var(--text-muted)">${p.acessoTotal ? "Acesso a todas as aulas" : "Só aulas liberadas para todos os planos"} · ${alunos().filter((a) => a.plano === p.id).length} aluno(s)</small>
        <ul>${(p.beneficios || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
        <small style="color:var(--text-muted)">${p.checkout ? "Checkout: " + esc(p.checkout) : "Sem link de checkout (usa o WhatsApp)"}</small>
        <div class="row-actions" style="margin-top:6px">
          <button class="icon-btn" title="Editar" data-act="editar-plano" data-id="${esc(p.id)}"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn danger" title="Excluir" data-act="excluir-plano" data-id="${esc(p.id)}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("")}</div>
  </div>

  <div class="panel"><form id="configForm">
    <div class="panel-head"><h2>Aparência do site</h2></div>
    <div class="form-grid">
      ${campoCor("corPrimaria", "Cor principal (botões e destaques)")}
      ${campoCor("corFundo", "Cor de fundo")}
      ${campoCor("corFundoSecundario", "Cor de fundo das seções alternadas")}
      ${campoCor("corTexto", "Cor do texto")}
      <div class="field full"><button type="button" class="btn btn-ghost btn-sm" id="resetCores">Restaurar cores padrão</button></div>
      <div class="field"><label>Nome da plataforma</label><input name="nome" value="${esc(c.nome)}" /></div>
      <div class="field"><label>E-mail do superadmin</label><input value="${esc(auth.currentUser?.email)}" disabled /><div class="help">Definido em js/firebase-config.js e firestore.rules.</div></div>
      <div class="field"><label>Título (início)</label><input name="heroPrefixo" value="${esc(c.heroPrefixo)}" /></div>
      <div class="field"><label>Título (parte colorida)</label><input name="heroDestaque" value="${esc(c.heroDestaque)}" /></div>
      <div class="field"><label>Título (final)</label><input name="heroSufixo" value="${esc(c.heroSufixo)}" /></div>
      <div class="field full"><label>Texto abaixo do título</label><textarea name="heroDescricao">${esc(c.heroDescricao)}</textarea></div>
      <div class="field full"><label>Foto do professor (aparece na seção "Quem ensina" do site)</label>
        <div class="foto-prof">
          <div class="foto-prof-prev" id="fotoPrev">${c.fotoProfessor ? `<img src="${esc(c.fotoProfessor)}" alt="" />` : '<i class="fa-solid fa-user"></i>'}</div>
          <div><input type="file" id="fotoArquivo" accept="image/*" />
            <input type="hidden" name="fotoProfessor" id="fotoDados" value="${esc(c.fotoProfessor)}" />
            <div class="help">Escolha uma foto do seu computador ou celular. Ela é reduzida automaticamente.</div>
            <button type="button" class="btn btn-ghost btn-sm" id="fotoRemover" style="margin-top:6px">Remover foto</button></div>
        </div></div>
      <div class="field"><label>Nome do professor</label><input name="nomeProfessor" value="${esc(c.nomeProfessor)}" /></div>
      <div class="field"><label>Cargo / título</label><input name="cargoProfessor" value="${esc(c.cargoProfessor)}" /></div>
      <div class="field full"><label>Texto "Quem ensina"</label><textarea name="textoProfessor" rows="5">${esc(c.textoProfessor)}</textarea><div class="help">Deixe uma linha em branco entre os parágrafos.</div></div>
      <div class="field full"><label>Vídeo de apresentação (código ou link do YouTube)</label><input name="videoApresentacao" value="${esc(c.videoApresentacao)}" /></div>
    </div>

    <div class="panel-head" style="margin-top:26px"><h2>Contato e suporte</h2></div>
    <div class="form-grid">
      <div class="field"><label>WhatsApp de suporte</label><input name="whatsappSuporte" value="${esc(c.whatsappSuporte)}" placeholder="(11) 99999-9999" /><div class="help">Aparece como ícone flutuante em todo o site e na área do aluno, e no botão "Falar com o suporte".</div></div>
      <div class="field"><label>WhatsApp de vendas</label><input name="whatsapp" value="${esc(c.whatsapp)}" placeholder="(11) 99999-9999" /><div class="help">Usado no botão de compra quando o plano não tem link de checkout. Em branco = usa o de suporte.</div></div>
      <div class="field full"><label>Link do grupo de suporte</label><input name="suporte" value="${esc(c.suporte)}" /></div>
    </div>
    <div class="form-actions"><button class="btn btn-red" type="submit">Salvar configurações</button></div>
  </form></div>`;
}

// ===================== EVENTOS DA PÁGINA =====================
function ligarEventosPagina() {
  const main = $("#adminMain");
  $$("[data-filtro]", main).forEach((el) => {
    const [grupo, chave] = el.dataset.filtro.split(".");
    el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      filtros[grupo][chave] = el.value;
      const pos = el.selectionStart;
      render();
      const novo = $(`[data-filtro="${el.dataset.filtro}"]`, main);
      if (el.tagName === "INPUT" && novo) {
        novo.focus();
        novo.setSelectionRange(pos, pos);
      }
    });
  });
  $$("[data-aba]", main).forEach((b) => b.addEventListener("click", () => { abaGestao = b.dataset.aba; render(); }));
  $$("[data-ir]", main).forEach((b) => b.addEventListener("click", () => { pagina = b.dataset.ir; render(); }));

  const cf = $("#configForm", main);
  if (cf) {
    // cor: seletor e campo de texto andam juntos
    $$("input[type=color]", cf).forEach((cor) => {
      const txt = $(`[data-cor-texto="${cor.name}"]`, cf);
      cor.addEventListener("input", () => (txt.value = cor.value));
      txt.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) cor.value = txt.value; });
    });
    $("#resetCores", cf).addEventListener("click", () => {
      Object.entries(CORES_PADRAO).forEach(([k, v]) => {
        cf.elements[k].value = v;
        $(`[data-cor-texto="${k}"]`, cf).value = v;
      });
    });
    // foto do professor: reduz para no máximo 600px e guarda junto com as configurações
    $("#fotoArquivo", cf).addEventListener("change", (e) => {
      const arq = e.target.files[0];
      if (!arq) return;
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, 600 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * esc);
        cv.height = Math.round(img.height * esc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const dados = cv.toDataURL("image/jpeg", 0.85);
        $("#fotoDados", cf).value = dados;
        $("#fotoPrev", cf).innerHTML = `<img src="${dados}" alt="" />`;
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => toast("Não foi possível ler esta imagem.", true);
      img.src = URL.createObjectURL(arq);
    });
    $("#fotoRemover", cf).addEventListener("click", () => {
      $("#fotoDados", cf).value = "";
      $("#fotoArquivo", cf).value = "";
      $("#fotoPrev", cf).innerHTML = '<i class="fa-solid fa-user"></i>';
    });
    cf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(cf));
      await salvar(
        () => setDoc(doc(db, "config", "site"), {
          ...fd,
          videoApresentacao: extractYoutubeId(fd.videoApresentacao) || config.videoApresentacao,
        }, { merge: true }),
        "Configurações salvas"
      );
    });
  }
}

// Executa uma gravação mostrando sucesso ou erro
async function salvar(fn, msg) {
  try {
    await fn();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    console.error(e);
    toast(mensagemErroAuth(e), true);
    return false;
  }
}

function travarBotao(form, texto = "Salvando...") {
  const btn = $("button[type=submit]", form);
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = texto;
  return () => { btn.disabled = false; btn.innerHTML = original; };
}

// ===================== AULAS =====================
function dadosVitrine(a) {
  return { titulo: a.titulo, modulo: a.modulo, ordem: a.ordem, duracao: a.duracao || "", descricao: a.descricao || "", gratuita: !!a.gratuita, plano: a.plano || "todos", status: a.status, yt: a.gratuita ? a.yt : "" };
}

async function gravarAula(id, dados) {
  const batch = writeBatch(db);
  batch.set(doc(db, "aulas", id), dados);
  batch.set(doc(db, "vitrine", id), dadosVitrine(dados));
  await batch.commit();
}

function formAula(a = {}) {
  const nova = !a.id;
  const moduloAtual = a.modulo || config.modulos[0];
  $("#formModalBody").innerHTML = `
    <h3>${nova ? "Nova aula" : "Editar aula"}</h3><p class="sub">Cole o código ou o link do vídeo do YouTube.</p>
    <form id="aulaForm"><div class="form-grid">
      <div class="field full"><label>Título da aula *</label><input name="titulo" required value="${esc(a.titulo)}" /></div>
      <div class="field full"><label>Código ou link do YouTube *</label><input name="yt" id="ytInput" required value="${esc(a.yt)}" placeholder="Ex.: 1OkCU_eg36E ou https://youtu.be/1OkCU_eg36E" />
        <div class="yt-preview"><img id="ytThumb" src="${thumb(a.yt)}" alt="" /><span id="ytTexto">${a.yt ? "Código: " + esc(a.yt) : "A miniatura aparece aqui"}</span></div>
        <div class="help">Dica: no YouTube, deixe o vídeo como "Não listado" para ele não aparecer nas buscas.</div></div>
      <div class="field"><label>Módulo *</label><select name="modulo">${opcoes(config.modulos.map((m) => [m, esc(m)]), moduloAtual)}</select></div>
      <div class="field"><label>Ordem no módulo</label><input name="ordem" type="number" min="1" value="${a.ordem || aulas.filter((x) => x.modulo === moduloAtual).length + 1}" /></div>
      <div class="field"><label>Duração</label><input name="duracao" value="${esc(a.duracao)}" placeholder="mm:ss" /></div>
      <div class="field"><label>Disponível para</label><select name="plano">${opcoes([["todos", "Todos os planos"], ["completo", "Só planos com acesso total"]], a.plano || "todos")}</select></div>
      <div class="field full"><label>Descrição</label><textarea name="descricao">${esc(a.descricao)}</textarea></div>
      <div class="field full"><label>Materiais para download</label><textarea name="materiais" placeholder="Um por linha: Nome | link&#10;Ex.: Código do site | https://drive.google.com/...">${esc(materiaisParaTexto(a.materiais))}</textarea><div class="help">Um material por linha, no formato <strong>Nome | link</strong>.</div></div>
      <div class="field"><label>Status</label><select name="status">${opcoes([["publicada", "Publicada"], ["rascunho", "Rascunho (oculta)"]], a.status || "publicada")}</select></div>
      <div class="field" style="display:flex;align-items:flex-end"><label class="check"><input type="checkbox" name="gratuita" ${a.gratuita ? "checked" : ""} /> Aula grátis (aberta no site de vendas)</label></div>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-red" type="submit">${nova ? "Cadastrar aula" : "Salvar"}</button></div></form>`;
  abrirModal("#formModal");
  $("#ytInput").addEventListener("input", (e) => {
    const id = extractYoutubeId(e.target.value);
    $("#ytThumb").src = thumb(id);
    $("#ytTexto").textContent = id ? "Código identificado: " + id : "Código inválido";
  });
  $("#aulaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const yt = extractYoutubeId(fd.yt);
    if (!yt) return toast("Código do YouTube inválido", true);
    const dados = {
      titulo: fd.titulo.trim(), yt, modulo: fd.modulo, ordem: Number(fd.ordem) || 1, duracao: fd.duracao.trim(),
      plano: fd.plano, descricao: fd.descricao.trim(), materiais: textoParaMateriais(fd.materiais),
      status: fd.status, gratuita: !!fd.gratuita, atualizadoEm: serverTimestamp(),
    };
    const destravar = travarBotao(e.target);
    const id = a.id || doc(collection(db, "aulas")).id;
    if (await salvar(() => gravarAula(id, dados), nova ? "Aula cadastrada" : "Aula atualizada")) fecharModais();
    destravar();
  });
}

function formModulos() {
  $("#formModalBody").innerHTML = `
    <h3>Módulos</h3><p class="sub">A ordem aqui é a ordem em que os módulos aparecem para o aluno.</p>
    <div class="list">${config.modulos.map((m, i) => `<div class="list-item"><div class="grow"><strong>${esc(m)}</strong><small>${aulas.filter((a) => a.modulo === m).length} aulas</small></div><button class="icon-btn" title="Subir" data-mod-subir="${i}"><i class="fa-solid fa-arrow-up"></i></button><button class="icon-btn danger" title="Excluir" data-mod-excluir="${i}"><i class="fa-solid fa-trash"></i></button></div>`).join("")}</div>
    <form id="modForm" style="display:flex;gap:10px;margin-top:18px"><div class="field" style="flex:1"><input name="nome" placeholder="Nome do novo módulo" required /></div><button class="btn btn-red" type="submit">Adicionar</button></form>`;
  abrirModal("#formModal");
  const gravar = async (lista) => {
    if (await salvar(() => setDoc(doc(db, "config", "site"), { modulos: lista }, { merge: true }))) {
      config.modulos = lista;
      formModulos();
    }
  };
  $("#modForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    if (nome && !config.modulos.includes(nome)) gravar([...config.modulos, nome]);
  });
  $$("[data-mod-subir]").forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.modSubir;
    if (i === 0) return;
    const lista = [...config.modulos];
    [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    gravar(lista);
  }));
  $$("[data-mod-excluir]").forEach((b) => b.addEventListener("click", () => {
    const m = config.modulos[+b.dataset.modExcluir];
    if (aulas.some((a) => a.modulo === m)) return toast("Mova ou exclua as aulas deste módulo antes", true);
    gravar(config.modulos.filter((x) => x !== m));
  }));
}

function verAula(a) {
  playerAtual?.destruir();
  playerAtual = null;
  abrirVideo($("#playerFrame"), a.yt).then((p) => {
    if (!$("#playerModal").classList.contains("active")) p.destruir();
    else playerAtual = p;
  });
  $("#playerModulo").textContent = a.modulo.toUpperCase();
  $("#playerTitulo").textContent = a.titulo;
  $("#playerDesc").textContent = a.descricao || "";
  abrirModal("#playerModal");
}
let playerAtual = null;
document.addEventListener("modais-fechados", () => { playerAtual?.destruir(); playerAtual = null; $("#playerFrame").innerHTML = ""; });

// ===================== ALUNOS =====================
function formAluno(a = {}) {
  const novo = !a.id;
  $("#formModalBody").innerHTML = `
    <h3>${novo ? "Novo aluno" : "Editar aluno"}</h3>
    <p class="sub">${novo ? "Você define o e-mail e a senha de login. Passe os dois para o aluno entrar na área dele." : "O e-mail de login não pode ser alterado."}</p>
    <form id="alunoForm"><div class="form-grid">
      <div class="field full"><label>Nome completo *</label><input name="nome" required value="${esc(a.nome)}" /></div>
      <div class="field"><label>E-mail (login) *</label><input name="email" type="email" required value="${esc(a.email)}" ${novo ? "" : "disabled"} /></div>
      ${novo ? `<div class="field"><label>Senha de acesso *</label><input name="senha" type="text" required minlength="6" autocomplete="off" placeholder="mínimo 6 caracteres" /><div class="help">Será a senha que o aluno usa para entrar.</div></div>` : ""}
      <div class="field"><label>WhatsApp</label><input name="telefone" value="${esc(a.telefone)}" placeholder="(00) 00000-0000" /></div>
      <div class="field"><label>CPF</label><input name="cpf" value="${esc(a.cpf)}" placeholder="opcional" /></div>
      <div class="field"><label>Plano *</label><select name="plano" id="alunoPlano">${opcoes(planosDe(config).map((p) => [p.id, esc(p.nome)]), a.plano || planosDe(config).slice(-1)[0].id)}</select></div>
      <div class="field"><label>Valor pago (R$)</label><input name="valor" id="alunoValor" type="number" step="0.01" value="${a.valor ?? (planosDe(config).find((p) => p.id === (a.plano || planosDe(config).slice(-1)[0].id))?.preco ?? 0)}" /></div>
      <div class="field"><label>Forma de pagamento</label><select name="pagamento">${opcoes(Object.entries(formaLabel), a.pagamento || "pix")}</select></div>
      <div class="field"><label>Status do pagamento</label><select name="statusPag">${opcoes([["pago", "Pago"], ["pendente", "Pendente"], ["reembolsado", "Reembolsado"], ["cancelado", "Cancelado"]], a.statusPag || "pago")}</select></div>
      <div class="field"><label>Status do acesso</label><select name="status">${opcoes([["ativo", "Ativo"], ["pendente", "Pendente"], ["bloqueado", "Bloqueado"]], a.status || "ativo")}</select></div>
      <div class="field"><label>Data da matrícula</label><input name="matricula" type="date" value="${a.matricula || hojeISO()}" /></div>
      <div class="field"><label>Acesso válido até</label><input name="validade" type="date" value="${a.validade || ""}" /><div class="help">Em branco = acesso vitalício</div></div>
      <div class="field full"><label>Observações</label><textarea name="obs">${esc(a.obs)}</textarea></div>
      ${novo ? `<div class="field full" style="display:grid;gap:8px">
        <label class="check"><input type="checkbox" name="lancar" checked /> Lançar a venda no financeiro</label></div>` : ""}
    </div><div class="form-erro form-error" id="alunoErro"></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-red" type="submit">${novo ? "Cadastrar aluno" : "Salvar"}</button></div></form>`;
  abrirModal("#formModal");
  if (novo) {
    $("#alunoPlano").addEventListener("change", (e) => {
      $("#alunoValor").value = planosDe(config).find((p) => p.id === e.target.value)?.preco ?? 0;
    });
  }
  $("#alunoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const dados = {
      nome: fd.nome.trim(), telefone: fd.telefone.trim(), cpf: fd.cpf.trim(), plano: fd.plano,
      acessoTotal: !!planosDe(config).find((p) => p.id === fd.plano)?.acessoTotal,
      valor: Number(fd.valor) || 0, pagamento: fd.pagamento, statusPag: fd.statusPag, status: fd.status,
      matricula: fd.matricula, validade: fd.validade, obs: fd.obs.trim(),
    };
    const destravar = travarBotao(e.target);
    try {
      if (novo) await cadastrarAluno(fd.email.trim().toLowerCase(), fd.senha, dados, !!fd.lancar);
      else await updateDoc(doc(db, "alunos", a.id), dados);
      fecharModais();
      toast(novo ? "Aluno cadastrado" : "Aluno atualizado");
    } catch (err) {
      console.error(err);
      $("#alunoErro").textContent = err.mensagem || mensagemErroAuth(err);
    } finally {
      destravar();
    }
  });
}

async function cadastrarAluno(email, senha, dados, lancar) {
  if (isAdminEmail(email)) throw { mensagem: "Este é o e-mail do superadmin." };
  const existente = todosAlunos.find((x) => (x.email || "").toLowerCase() === email);
  if (existente && existente.status !== "excluido") throw { mensagem: "Já existe um aluno com este e-mail." };

  if (!existente && (!senha || senha.length < 6)) throw { mensagem: "A senha precisa ter pelo menos 6 caracteres." };

  let id, reenviar = false;
  if (existente) {
    // Aluno excluído antes: reaproveita a mesma conta de login
    id = existente.id;
    await updateDoc(doc(db, "alunos", id), { ...dados, email, progresso: [] });
    reenviar = true; // conta já existe: a senha só muda pelo e-mail de redefinição
  } else {
    try {
      id = await criarContaAluno(email, senha);
    } catch (err) {
      if ((err.code || "").includes("email-already-in-use"))
        throw { mensagem: "Este e-mail já tem login no Firebase, mas não está na lista de alunos. Apague o usuário em Authentication no Console do Firebase e tente de novo." };
      throw err;
    }
    await setDoc(doc(db, "alunos", id), { ...dados, email, progresso: [], ultimoAcesso: "", criadoEm: serverTimestamp() });
  }
  if (lancar && dados.valor > 0) {
    await addDoc(collection(db, "lancamentos"), {
      data: dados.matricula, tipo: "entrada", descricao: `Venda – ${dados.nome} (${planoLabel[dados.plano]})`,
      categoria: "Venda", valor: dados.valor, forma: dados.pagamento,
      status: dados.statusPag === "pago" ? "pago" : dados.statusPag === "reembolsado" ? "reembolsado" : "pendente",
      alunoId: id,
    });
  }
  if (reenviar) {
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Conta antiga reaproveitada: enviamos um e-mail para o aluno definir a nova senha.");
    } catch (err) {
      console.error(err);
      toast("Aluno recadastrado, mas o e-mail de nova senha não foi enviado. Use o botão de reenviar.", true);
    }
  }
}

function detalheAluno(a) {
  const lista = aulasDoAluno(a);
  const p = progressoPct(a);
  const prog = progressoDe(a);
  $("#formModalBody").innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px"><div class="avatar" style="width:56px;height:56px;font-size:1.2rem">${initials(a.nome)}</div><div><h3>${esc(a.nome)}</h3><p class="sub" style="margin:0">${esc(a.email)} · ${esc(a.telefone || "sem telefone")}${a.cpf ? " · CPF " + esc(a.cpf) : ""}</p></div></div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><div class="label">Plano</div><div class="value" style="font-size:1.1rem">${planoLabel[a.plano]}</div><div class="delta">${brl(a.valor)} · ${formaLabel[a.pagamento] || ""}</div></div>
      <div class="kpi"><div class="label">Progresso</div><div class="value" style="font-size:1.1rem">${p}%</div><div class="progress" style="margin-top:6px"><span style="width:${p}%"></span></div></div>
      <div class="kpi"><div class="label">Último acesso</div><div class="value" style="font-size:1.1rem">${fmtDate(a.ultimoAcesso)}</div><div class="delta">Matrícula ${fmtDate(a.matricula)}</div></div>
    </div>
    <div class="panel-head"><h2 style="font-size:.95rem">Aulas</h2></div>
    <div class="list">${lista.map((x) => `<div class="list-item"><i class="fa-solid ${prog.includes(x.id) ? "fa-circle-check" : "fa-circle"}" style="color:${prog.includes(x.id) ? "var(--green)" : "var(--text-muted)"}"></i><div class="grow">${esc(x.titulo)}<small>${esc(x.modulo)}</small></div></div>`).join("") || '<div class="empty">Nenhuma aula disponível</div>'}</div>
    ${a.obs ? `<p style="margin-top:18px;font-size:.85rem;color:var(--text-secondary)"><strong>Obs.:</strong> ${esc(a.obs)}</p>` : ""}
    <div class="form-actions"><button class="btn btn-ghost" data-act="zerar-progresso" data-id="${a.id}">Zerar progresso</button><button class="btn btn-red" data-act="editar-aluno" data-id="${a.id}">Editar</button></div>`;
  abrirModal("#formModal");
}

// ===================== FINANCEIRO =====================
function formLancamento(l = {}) {
  const novo = !l.id;
  const categorias = ["Venda", "Mentoria", "Marketing", "Infraestrutura", "Ferramentas", "Impostos", "Outros"];
  $("#formModalBody").innerHTML = `
    <h3>${novo ? "Novo lançamento" : "Editar lançamento"}</h3><p class="sub">Registre vendas, mentorias, despesas e reembolsos.</p>
    <form id="lancForm"><div class="form-grid">
      <div class="field"><label>Tipo</label><select name="tipo">${opcoes([["entrada", "Entrada"], ["saida", "Saída"]], l.tipo || "entrada")}</select></div>
      <div class="field"><label>Data</label><input type="date" name="data" required value="${l.data || hojeISO()}" /></div>
      <div class="field full"><label>Descrição *</label><input name="descricao" required value="${esc(l.descricao)}" /></div>
      <div class="field"><label>Categoria</label><select name="categoria">${opcoes(categorias.map((c) => [c, c]), l.categoria || "Venda")}</select></div>
      <div class="field"><label>Valor (R$) *</label><input type="number" step="0.01" min="0" name="valor" required value="${l.valor ?? ""}" /></div>
      <div class="field"><label>Forma</label><select name="forma">${opcoes(Object.entries(formaLabel), l.forma || "pix")}</select></div>
      <div class="field"><label>Status</label><select name="status">${opcoes([["pago", "Pago"], ["pendente", "Pendente"], ["reembolsado", "Reembolsado"]], l.status || "pago")}</select></div>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-red" type="submit">Salvar</button></div></form>`;
  abrirModal("#formModal");
  $("#lancForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const dados = { ...fd, descricao: fd.descricao.trim(), valor: Number(fd.valor) || 0 };
    const destravar = travarBotao(e.target);
    const ok = await salvar(
      () => (novo ? addDoc(collection(db, "lancamentos"), dados) : updateDoc(doc(db, "lancamentos", l.id), dados)),
      "Lançamento salvo"
    );
    destravar();
    if (ok) fecharModais();
  });
}

// ===================== PLANOS =====================
function formPlano(p = {}) {
  const novo = !p.id;
  $("#formModalBody").innerHTML = `
    <h3>${novo ? "Criar plano" : "Editar plano"}</h3>
    <div class="checklist-plano"><strong>O que precisa para criar o plano:</strong>
      <ol style="margin:6px 0 0 18px">
        <li><strong>Nome</strong> do plano (aparece no site e na área do aluno) *</li>
        <li><strong>Preço</strong> de venda *</li>
        <li><strong>Benefícios</strong>: o que o aluno recebe, um por linha *</li>
        <li><strong>Acesso às aulas</strong>: marque se o plano libera todas as aulas</li>
        <li><strong>Link de checkout</strong> (Kiwify, Hotmart, Mercado Pago...) — opcional; sem ele o botão abre o WhatsApp</li>
        <li><strong>Destaque</strong> e selo (ex.: MAIS VENDIDO) — opcional</li>
      </ol></div>
    <form id="planoForm"><div class="form-grid">
      <div class="field full"><label>Nome do plano *</label><input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Premium" /></div>
      <div class="field"><label>Preço (R$) *</label><input name="preco" type="number" step="0.01" min="0" required value="${p.preco ?? ""}" /></div>
      <div class="field"><label>Preço "de" (riscado)</label><input name="precoDe" type="number" step="0.01" min="0" value="${p.precoDe || ""}" /></div>
      <div class="field full"><label>Benefícios * (um por linha)</label><textarea name="beneficios" required placeholder="Todas as aulas&#10;Suporte no grupo&#10;Acesso vitalício">${esc((p.beneficios || []).join("\n"))}</textarea></div>
      <div class="field full"><label>Link de checkout</label><input name="checkout" value="${esc(p.checkout)}" placeholder="https://..." /></div>
      <div class="field"><label>Selo de destaque</label><input name="tag" value="${esc(p.tag)}" placeholder="MAIS VENDIDO" /></div>
      <div class="field" style="align-content:end;gap:10px">
        <label class="check"><input type="checkbox" name="destaque" ${p.destaque ? "checked" : ""} /> Destacar este plano no site</label>
        <label class="check"><input type="checkbox" name="acessoTotal" ${p.acessoTotal ? "checked" : ""} /> Libera todas as aulas</label>
      </div>
    </div><div class="form-error" id="planoErro"></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-red" type="submit">${novo ? "Criar plano" : "Salvar"}</button></div></form>`;
  abrirModal("#formModal");
  $("#planoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const lista = planosDe(config);
    let id = p.id;
    if (novo) {
      const base = fd.nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plano";
      id = base;
      for (let i = 2; lista.some((x) => x.id === id); i++) id = `${base}-${i}`;
    }
    const plano = {
      id, nome: fd.nome.trim(), preco: Number(fd.preco) || 0, precoDe: Number(fd.precoDe) || 0,
      checkout: fd.checkout.trim(), tag: fd.tag.trim(), destaque: !!fd.destaque, acessoTotal: !!fd.acessoTotal,
      beneficios: fd.beneficios.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    if (!plano.beneficios.length) return ($("#planoErro").textContent = "Informe pelo menos um benefício.");
    const nova = novo ? [...lista, plano] : lista.map((x) => (x.id === id ? plano : x));
    const destravar = travarBotao(e.target);
    if (await salvar(() => setDoc(doc(db, "config", "site"), { planos: nova }, { merge: true }), novo ? "Plano criado" : "Plano atualizado")) fecharModais();
    destravar();
  });
}

// ===================== MATERIAIS DE APOIO =====================
function pgMateriais() {
  return `
  <div class="page-head"><div><h1>Materiais de apoio</h1><p>Arquivos e links que aparecem na aba Materiais do aluno</p></div>
    <button class="btn btn-red" data-act="novo-material"><i class="fa-solid fa-plus"></i> Novo material</button></div>
  <div class="panel"><div class="table-wrap"><table>
    <thead><tr><th>Material</th><th>Categoria</th><th>Disponível para</th><th>Status</th><th></th></tr></thead>
    <tbody>${[...materiais].sort((a, b) => (a.categoria || "").localeCompare(b.categoria || "") || (a.nome || "").localeCompare(b.nome || "")).map((m) => `<tr>
      <td><strong>${esc(m.nome)}</strong><small class="sub-cell">${esc(m.descricao || m.url)}</small></td>
      <td>${esc(m.categoria || "Geral")}</td>
      <td>${badge(m.plano, m.plano === "todos" ? "Todos" : "Acesso total")}</td>
      <td>${badge(m.status)}</td>
      <td><div class="row-actions">
        <a class="icon-btn" title="Abrir" href="${esc(m.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        <button class="icon-btn" title="Editar" data-act="editar-material" data-id="${m.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" title="Excluir" data-act="excluir-material" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
      </div></td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nenhum material cadastrado</td></tr>`}</tbody>
  </table></div></div>`;
}

function formMaterial(m = {}) {
  const novo = !m.id;
  $("#formModalBody").innerHTML = `
    <h3>${novo ? "Novo material de apoio" : "Editar material"}</h3>
    <p class="sub">Cole o link do arquivo (Google Drive, Dropbox, GitHub...). Ele aparece na aba Materiais do aluno.</p>
    <form id="materialForm"><div class="form-grid">
      <div class="field full"><label>Nome *</label><input name="nome" required value="${esc(m.nome)}" placeholder="Ex.: Site da Barbearia (código-fonte)" /></div>
      <div class="field full"><label>Link para baixar/abrir *</label><input name="url" type="url" required value="${esc(m.url)}" placeholder="https://..." /></div>
      <div class="field full"><label>Descrição</label><input name="descricao" value="${esc(m.descricao)}" /></div>
      <div class="field"><label>Categoria</label><input name="categoria" value="${esc(m.categoria || "")}" placeholder="Ex.: Código-fonte, PDFs, Planilhas" /></div>
      <div class="field"><label>Disponível para</label><select name="plano">${opcoes([["todos", "Todos os planos"], ["completo", "Só planos com acesso total"]], m.plano || "todos")}</select></div>
      <div class="field"><label>Status</label><select name="status">${opcoes([["publicada", "Publicado"], ["rascunho", "Rascunho (oculto)"]], m.status || "publicada")}</select></div>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-red" type="submit">${novo ? "Cadastrar" : "Salvar"}</button></div></form>`;
  abrirModal("#formModal");
  $("#materialForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const dados = {
      nome: fd.nome.trim(), url: fd.url.trim(), descricao: fd.descricao.trim(),
      categoria: fd.categoria.trim() || "Geral", plano: fd.plano, status: fd.status,
    };
    const destravar = travarBotao(e.target);
    const ok = await salvar(
      () => (novo ? addDoc(collection(db, "materiais"), dados) : updateDoc(doc(db, "materiais", m.id), dados)),
      "Material salvo"
    );
    destravar();
    if (ok) fecharModais();
  });
}

// ===================== AÇÕES =====================
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = b.dataset.id;
  const aula = aulas.find((x) => x.id === id);
  const aluno = todosAlunos.find((x) => x.id === id);
  const lanc = lancamentos.find((x) => x.id === id);
  const refAluno = () => doc(db, "alunos", id);

  switch (b.dataset.act) {
    case "nova-aula": return formAula();
    case "editar-aula": return formAula(aula);
    case "ver-aula": return verAula(aula);
    case "modulos": return formModulos();
    case "excluir-aula":
      if (!confirm(`Excluir a aula "${aula.titulo}"?`)) return;
      return salvar(async () => {
        const batch = writeBatch(db);
        batch.delete(doc(db, "aulas", id));
        batch.delete(doc(db, "vitrine", id));
        await batch.commit();
      }, "Aula excluída");

    case "novo-plano": return formPlano();
    case "editar-plano": return formPlano(planosDe(config).find((p) => p.id === id));
    case "excluir-plano": {
      const lista = planosDe(config);
      const p = lista.find((x) => x.id === id);
      if (lista.length <= 1) return toast("Mantenha pelo menos um plano.", true);
      const usando = alunos().filter((x) => x.plano === id).length;
      if (!confirm(`Excluir o plano "${p.nome}"?${usando ? `\n${usando} aluno(s) estão nele e continuam com o acesso atual.` : ""}`)) return;
      return salvar(() => setDoc(doc(db, "config", "site"), { planos: lista.filter((x) => x.id !== id) }, { merge: true }), "Plano excluído");
    }

    case "novo-material": return formMaterial();
    case "editar-material": return formMaterial(materiais.find((x) => x.id === id));
    case "excluir-material": {
      const m = materiais.find((x) => x.id === id);
      if (!confirm(`Excluir o material "${m.nome}"?`)) return;
      return salvar(() => deleteDoc(doc(db, "materiais", id)), "Material excluído");
    }


    case "novo-aluno": return formAluno();
    case "editar-aluno": return formAluno(aluno);
    case "detalhe-aluno": return detalheAluno(aluno);
    case "reenviar":
      return salvar(() => sendPasswordResetEmail(auth, aluno.email), `E-mail de acesso enviado para ${aluno.email}`);
    case "bloqueio": {
      const novo = aluno.status === "bloqueado" ? "ativo" : "bloqueado";
      return salvar(() => updateDoc(refAluno(), { status: novo }), novo === "bloqueado" ? "Acesso bloqueado" : "Acesso liberado");
    }
    case "excluir-aluno":
      if (!confirm(`Excluir o aluno ${aluno.nome}? Ele perde o acesso imediatamente.`)) return;
      return salvar(() => updateDoc(refAluno(), { status: "excluido" }), "Aluno excluído");
    case "zerar-progresso":
      if (!confirm("Zerar o progresso deste aluno?")) return;
      fecharModais();
      return salvar(() => updateDoc(refAluno(), { progresso: [] }), "Progresso zerado");
    case "confirmar-pag":
      return salvar(async () => {
        const batch = writeBatch(db);
        batch.update(refAluno(), { statusPag: "pago", status: "ativo" });
        lancamentos.filter((l) => l.alunoId === id && l.status === "pendente").forEach((l) => batch.update(doc(db, "lancamentos", l.id), { status: "pago" }));
        await batch.commit();
      }, "Pagamento confirmado e acesso liberado");
    case "renovar": {
      const base = aluno.validade && aluno.validade > hojeISO() ? new Date(aluno.validade + "T12:00:00") : new Date();
      base.setFullYear(base.getFullYear() + 1);
      const validade = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      return salvar(() => updateDoc(refAluno(), { validade, status: "ativo" }), "Acesso renovado até " + fmtDate(validade));
    }

    case "novo-lanc": return formLancamento();
    case "editar-lanc": return formLancamento(lanc);
    case "excluir-lanc":
      if (!confirm("Excluir este lançamento?")) return;
      return salvar(() => deleteDoc(doc(db, "lancamentos", id)), "Lançamento excluído");

    case "exportar-fin":
      return baixarCsv("financeiro.csv", [
        ["Data", "Tipo", "Descrição", "Categoria", "Forma", "Status", "Valor"],
        ...[...lancamentos].sort((x, y) => (x.data || "").localeCompare(y.data || "")).map((l) => [fmtDate(l.data), capitalizar(l.tipo), l.descricao, l.categoria, formaLabel[l.forma] || "", capitalizar(l.status), String(l.valor).replace(".", ",")]),
      ]);
    case "exportar-alunos":
      return baixarCsv("alunos.csv", [
        ["Nome", "E-mail", "WhatsApp", "CPF", "Plano", "Valor", "Pagamento", "Status pagamento", "Acesso", "Matrícula", "Validade", "Progresso %", "Último acesso"],
        ...alunos().map((a) => [a.nome, a.email, a.telefone, a.cpf, planoLabel[a.plano], String(a.valor).replace(".", ","), formaLabel[a.pagamento] || "", capitalizar(a.statusPag), capitalizar(a.status), fmtDate(a.matricula), a.validade ? fmtDate(a.validade) : "Vitalício", progressoPct(a), fmtDate(a.ultimoAcesso)]),
      ]);
  }
});
