// =====================================================================
// CONFIGURAÇÃO DO FIREBASE
// 1. Firebase Console > Configurações do projeto > Seus apps > Web
// 2. Copie o objeto firebaseConfig e cole abaixo
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCcWSl5eH58un4tLACpgNMRWuVjJqzhvMY",
  authDomain: "plataforma-aulas-2116c.firebaseapp.com",
  projectId: "plataforma-aulas-2116c",
  storageBucket: "plataforma-aulas-2116c.firebasestorage.app",
  messagingSenderId: "575011733515",
  appId: "1:575011733515:web:3a23048b03c87222dcc70e"
};

// E-mail do SUPERADMIN (sempre em letras minúsculas).
// Quem fizer login com este e-mail entra no painel Superadmin.
// IMPORTANTE: use o MESMO e-mail no arquivo firestore.rules.
export const SUPERADMIN_EMAIL = "rasistema25@gmail.com";
