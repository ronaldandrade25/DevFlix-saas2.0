# DevFlix SaaS – Plataforma de aulas (DEV Freelancer B2B)

Plataforma completa para vender e entregar um curso online: **site de vendas**, **painel do Superadmin** e **área do aluno** (estilo Netflix), tudo em **HTML, CSS e JavaScript puros**, sem build e sem framework. O back-end é o **Firebase** (Authentication + Firestore), então não há servidor para manter.

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Estrutura de arquivos](#2-estrutura-de-arquivos)
3. [Como o sistema funciona](#3-como-o-sistema-funciona)
4. [Configurando o Firebase (passo a passo)](#4-configurando-o-firebase-passo-a-passo)
5. [Configurando o e-mail do Superadmin](#5-configurando-o-e-mail-do-superadmin)
6. [Primeiro uso](#6-primeiro-uso)
7. [Rodando no computador](#7-rodando-no-computador)
8. [Publicando o site](#8-publicando-o-site)
9. [Coleções do Firestore](#9-coleções-do-firestore)
10. [Segurança: o que é e o que não é protegido](#10-segurança-o-que-é-e-o-que-não-é-protegido)
11. [App no celular (PWA)](#11-app-no-celular-pwa)
12. [Problemas comuns](#12-problemas-comuns)
13. [Observações e próximas etapas](#13-observações-e-próximas-etapas)

---

## 1. Visão geral

| Parte | Arquivo | Para quem | O que faz |
|---|---|---|---|
| Site de vendas | `index.html` | Visitantes | Apresenta o curso, módulos, aulas grátis, planos e botão **Entrar** |
| Login do app | `login.html` | Todos | Tela de entrada (usada também pelo app instalado/PWA) |
| Superadmin | `admin.html` | Dono do curso | Aulas, materiais, alunos, gestão, financeiro e configurações |
| Área do aluno | `aluno.html` | Alunos | Assiste às aulas, vê progresso, materiais e perfil |

Recursos principais:

- **Login único**: o e-mail define para onde a pessoa vai (superadmin → `admin.html`, aluno → `aluno.html`).
- **Planos** configuráveis, com aulas e materiais liberados conforme o plano do aluno.
- **Aulas grátis** exibidas no site de vendas como vitrine.
- **Player protegido**: vídeo do YouTube com controles próprios (play, barra, volume, velocidade, tela cheia) e camada que bloqueia os cliques para o YouTube.
- **Progresso** do aluno salvo automaticamente.
- **Financeiro** (entradas e saídas) e **gestão de pagamentos** manual.
- **Personalização** pelo painel: cores, textos do site, foto do professor e WhatsApp de suporte.
- **PWA**: instalável no celular, com ícone e abertura em tela cheia.

## 2. Estrutura de arquivos

```
index.html              → Site de vendas (com botão "Entrar")
login.html              → Tela de login (entrada do app instalado)
admin.html              → Superadmin
aluno.html              → Área do aluno
css/plataforma.css      → Estilos de todas as páginas
js/firebase-config.js   → SEUS dados do Firebase e o e-mail do superadmin  ← você edita
js/firebase.js          → Inicialização do Firebase e funções compartilhadas
js/acesso.js            → Lógica de login (valida status/validade do aluno)
js/comum.js             → Funções compartilhadas (formatação, mensagens, tema/cores)
js/vendas.js            → Site de vendas
js/login.js             → Tela de login
js/admin.js             → Painel do superadmin
js/aluno.js             → Área do aluno
js/player.js            → Player de vídeo protegido (YouTube)
js/pwa.js               → Instalação do app (PWA)
sw.js                   → Service worker (instalação e uso offline básico)
manifest.webmanifest    → Manifesto do PWA
icons/                  → Ícones do app
firestore.rules         → Regras de segurança do banco  ← você edita (e-mail do superadmin)
firebase.json           → Configuração do Firebase CLI (hosting e regras)
```

## 3. Como o sistema funciona

### Login

- Na tela de login, quem entrar com o **e-mail do superadmin** vai para `admin.html`.
- Os demais e-mails precisam ter cadastro de **aluno ativo** e vão para `aluno.html`.
- É **barrado** o aluno com status **pendente**, **bloqueado**, **excluído** ou com **acesso vencido** (`validade` anterior a hoje).
- O superadmin cadastra o aluno **definindo e-mail e senha** no painel (*Alunos → Novo aluno*) e repassa os dados ao aluno. O aluno também pode usar **"Esqueci minha senha"** para trocar a senha por e-mail.
- Internamente, o cadastro usa uma **segunda instância do Firebase** (`criarContaAluno` em `js/firebase.js`), para criar a conta do aluno sem deslogar o superadmin.

### Planos e acesso às aulas

- Cada aluno tem um **plano**. Planos com *acesso total* liberam todas as aulas e materiais.
- Cada aula/material tem um plano (ou `todos`) e um status (`publicada` ou não). Aulas marcadas como **grátis** ficam liberadas para qualquer aluno ativo.
- Essas regras são aplicadas **no servidor**, em `firestore.rules`, e não apenas na tela.

### Vitrine

O site de vendas é público e não pode ler a coleção `aulas` (que contém o código dos vídeos). Por isso, ao salvar uma aula, o painel grava uma **cópia pública** na coleção `vitrine`, que só inclui o vídeo se a aula for grátis.

## 4. Configurando o Firebase (passo a passo)

Faça uma única vez. É gratuito no plano Spark para começar.

### 4.1 Criar o projeto

1. Acesse https://console.firebase.google.com e entre com sua conta Google.
2. Clique em **Adicionar projeto**, dê um nome (ex.: `devflix`) e conclua. O Google Analytics é opcional e pode ser desativado.

### 4.2 Ativar o login por e-mail e senha

1. No menu lateral: **Build → Authentication → Começar**.
2. Aba **Sign-in method** (Método de login) → **E-mail/senha** → ative a primeira opção (**não** precisa ativar "link por e-mail") → **Salvar**.

### 4.3 Criar a conta do Superadmin

1. Em **Authentication → Users (Usuários) → Adicionar usuário**.
2. Informe o **e-mail** e uma **senha forte** do superadmin.

> ⚠️ Faça isso **antes de publicar o site**. Se o site já estiver no ar, alguém poderia criar uma conta com esse e-mail antes de você.
> O e-mail aqui deve ser **exatamente o mesmo** configurado na seção 5.

### 4.4 Criar o banco Firestore

1. **Build → Firestore Database → Criar banco de dados**.
2. Escolha o local (ex.: `southamerica-east1`, São Paulo) e inicie em **modo de produção**.

### 4.5 Publicar as regras de segurança

1. Abra o arquivo `firestore.rules` do projeto e troque o e-mail dentro de `isAdmin()` pelo seu (veja a [seção 5](#5-configurando-o-e-mail-do-superadmin)).
2. No console: **Firestore Database → Regras**, apague o conteúdo atual, cole o conteúdo de `firestore.rules` e clique em **Publicar**.

### 4.6 Registrar o app Web e copiar as chaves

1. Clique na engrenagem ⚙️ → **Configurações do projeto → Geral**.
2. Em **Seus apps**, clique no ícone **Web (`</>`)**, dê um apelido e registre. (Não precisa marcar Firebase Hosting aqui.)
3. Copie o objeto `firebaseConfig` mostrado.
4. Cole os valores em `js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

> Essas chaves **não são secretas**: fazem parte de qualquer app web Firebase. Quem protege seus dados são as **regras do Firestore**, por isso a etapa 4.5 é obrigatória.

### 4.7 Autorizar o domínio do site

**Authentication → Settings (Configurações) → Domínios autorizados → Adicionar domínio**: inclua o domínio onde o site vai ficar (ex.: `seusite.com.br`, `seuusuario.github.io`, `seu-projeto.web.app`). `localhost` já vem liberado. Sem isso, o login falha no site publicado.

### 4.8 (Opcional) E-mail de redefinição de senha em português

**Authentication → Templates (Modelos) → Redefinição de senha**: mude o idioma para português e personalize o texto que o aluno recebe ao usar "Esqueci minha senha".

## 5. Configurando o e-mail do Superadmin

O e-mail do superadmin precisa ser **o mesmo em três lugares** (sempre em **letras minúsculas**):

| # | Onde | O que mudar |
|---|---|---|
| 1 | **Firebase Console → Authentication → Usuários** | Criar o usuário com esse e-mail e senha |
| 2 | `js/firebase-config.js` | `export const SUPERADMIN_EMAIL = "seu@email.com";` |
| 3 | `firestore.rules` | Dentro de `isAdmin()`: `request.auth.token.email == 'seu@email.com'` |

Exemplo:

```js
// js/firebase-config.js
export const SUPERADMIN_EMAIL = "seu@email.com";
```

```
// firestore.rules
function isAdmin() {
  return logado() && request.auth.token.email == 'seu@email.com';
}
```

Por que são dois arquivos? O `firebase-config.js` só decide **para qual tela** a pessoa vai; quem realmente **impede acessos indevidos** é o `firestore.rules`, executado no servidor do Firebase. Se o e-mail das regras estiver errado, o painel abre mas não consegue ler nem gravar dados (erro de permissão).

**Trocar o superadmin depois:** crie o novo usuário no Authentication, altere o e-mail nos arquivos 2 e 3 e **publique as regras de novo** (console ou `firebase deploy --only firestore:rules`).

## 6. Primeiro uso

1. Abra o site, clique em **Entrar** e use o e-mail e a senha do superadmin.
2. Em **Configurações**, crie os **planos**, envie a **foto do professor**, ajuste **cores**, textos do site e o **WhatsApp de suporte** (ícone flutuante).
3. Em **Aulas → Nova aula**, cadastre as aulas (cole o código ou o link do YouTube), com módulo, ordem, plano e status.
4. Em **Materiais**, cadastre os arquivos de apoio (nome + link). Eles aparecem na aba Materiais do aluno.
5. Em **Alunos → Novo aluno**, crie um aluno de teste com e-mail e senha, saia e entre com ele para conferir a área do aluno.

### Painel do Superadmin (`admin.html`)

Aulas · Materiais de apoio · Alunos · Gestão (pagamentos e vencimentos) · Financeiro (entradas/saídas) · Configurações (site, planos, cores, suporte).

### Área do aluno (`aluno.html`)

Aulas com player, progresso, materiais de apoio e perfil.

## 7. Rodando no computador

Os arquivos usam módulos JavaScript, então **não funcionam abrindo o HTML direto** (`file://`). Use um servidor local:

- **VS Code:** extensão **Live Server** → botão **Go Live**; ou
- **Terminal:** `npx serve .`

Depois abra o endereço mostrado (ex.: `http://localhost:5500`). Se o Firebase ainda não estiver configurado, aparece um aviso amarelo no topo pedindo para preencher `js/firebase-config.js`.

## 8. Publicando o site

Qualquer hospedagem estática serve (Firebase Hosting, Netlify, Vercel, GitHub Pages). Lembre de adicionar o domínio em **Domínios autorizados** (seção 4.7) e de usar **HTTPS** (necessário para o PWA).

Com o **Firebase Hosting**:

```bash
npm install -g firebase-tools
firebase login
firebase use --add                       # escolha o seu projeto
firebase deploy --only hosting,firestore:rules
```

O `firebase.json` já publica a pasta raiz, ignora arquivos que não devem ir ao ar (`firestore.rules`, `README.md`, etc.) e configura o cache do `sw.js`.

## 9. Coleções do Firestore

| Coleção | Conteúdo |
|---|---|
| `config/site` | nome, preços, links de checkout, WhatsApp, suporte, vídeo de apresentação, lista de módulos, planos, cores |
| `aulas/{id}` | título, módulo, ordem, duração, descrição, materiais, plano, status, grátis |
| `materiais/{id}` | nome, link, descrição, categoria, plano, status |
| `videos/{id}` | código do YouTube da aula + plano/status/grátis (o aluno só lê um documento por vez, ao abrir a aula; nunca a lista) |
| `vitrine/{id}` | cópia pública da aula para o site de vendas (só tem o vídeo se a aula for grátis) |
| `alunos/{uid}` | nome, e-mail, WhatsApp, CPF, plano, valor, pagamento, status, matrícula, validade, observações, progresso, último acesso |
| `lancamentos/{id}` | data, tipo (entrada/saída), descrição, categoria, valor, forma, status, aluno |

**Quem pode o quê** (resumo das regras):

| Coleção | Leitura | Escrita |
|---|---|---|
| `config`, `vitrine` | Qualquer pessoa | Só superadmin |
| `videos` | Superadmin; aluno ativo só por id (`get`), nunca listando | Só superadmin |
| `aulas`, `materiais` | Superadmin; aluno **ativo**, aula **publicada** e dentro do plano (ou grátis) | Só superadmin |
| `alunos` | Superadmin; o próprio aluno | Superadmin; o aluno ativo só altera `progresso` e `ultimoAcesso` |
| `lancamentos` | Só superadmin | Só superadmin |

## 10. Segurança: o que é e o que não é protegido

**Protegido pelo Firebase**
- Cadastro dos alunos, financeiro e **códigos das aulas pagas**: só quem está logado, ativo e com o plano certo recebe o código do vídeo.
- O site de vendas lê só a `vitrine`, que não tem os vídeos das aulas pagas.

**Não protegido**
- **Vídeos do YouTube:** o player bloqueia os cliques para o YouTube, mas quem descobrir o código do vídeo consegue assistir fora da plataforma. Deixe os vídeos como **Não listado**. Para proteção real, use Vimeo com restrição de domínio, Panda Video ou Bunny Stream.
- **Links dos materiais:** são públicos para quem tiver o endereço. Para restringir, use Google Drive com acesso limitado ou o Firebase Storage.

## 11. App no celular (PWA)

O site é um PWA: `login.html` é a tela de entrada do app instalado (se já houver login, vai direto para a área do usuário).

- **Android (Chrome):** botão **Instalar app** no site ou na tela de login (ou menu ⋮ → *Instalar app*).
- **iPhone/iPad (Safari):** **Compartilhar → Adicionar à Tela de Início**. Abra sempre pelo ícone instalado.
- O site precisa estar em **HTTPS**.
- O service worker (`sw.js`) usa *rede primeiro*: o conteúdo é sempre o mais novo e o cache só entra quando está sem internet. Firebase e YouTube nunca passam pelo cache. Ao mudar arquivos do app, se necessário, aumente a versão em `CACHE` (`devfreelancer-v1`).

## 12. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| Aviso "Firebase ainda não configurado" | `js/firebase-config.js` ainda com os valores `COLE_...`. Preencha com o `firebaseConfig` (seção 4.6) |
| Página em branco / erro de módulo | Abriu o HTML direto (`file://`). Use Live Server ou `npx serve .` |
| `auth/unauthorized-domain` ao entrar | Domínio não autorizado. Adicione em Authentication → Domínios autorizados |
| `Missing or insufficient permissions` no painel | E-mail do `firestore.rules` diferente do usado no login, ou regras não publicadas |
| Superadmin entra como aluno / "Cadastro não encontrado" | `SUPERADMIN_EMAIL` diferente do e-mail logado (confira maiúsculas/minúsculas) |
| Aluno barrado ao entrar | Status pendente/bloqueado/excluído, validade vencida, ou sem cadastro em *Alunos* |
| "E-mail já em uso" ao recadastrar | Mesmo após excluir, o login continua no Authentication; o painel reaproveita essa conta |
| App instalado não atualiza | Feche e reabra o app; se persistir, aumente a versão do cache em `sw.js` |

## 13. Observações e próximas etapas

- **Excluir aluno** no painel remove o acesso na hora. O login continua existindo no Authentication; se cadastrar o mesmo e-mail de novo, o painel reaproveita a conta.
- O **e-mail de login** do aluno não pode ser alterado pelo painel. Para trocar, exclua o aluno e cadastre de novo com o e-mail novo.
- O **pagamento é manual**: você cadastra o aluno ou confirma o pagamento em *Gestão*. Para liberar o acesso automaticamente após a compra (Mercado Pago, Kiwify, Hotmart), é preciso um **webhook com Cloud Functions**. Fica como próxima etapa.
