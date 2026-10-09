import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPERADMIN_EMAIL } from "./firebase-config.js";

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export { SUPERADMIN_EMAIL };

export const configurado = !String(firebaseConfig.apiKey).startsWith("COLE_");
export const app = configurado ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const isAdminEmail = (email) =>
  (email || "").toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

// Cria a conta de login do aluno sem deslogar o superadmin.
// Usa uma segunda instância do Firebase só para o cadastro.
// A senha é definida pelo superadmin no cadastro do aluno.
export async function criarContaAluno(email, senha) {
  const secundario = initializeApp(firebaseConfig, "cadastro-" + Date.now());
  try {
    const authSec = getAuth(secundario);
    const cred = await createUserWithEmailAndPassword(authSec, email, senha);
    await signOut(authSec);
    return cred.user.uid;
  } finally {
    await deleteApp(secundario);
  }
}

// Mostra um aviso no topo da página quando o firebase-config.js não foi preenchido
export function avisoConfiguracao() {
  if (configurado) return;
  const aviso = document.createElement("div");
  aviso.className = "aviso-config";
  aviso.innerHTML =
    'Firebase ainda não configurado. Preencha <code>js/firebase-config.js</code> com os dados do seu projeto (veja o <code>README.md</code>).';
  document.body.prepend(aviso);
}
