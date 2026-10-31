# Super HQs

App de leitura de quadrinhos, mangás, manhwas, revistas e livros, em português.
Publicado (quando o repositório existir) em https://carlosjr81.github.io/Super-HQs/.

**A base é a do Treino Livre** (github.com/Carlosjr81/Treino-Livre), copiada de
propósito porque deu certo: site estático no GitHub Pages, sem etapa de build,
PWA, app Android que abre o site no Chrome, login com aprovação, termos, cobrança
por Pix e o painel do dono. **O roteiro de funções** vem do documento
`Prompt_App_Quadrinhos_Comixfy_Ink.md` do dono (referências funcionais: Ink e
Comixfy), adaptado a essa base. Quando os dois divergem, vale o que está aqui.

## Restrições que moldam tudo

1. **Não existe etapa de build.** React, ReactDOM e Babel vêm por CDN com SRI, e o
   JSX é compilado no navegador. Bibliotecas novas entram do mesmo jeito (cdnjs ou
   jsDelivr, versão exata, `integrity`), carregadas só na tela que precisa
   (`carregarScript`).
2. **Dois scripts no `index.html`**: o primeiro só com dados (`TERMOS_USO`,
   `AVISO_CONTEUDO`, `CONDICOES_ASSINATURA`), o segundo com o app. Dados novos no
   primeiro, código no segundo.
3. **O repositório é público. Nunca entra revista, página ou arquivo de acervo**
   (o `.gitignore` barra PDF, CBZ, CBR e ZIP). Os arquivos moram no aparelho de
   cada um ou no Firebase Storage.
4. **Só conteúdo autorizado.** O app lê arquivos da própria pessoa e oferece um
   acervo próprio, licenciado ou de domínio público. **Não copiar, raspar nem
   sincronizar o acervo do Ink, do Comixfy ou de qualquer serviço** (pedido
   recusado em 31/10/2026: é acervo pago de terceiros). Cada obra do acervo tem
   registro de direitos (titular, licença, origem).
   Domínio público no Brasil é a vida do autor + 70 anos (Lei 9.610/98): "public
   domain" no Wikimedia Commons costuma querer dizer *nos EUA*, o que não basta.
5. **Português em tudo**: nomes, comentários e textos.
6. **Servidor**: só o Firebase (projeto `super-hqs`, **separado** do
   `treino-livre`). Firestore para contas, aceites, pagamentos e (depois)
   progresso; Storage para o acervo. Nada de banco relacional nem servidor
   próprio: o prompt pede, mas a base não comporta, e os contratos ficam
   substituíveis.

## Publicar: três lugares para subir a versão

1. `VERSAO_APP` no `index.html` (`AAAA-MM-DD` + letra)
2. `versao.json` com o mesmo valor
3. `CACHE` no `sw.js` (`superhqs-vN`)

**Nunca publicar sem a trava**: antes de todo `git push`, `node testes/rodar.js`
e `node testes/verificar.js`. O dono desenvolve também pelo celular (sessão do
Claude Code na nuvem), onde não dá para abrir o app em localhost antes de
publicar, e um push republica para todo mundo. As três travas são as do Treino
Livre: o hook `testes/hooks/pre-push` (ligado por `core.hooksPath`, que o
`preparar.ps1`/`preparar.sh` configura; não existe em clone novo), esta regra
(a única que alcança a sessão na nuvem) e o `conferir.yml` no GitHub Actions
(avisa depois, mas aparece no celular). Publicou quebrado:
`git revert --no-edit HEAD && git push`, e investigar depois.

## Trabalhar de qualquer aparelho e de qualquer conta do Claude

O GitHub (`Carlosjr81/Super-HQs`) é a verdade. Celular: `COMECE-AQUI.md`, seção
*No celular*. Computador: clone + "prepare esta máquina" (`preparar.ps1`).
Outra conta do Claude (a pessoal no lugar da corporativa):
`TROCAR-DE-CONTA-CLAUDE.md`. Tudo o que for decidido em conversa precisa vir
para este arquivo ou para a mensagem do commit: a conversa fica na conta onde
aconteceu, e a próxima conta só enxerga o repositório.

## O que veio do Treino Livre (seção ACESSO do `index.html`)

Copiado da versão 2026-10-30f do Treino Livre com os nomes trocados (o script
de montagem trocou `treinolivre:` por `superhqs:` e os textos de treino). A
documentação completa de cada parte está no CLAUDE.md do Treino Livre, seções
*Login com aprovação*, *Os Termos de Uso*, *O app pago* e *Entrar com o Google*.

- **`Porteiro`** envolve o app. `FIREBASE_ACESSO` **vazio = porteiro desligado**
  (hoje está vazio até o dono criar o projeto: `firebase/LEIA-ME.md`). Mesmo
  desligado, a `TelaAceiteTermos` aparece antes do app.
- **Termos**: `TERMOS_USO` (versão 2026-10-31), com o `AVISO_CONTEUDO` no lugar do
  aviso de saúde. As duas caixas: termos/18 anos e "só arquivos meus ou
  autorizados". `termos.html` e `termos-versoes/<versão>.txt` saem do mesmo
  texto, e o `teste-acesso.js` reprova se divergirem. Mudou os termos: suba a
  versão e crie o arquivo novo; nunca altere os antigos.
- **Cobrança**: `cobranca` em `config/acesso`, nasce desligada; planos mensal,
  anual, único e vitalício; Pix copia e cola (txid com prefixo `SH`); o dono
  confirma no painel. Ninguém além do dono vê ou mexe.
- **Painel do dono**: Ajustes › Sua conta › Painel de usuários, só para
  `carlos.jr.81@hotmail.com` com e-mail confirmado (as regras garantem isso).
- **O backup das telas de bloqueio** (`baixarBackupLocal`) hoje baixa o
  `localStorage`; quando a estante for para o IndexedDB, ele precisa levar a
  lista da estante também (os arquivos não: são grandes e a pessoa tem os originais).

## A abertura

`VIDEO_ABERTURA` está vazio: o dono vai mandar a vinheta pronta (pedido dele,
31/10/2026: "deixe que a vinheta eu crio"). Quando chegar: `abertura-v1.mp4`,
720×1280, sem som, comprimida como a do Treino Livre, e o `sw.js` já tem o
cache próprio (`superhqs-midia`). Vinheta nova entra com outro nome (v2).

## O app Android (`android/`)

TWA mínimo: só `AberturaActivity` e `Site.kt`, sem Health Connect, óculos ou
bolso. Pacote `br.com.superhqs.app`. O workflow `android.yml` monta o APK no
GitHub Actions e publica em Releases. Para a barra de endereço sumir, o
`assetlinks.json` do repositório `carlosjr81.github.io` precisa ganhar a
entrada deste app (ver `dominio/LEIA-ME.md`).

## O roteiro (do prompt, adaptado)

Prioridade do dono: catálogo → edição → leitor → virada de página → Toque para
Ler → retomada → offline. Loja e comunidade depois.

| Etapa | O quê | Como, nesta base |
|---|---|---|
| 0 | Fundação | **Pronta**: acesso, termos, cobrança, PWA, Android, testes |
| 1 | Estante e abrir arquivo | Arquivos da pessoa no IndexedDB, identificados pelo SHA-256. PDF com pdf.js (Apache-2.0), CBZ/ZIP com fflate (MIT), CBR com libarchive.js (MIT), num Worker. Pastas com trilha, busca sem acento, filtros, ordem natural de número ("0", "0.1", "anual") |
| 2 | Leitor e Toque para Ler | Página simples e rolagem com o mesmo índice. Toque para Ler: **recorte a partir do toque** (expande a área clara do balão até o contorno, numa camada por cima; a página não se mexe) + **Selecionar texto manualmente**. Nada de OCR inventando fala |
| 3 | Virada de livro | StPageFlip (MIT) ou implementação própria; validar o conflito toque × arraste × pinça; movimento reduzido vira transição simples |
| 4 | Progresso, listas e offline | Local primeiro, Firestore depois, com revisão (quem voltou para reler não é atropelado). Fila, favoritos, histórico, calendário, cronologias. Download de edição validado página a página |
| 5 | Acervo do app | Firebase Storage (plano Blaze, com alerta de orçamento), regras que leem a conta (liberado, pago, cortesia, teste), upload e registro de direitos pelo painel do dono. Atualização automática só de fontes de domínio público, com aprovação do dono |
| 6 | Opcionais | Comunidade, gamificação, loja de visuais. Conversor Kindle e TV só se houver integração real; nada de botão que finge |

Detector automático de balões e OCR (Tesseract.js) ficam para depois, como
apoio. Cuidado com a licença de detectores prontos: vários são AGPL/GPL e
obrigariam a abrir o app inteiro.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro |
| `sw.js` | Offline; caches `superhqs-vN`, `superhqs-midia`, `superhqs-acervo` |
| `manifest.json`, ícones | PWA. Ícones provisórios gerados por ffmpeg |
| `termos.html`, `privacidade.html`, `termos-versoes/` | Termos e privacidade |
| `firebase/` | Regras do Firestore e o passo a passo do dono |
| `android/`, `.github/workflows/` | APK e conferidas |
| `testes/` | `rodar.js`, `verificar.js`, `servir.js` (localhost:8765), `teste-acesso.js` |
