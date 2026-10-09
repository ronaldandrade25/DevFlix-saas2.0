// Login compartilhado entre o modal do site (vendas.js) e a tela de login do app (login.js)
import {
  auth, db, isAdminEmail, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, doc, getDoc,
} from "./firebase.js";
import { hojeISO, mensagemErroAuth } from "./comum.js";

export const irParaArea = (user) => {
  window.location.href = isAdminEmail(user.email) ? "admin.html" : "aluno.html";
};

// Confere se o aluno pode entrar. Retorna mensagem de erro ou "" se estiver liberado.
export async function verificarAluno(user) {
  const snap = await getDoc(doc(db, "alunos", user.uid));
  if (!snap.exists() || snap.data().status === "excluido") return "Cadastro não encontrado. Fale com o suporte.";
  const al = snap.data();
  if (al.status === "bloqueado") return "Seu acesso está bloqueado. Fale com o suporte.";
  if (al.status === "pendente") return "Pagamento ainda não confirmado. Assim que confirmar, o acesso é liberado.";
  if (al.validade && al.validade < hojeISO()) return "Seu acesso expirou. Fale com o suporte para renovar.";
  return "";
}

// Faz o login e abre a área certa. Retorna a mensagem de erro, ou "" se deu certo.
export async function entrar(email, senha) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), senha);
    if (!isAdminEmail(cred.user.email)) {
      const msg = await verificarAluno(cred.user);
      if (msg) {
        await signOut(auth);
        return msg;
      }
    }
    irParaArea(cred.user);
    return "";
  } catch (err) {
    return mensagemErroAuth(err);
  }
}

// Envia o link de redefinição de senha. Retorna a mensagem de erro, ou "" se enviou.
export async function redefinirSenha(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return "";
  } catch (err) {
    return mensagemErroAuth(err);
  }
}
