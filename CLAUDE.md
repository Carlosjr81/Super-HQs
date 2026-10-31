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

## A identidade visual

Fonte: `Prompt_Identidade_Visual_Super_HQs.md` do dono (31/10/2026), que também
é a seção 9 do `Prompt_App_Quadrinhos_Comixfy_Ink (1).md`. **Azul como marca,
capas como protagonistas, interface limpa.** Nada de nome, logo, selo ou banner
do Comixfy ou do Ink: a referência é só hierarquia, proporção e organização.
O link privado de acesso ao Comixfy que o dono mandou **não é aberto nem entra
no projeto** (o próprio documento dele pede isso).

- **Tokens** no `:root` do `index.html` (escuro, o padrão) e em
  `[data-tema="claro"]`, com os valores da tabela do prompt: `--brand-primary`,
  `--brand-primary-strong`, `--brand-primary-soft`, `--canvas`, `--surface`,
  `--surface-muted`, `--text-primary/secondary/muted`, `--border`, `--success`,
  `--warning`, `--danger`, `--reader-canvas`. Acrescentados por necessidade:
  `--on-brand` (texto sobre o azul: branco no claro, `#090F21` no escuro,
  porque branco sobre `#6F8CFF` dá 3:1) e `--danger-fill`/`--on-danger`.
- **Os nomes antigos continuam** (`--bg`, `--card`, `--marca`, `--cinza`...)
  apontando para os tokens: o código de acesso do Treino Livre os usa em
  centenas de lugares. `GRAD` virou `var(--brand-primary)` pelo mesmo motivo.
- **Contraste medido** (WCAG) nas combinações usadas: todas ≥ 4,5:1; a menor é
  `--text-muted` sobre `--canvas` no claro (4,52). Mudou uma cor, meça de novo.
- **Inter** (SIL OFL 1.1) servida de `fontes/` (latin e latin-ext, variável,
  `font-display: swap`), com `system-ui` de reserva. Nada de servidor de fontes.
- **Capas** em 2:3 com `object-fit: contain` (a arte inteira, sem esticar);
  grade de no mínimo 140 px (duas colunas no celular); prateleiras com "Ver
  tudo"; selos Lendo, Lida e Novidade só quando verdadeiros.
- **Toque**: botões com altura mínima de 44–48 px; barra inferior Início,
  Biblioteca, Buscar, Minhas leituras e Perfil (o antigo Ajustes).
- **Leitor**: fundo `--reader-canvas`, controles que somem sozinhos em 2,5 s e
  voltam com um toque no meio. A cor da revista nunca é alterada.
- Cartões com raio 16 e sombra suave só no claro; no escuro, borda.

## O acervo sincronizado (`conectores/`, `catalogo/acervo.json`)

Pedido do dono (31/10/2026). Serviço agendado no GitHub Actions
(`sincronizar.yml`, a cada 6 h) que publica obras com direito de
republicação: hoje, domínio público no Brasil com imagens do Wikimedia Commons
(as imagens não são copiadas: o catálogo aponta para elas). Tudo em
`conectores/LEIA-ME.md`. **Ink e Comixfy não têm conector, nem com o login do
dono**: pedido recusado várias vezes (acervo de terceiros, sem licença de
republicação; o Claude não usa senha). Não reabrir sem licença dos titulares.

- No app: Biblioteca › **Acervo Super HQs** (ao lado de Minha estante), a
  prateleira "Do acervo Super HQs" no Início e a busca juntam as duas. A ficha
  mostra autor, ano, direitos e o link da origem. O progresso de leitura do
  acervo fica em `localStorage["superhqs:leiturasAcervo"]`, preso ao id
  estável da obra.
- **O Wikimedia só serve miniaturas de larguras da lista dele** (w.wiki/GHai):
  320 e 640 dão 400. O app usa 330 (capa) e 1280 (leitura), e troca o host
  `thumb.wikimedia.org` (que não serve a outros sites) por `upload.wikimedia.org`.
- O `sw.js` busca o catálogo na rede primeiro (cópia no `superhqs-acervo` para
  offline) e deixa as imagens do Wikimedia passarem direto.

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
| 1 | Estante e abrir arquivo | **Em parte (2026-10-31b/c)**: PDF e CBZ abrem, id SHA-256, relatório de importação, Biblioteca por categoria, Buscar com filtros, Início com prateleiras, ficha, leitor de página simples com progresso. **Falta**: CBR em RAR, pastas com trilha, coleção/saga/arco/personagem (muitos-para-muitos, sem duplicar arquivo), edição de metadados na ficha. Arquivos da pessoa no IndexedDB, identificados pelo SHA-256. PDF com pdf.js (Apache-2.0), CBZ/ZIP com fflate (MIT), CBR com libarchive.js (MIT), num Worker. Pastas com trilha, busca sem acento, filtros, ordem natural de número ("0", "0.1", "anual") |
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
