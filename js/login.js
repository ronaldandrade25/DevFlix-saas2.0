// Tela de login do app (é por aqui que o app instalado abre)
import { auth, db, configurado, avisoConfiguracao, onAuthStateChanged, doc, getDoc } from "./firebase.js";
import { $, toast, CONFIG_PADRAO, aplicarTema, botaoWhatsapp } from "./comum.js";
import { entrar, redefinirSenha, irParaArea, verificarAluno } from "./acesso.js";
import { ligarBotoesInstalar } from "./pwa.js";
import { isAdminEmail, signOut } from "./firebase.js";

avisoConfiguracao();
ligarBotoesInstalar();

function mostrarLogin() {
  $("#carregando").classList.add("hidden");
}

if (!configurado) {
  mostrarLogin();
} else {
  // Cores e WhatsApp do superadmin também valem aqui
  getDoc(doc(db, "config", "site"))
    .then((s) => {
      const cfg = { ...CONFIG_PADRAO, ...(s.data() || {}) };
      aplicarTema(cfg);
      botaoWhatsapp(cfg);
    })
    .catch(console.error);

  // Quem já está logado vai direto para a própria área
  onAuthStateChanged(auth, async (user) => {
    if (!user) return mostrarLogin();
    try {
      if (!isAdminEmail(user.email)) {
        const msg = await verificarAluno(user);
        if (msg) {
          await signOut(auth);
          mostrarLogin();
          $("#loginErro").textContent = msg;
          return;
        }
      }
      irParaArea(user);
    } catch (e) {
      console.error(e);
      mostrarLogin();
    }
  });
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = $("#loginErro");
  erro.textContent = "";
  if (!configurado) {
    erro.textContent = "Firebase ainda não configurado (js/firebase-config.js).";
    return;
  }
  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.textContent = "Entrando...";
  erro.textContent = await entrar($("#loginEmail").value, $("#loginSenha").value);
  btn.disabled = false;
  btn.textContent = "Entrar";
});

$("#esqueciSenha").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  const erro = $("#loginErro");
  if (!email) {
    erro.textContent = "Digite seu e-mail acima e clique novamente.";
    $("#loginEmail").focus();
    return;
  }
  if (!configurado) return;
  erro.textContent = await redefinirSenha(email);
  if (!erro.textContent) toast("Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.");
});
