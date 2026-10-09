# DEV Freelancer B2B – Plataforma de aulas

Site de vendas + Superadmin + Área do aluno, usando **Firebase** (Authentication + Firestore).
HTML, CSS e JavaScript puros, sem build.

## Estrutura

```
index.html        → Site de vendas (com botão "Entrar")
admin.html        → Superadmin (aulas, materiais de apoio, alunos, gestão, financeiro, configurações)
aluno.html        → Área do aluno (aulas, progresso, materiais, perfil)
css/plataforma.css
js/firebase-config.js  → SEUS dados do Firebase e o e-mail do superadmin
js/firebase.js         → Inicialização do Firebase
js/comum.js            → Funções compartilhadas
js/vendas.js | js/admin.js | js/aluno.js
firestore.rules        → Regras de segurança do banco
firebase.json          → Para publicar com o Firebase CLI (opcional)
```

## Como funciona o login

- Na tela de login, quem entrar com o **e-mail do superadmin** vai para `admin.html`.
- Os outros e-mails precisam estar cadastrados como **aluno ativo** e vão para `aluno.html`.
- Aluno **pendente**, **bloqueado**, **excluído** ou com **acesso vencido** é barrado.
- O superadmin cadastra o aluno **definindo e-mail e senha** no painel (Alunos → Novo aluno) e passa os dados ao aluno.
  O aluno também pode usar "Esqueci minha senha" no login para trocar a senha por e-mail.

## Passo a passo da configuração (uma vez só)

1. **Criar o projeto** em https://console.firebase.google.com.
2. **Authentication** → Começar → em *Método de login*, ative **E-mail/senha**.
3. **Authentication → Usuários → Adicionar usuário**: crie o **superadmin** com seu e-mail e uma senha.
   > Faça isso **antes** de publicar o site, para ninguém criar uma conta com esse e-mail.
4. **Firestore Database** → Criar banco de dados (modo produção).
5. **Regras do Firestore**: abra `firestore.rules`, troque `admin@seudominio.com` pelo seu e-mail
   (em minúsculas) e cole o conteúdo em *Firestore → Regras → Publicar*.
6. **Configurações do projeto → Seus apps → Web (</>)**: registre o app e copie o `firebaseConfig`.
   Cole em `js/firebase-config.js` e troque também o `SUPERADMIN_EMAIL`.
7. **Authentication → Configurações → Domínios autorizados**: adicione o domínio onde o site vai
   ficar (ex.: `seusite.com.br`, `seuusuario.github.io`). `localhost` já vem liberado.
8. Opcional: em **Authentication → Modelos → Redefinição de senha**, mude o idioma para
   português e personalize o texto do e-mail que o aluno recebe.

## Primeiro uso

1. Abra o site, clique em **Entrar** e entre com o e-mail do superadmin.
2. Em **Aulas**, cadastre as aulas com **Nova aula** (cole o código ou o link do YouTube).
3. Em **Materiais**, cadastre os arquivos de apoio (nome + link); eles aparecem na aba Materiais do aluno.
4. Em **Configurações**, crie os **planos**, envie a **foto do professor**, ajuste as **cores**, os textos do site e o **WhatsApp de suporte** (ícone flutuante).
5. Em **Alunos → Novo aluno**, cadastre um aluno de teste com e-mail e senha definidos por você
   e entre com eles para conferir a área do aluno.

## Rodando no computador

Os arquivos usam módulos JavaScript, então **não funcionam abrindo o HTML direto** (`file://`).
Use um servidor local, por exemplo:

- VS Code: extensão **Live Server** → botão "Go Live"; ou
- Terminal: `npx serve .`

## Publicando

Qualquer hospedagem estática serve (Firebase Hosting, Netlify, Vercel, GitHub Pages).
Com o Firebase CLI:

```
npm install -g firebase-tools
firebase login
firebase use --add            (escolha o seu projeto)
firebase deploy --only hosting,firestore:rules
```

## O que o Firebase protege, e o que ele não protege

- **Protegido:** cadastro dos alunos, financeiro e códigos das aulas pagas. Só quem está logado com
  o plano certo recebe o código do vídeo. O site de vendas lê a coleção `vitrine`, que não tem os
  vídeos das aulas pagas.
- **Não protegido:**
  - Os **vídeos do YouTube**: o player da plataforma bloqueia os cliques para o YouTube, mas quem descobrir o código do vídeo consegue assistir fora. Deixe os vídeos
    como **Não listado**. Se precisar de proteção real, use Vimeo com restrição de domínio, Panda
    Video ou Bunny Stream.
  - Os **links dos materiais**: são públicos para quem tiver o endereço. Para restringir, use o Google Drive com acesso
    limitado ou o Firebase Storage.

## Coleções no Firestore

| Coleção | Conteúdo |
|---|---|
| `config/site` | nome, preços, links de checkout, WhatsApp, suporte, vídeo de apresentação, lista de módulos |
| `aulas/{id}` | título, código do YouTube, módulo, ordem, duração, descrição, materiais, plano, status, grátis |
| `materiais/{id}` | nome, link, descrição, categoria, plano, status (materiais de apoio da aba Materiais do aluno) |
| `vitrine/{id}` | cópia pública da aula, usada no site de vendas (só tem o vídeo se a aula for grátis) |
| `alunos/{uid}` | nome, e-mail, WhatsApp, CPF, plano, valor, pagamento, status, matrícula, validade, observações, progresso, último acesso |
| `lancamentos/{id}` | data, tipo (entrada/saída), descrição, categoria, valor, forma, status, aluno |

## Observações

- **Excluir aluno** no painel remove o acesso dele na hora. O login continua existindo no Authentication,
  e se você cadastrar o mesmo e-mail de novo, o painel reaproveita essa conta.
- O **e-mail de login** do aluno não pode ser alterado pelo painel. Para trocar, exclua o aluno e
  cadastre de novo com o e-mail novo.
- O **pagamento é manual**: você cadastra o aluno, ou confirma o pagamento em *Gestão*. Para liberar o
  acesso automaticamente depois da compra (Mercado Pago, Kiwify, Hotmart), é preciso um webhook com
  Cloud Functions. Isso pode ser uma próxima etapa.

## App no celular (PWA)

O site é um PWA: `login.html` é a tela de entrada do app instalado (se já houver login, vai direto para a área).

**Instalar**
- **Android (Chrome):** botão **Instalar app** no site ou na tela de login (ou menu ⋮ → *Instalar app*).
- **iPhone/iPad (Safari):** Compartilhar → **Adicionar à Tela de Início**. É preciso abrir pelo ícone instalado.
- O site precisa estar em **HTTPS** (Firebase Hosting, Netlify, Vercel...).
