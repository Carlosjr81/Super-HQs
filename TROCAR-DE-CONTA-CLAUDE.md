# Continuar o Super HQs com outra conta do Claude

O projeto começou com a conta **corporativa** do Claude. Se um dia ela acabar,
o desenvolvimento continua com a sua conta **pessoal**, do mesmo ponto, sem
perder nada. É o mesmo arranjo do Treino Livre.

## O que é seu, e não depende de conta do Claude nenhuma

Tudo mora no **seu GitHub pessoal** (`github.com/Carlosjr81/Super-HQs`):

| O quê | Onde |
|---|---|
| O app inteiro (`index.html`, `sw.js`, ícones, termos, privacidade) | repositório |
| O app Android (`android/`) e o APK publicado | repositório e Releases do GitHub |
| O site no ar | GitHub Pages da sua conta |
| Os testes e a conferida de publicação (`testes/`) | repositório |
| **Todo o contexto do projeto**: decisões, regras, o roteiro por etapas | `CLAUDE.md` |
| Conferência automática e montagem do APK | GitHub Actions da sua conta |
| Contas, pagamentos e (depois) o acervo | o projeto `super-hqs` no Firebase, na **sua** conta Google |

O Claude não guarda o projeto: ele lê o repositório a cada sessão, e o
`CLAUDE.md` é carregado sozinho por qualquer Claude, em qualquer conta. Por isso
tudo o que é decidido nas conversas vai para lá.

## O que fica na conta corporativa (e não faz falta)

- **As conversas.** O que importava delas está no `CLAUDE.md` e nas mensagens dos
  commits (`git log`).
- **A ligação entre o Claude corporativo e o seu GitHub.** É só uma autorização:
  na conta pessoal você faz outra (passo 3).

## Quem pode mexer no projeto: a chave é o seu GitHub

Nenhuma conta do Claude mexe no projeto por conta própria. Para alterar qualquer
arquivo, o Claude precisa de uma conta do GitHub com permissão de escrita neste
repositório, e a única é a sua, `Carlosjr81`.

- **Ler, qualquer um lê**: o repositório é público, porque é dele que o GitHub
  Pages gratuito publica o site. Ver o código não dá poder de mudar o app.
- **Ative a verificação em duas etapas** no GitHub (Settings › Password and
  authentication › Two-factor authentication).
- **Não acrescente colaboradores** (Settings do repositório › Collaborators).
- Se o app do Claude no GitHub estiver limitado a alguns repositórios, inclua o
  **Super-HQs**: Settings › Applications › Installed GitHub Apps › Claude ›
  Configure › Repository access.

## Passo a passo com a conta pessoal

1. **Plano.** O Claude Code precisa de plano pago na conta pessoal (Pro ou Max).
2. **Entrar.** Abra `claude.ai/code` (celular ou computador) com a conta **pessoal**.
3. **Ligar o GitHub.** Em `claude.ai/connect-github`, conecte a conta
   `Carlosjr81` e dê acesso ao repositório **Super-HQs**.
4. **Abrir o projeto.** Comece uma sessão com `Carlosjr81/Super-HQs` selecionado.
5. **Primeira mensagem**, para conferir que está tudo de pé:

   > Leia o CLAUDE.md. Rode `node testes/rodar.js` e `node testes/verificar.js`
   > e me diga se o projeto está saudável.

   Passou: a conta pessoal está pronta para continuar de onde a corporativa parou.

**No computador**, é o caminho do `COMECE-AQUI.md`, com o Claude Code entrando
na conta pessoal (`/login` no terminal, ou o aplicativo do Claude para computador).

## Faça um ensaio agora, enquanto tem as duas

Não espere perder a corporativa para descobrir um passo travado: faça os passos
1 a 5 com a conta pessoal uma vez, hoje.

## Quando sair da conta corporativa

No GitHub: Settings › Applications › **Authorized OAuth Apps**. Se aparecer uma
autorização ligada à empresa que você não quer mais, revogue ali. Isso não apaga
nada do repositório.

## O que não é do Claude, mas também não pode se perder

- **A chave que assina o app Android.** Hoje ela vive no cache do GitHub Actions
  (o `manter-chave.yml` a mantém viva). Para nunca mudar, guarde-a como segredo
  `ANDROID_KEYSTORE_B64` (e a senha em `ANDROID_KEYSTORE_PASS`) no repositório.
  Chave nova obriga todo mundo a desinstalar e instalar o app de novo.
- **O projeto do Firebase.** Fica na sua conta Google pessoal: crie-o com ela,
  não com a da empresa.

## A identidade dos commits

Os commits usam o e-mail `noreply` do GitHub (`Carlosjr81@users.noreply.github.com`),
que o `preparar.ps1`/`preparar.sh` configura. O `.mailmap` mostra como
`Carlosjr81` qualquer commit que tenha saído com outro e-mail seu.
