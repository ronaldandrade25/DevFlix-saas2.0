// Funções compartilhadas entre o site, o superadmin e a área do aluno

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d) => (d ? d.split("-").reverse().join("/") : "—");

export function hojeISO(somarDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + somarDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const initials = (nome) =>
  String(nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const thumb = (yt) => (yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : "");

export function extractYoutubeId(input) {
  const v = String(input || "").trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : "";
}

export const formaLabel = { pix: "Pix", cartao: "Cartão", boleto: "Boleto", outro: "Outro" };

const badgeCor = {
  ativo: "b-green", pendente: "b-yellow", bloqueado: "b-red",
  pago: "b-green", reembolsado: "b-gray", cancelado: "b-red",
  publicada: "b-green", rascunho: "b-yellow",
  completo: "b-red", todos: "b-blue", basico: "b-blue",
};
export const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
export const badge = (s, label) => `<span class="badge ${badgeCor[s] || "b-gray"}">${esc(label || capitalizar(s))}</span>`;

// Ordena aulas pela ordem dos módulos e depois pela ordem dentro do módulo
export function ordenarAulas(aulas, modulos = []) {
  const pos = (m) => (modulos.includes(m) ? modulos.indexOf(m) : 999);
  return [...aulas].sort((a, b) => pos(a.modulo) - pos(b.modulo) || (a.ordem || 0) - (b.ordem || 0));
}

// Materiais: cada linha "Nome | link"
export function materiaisParaTexto(lista = []) {
  return lista.map((m) => `${m.nome} | ${m.url}`).join("\n");
}
export function textoParaMateriais(texto = "") {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nome, ...resto] = l.split("|");
      const url = resto.join("|").trim();
      return url ? { nome: nome.trim(), url } : { nome: nome.trim(), url: nome.trim() };
    });
}

export function toast(msg, erro = false) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle("erro", erro);
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3000);
}

export function abrirModal(sel) {
  $(sel).classList.add("active");
}
export function fecharModais() {
  $$(".modal").forEach((m) => m.classList.remove("active"));
  document.dispatchEvent(new CustomEvent("modais-fechados"));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-modal]")) fecharModais();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModais();
});

export function baixarCsv(nome, linhas) {
  const csv = linhas.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
}

export function mensagemErroAuth(err) {
  const c = err?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "E-mail ou senha incorretos.";
  if (c.includes("invalid-email")) return "E-mail inválido.";
  if (c.includes("too-many-requests")) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (c.includes("network")) return "Sem conexão. Verifique sua internet.";
  if (c.includes("email-already-in-use")) return "Este e-mail já tem uma conta de login.";
  if (c.includes("permission-denied")) return "Sem permissão. Confira as regras do Firestore.";
  return "Não foi possível concluir. Tente novamente.";
}

// Configuração padrão do site (usada até o superadmin salvar a dele)
export const CONFIG_PADRAO = {
  nome: "DEV Freelancer B2B",
  videoApresentacao: "HDfmEtZ5eM0",
  precoBasico: 197,
  precoBasicoDe: 297,
  precoCompleto: 397,
  precoCompletoDe: 597,
  checkoutBasico: "",
  checkoutCompleto: "",
  whatsapp: "",
  whatsappSuporte: "",
  heroPrefixo: "Crie e venda",
  heroDestaque: "sistemas de agendamento",
  heroSufixo: "do zero",
  heroDescricao: "Aprenda a construir SaaS completos para barbearias, pet shops e salões de beleza, com Firebase, painel administrativo e estratégias para fechar clientes.",
  corPrimaria: "#ff1f1f",
  corFundo: "#050505",
  corFundoSecundario: "#0d0d0d",
  corTexto: "#ffffff",
  planos: [],
  fotoProfessor: "",
  nomeProfessor: "Rodolfo Mori",
  cargoProfessor: "Programador Sênior",
  textoProfessor: "Criada por Rodolfo Mori, ex-eletricista que se tornou programador sênior em empresas como Santander, BTG Pactual, PI Investimentos e Toro Investimentos.\n\nMetodologia direta ao ponto, com suporte, mentorias e foco no que o mercado realmente exige, mesmo para quem não tem experiência, faculdade ou computador de última geração.",
  suporte: "https://chat.whatsapp.com/JPX8TaZEtibIY6xQcti2Dx",
  modulos: ["Sistemas SaaS", "Vendas", "Firebase", "Aulas Extras"],
};

// ===================== PLANOS =====================
// Rótulos dos planos (id -> nome). É preenchido por aplicarPlanos().
export const planoLabel = {};

// Planos vêm de config.planos. Se o superadmin ainda não criou nenhum,
// monta os dois planos antigos (Básico e Completo) a partir dos campos antigos.
export function planosDe(cfg) {
  if (Array.isArray(cfg.planos) && cfg.planos.length) return cfg.planos;
  return [
    {
      id: "basico", nome: "Básico", preco: cfg.precoBasico, precoDe: cfg.precoBasicoDe,
      checkout: cfg.checkoutBasico || "", destaque: false, tag: "", acessoTotal: false,
      beneficios: ["Aulas dos sistemas SaaS", "Downloads dos sites", "Área do aluno com progresso"],
    },
    {
      id: "completo", nome: "Completo", preco: cfg.precoCompleto, precoDe: cfg.precoCompletoDe,
      checkout: cfg.checkoutCompleto || "", destaque: true, tag: "MAIS VENDIDO", acessoTotal: true,
      beneficios: ["Todas as aulas e aulas extras", "Sites + painéis ADM + Firebase", "Prospecção e vendas", "Grupo de suporte", "Acesso vitalício"],
    },
  ];
}

export function aplicarPlanos(cfg) {
  const planos = planosDe(cfg);
  Object.keys(planoLabel).forEach((k) => delete planoLabel[k]);
  planos.forEach((p) => (planoLabel[p.id] = p.nome));
  return planos;
}

// O aluno vê todas as aulas se o plano dele tem "acesso total"
// (alunos antigos: o plano "completo").
export const temAcessoTotal = (al) => (al.acessoTotal ?? al.plano === "completo") === true;

// ===================== TEMA E WHATSAPP =====================
export const CORES_PADRAO = {
  corPrimaria: "#ff1f1f",
  corFundo: "#050505",
  corFundoSecundario: "#0d0d0d",
  corTexto: "#ffffff",
};

function escurecer(hex, f = 0.8) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * f).toString(16).padStart(2, "0");
  return "#" + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
}

export function aplicarTema(cfg) {
  const ok = (v, padrao) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : padrao);
  const r = document.documentElement.style;
  const primaria = ok(cfg.corPrimaria, CORES_PADRAO.corPrimaria);
  r.setProperty("--primary", primaria);
  r.setProperty("--primary-dark", escurecer(primaria));
  r.setProperty("--bg-main", ok(cfg.corFundo, CORES_PADRAO.corFundo));
  r.setProperty("--bg-secondary", ok(cfg.corFundoSecundario, CORES_PADRAO.corFundoSecundario));
  r.setProperty("--text-primary", ok(cfg.corTexto, CORES_PADRAO.corTexto));
}

// Número só com dígitos; 10 ou 11 dígitos = sem DDI, então acrescenta o 55 do Brasil
export function linkWhatsapp(numero, texto = "") {
  let n = String(numero || "").replace(/\D/g, "");
  if (!n) return "";
  if (n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

// Ícone flutuante do WhatsApp (suporte) em todas as páginas em que for chamado
export function botaoWhatsapp(cfg) {
  let a = document.getElementById("whatsFlutuante");
  const href = linkWhatsapp(cfg.whatsappSuporte, `Olá! Preciso de ajuda com a ${cfg.nome}.`);
  if (!href) return a?.remove();
  if (!a) {
    a = document.createElement("a");
    a.id = "whatsFlutuante";
    a.className = "whats-flutuante";
    a.target = "_blank";
    a.rel = "noopener";
    a.title = "Fale com o suporte no WhatsApp";
    a.setAttribute("aria-label", "Suporte no WhatsApp");
    a.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
    document.body.appendChild(a);
  }
  a.href = href;
}

// ===================== MENU LATERAL NO CELULAR =====================
function ligarMenuMobile() {
  const btn = document.getElementById("btnMenu");
  const lateral = document.querySelector(".sidebar");
  const fundo = document.getElementById("menuOverlay");
  if (!btn || !lateral || !fundo) return;
  const alternar = (abrir) => {
    lateral.classList.toggle("aberto", abrir);
    fundo.classList.toggle("aberto", abrir);
  };
  btn.addEventListener("click", () => alternar(!lateral.classList.contains("aberto")));
  fundo.addEventListener("click", () => alternar(false));
  lateral.addEventListener("click", (e) => { if (e.target.closest("button")) alternar(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") alternar(false); });
}
ligarMenuMobile();
