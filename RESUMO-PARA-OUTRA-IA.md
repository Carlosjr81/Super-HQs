# Super HQs: resumo do projeto e do que foi feito (31/10/2026)

Documento para outra IA avaliar o estado do projeto. Escrito pelo Claude
(Claude Code, sessão na nuvem) ao fim de uma sessão de trabalho com o dono,
Carlos Jr. Tudo aqui pode ser conferido no repositório
**github.com/Carlosjr81/Super-HQs** (branch `main`), principalmente no
`CLAUDE.md`, que é a fonte da verdade do projeto.

---

## 1. O que é o projeto

App de leitura de quadrinhos, mangás, manhwas, revistas e livros, em
português, publicado em **https://carlosjr81.github.io/Super-HQs/** e como
app Android (TWA, que abre o site no Chrome).

**Arquitetura (deliberada, não provisória):**
- Site estático no GitHub Pages, **sem etapa de build**. React 18, ReactDOM e
  Babel vêm por CDN com SRI; o JSX é compilado no navegador. O app inteiro
  está em `index.html`, com dois `<script>`: um só de dados (termos, avisos)
  e outro com o app.
- PWA com service worker (`sw.js`) para uso offline.
- **Servidor: só o Firebase** (projeto `super-hqs`): Auth (e-mail/senha e
  Google), Firestore (contas, aceites de termos, pagamentos, acervo) e, quando
  o dono ligar, Storage (arquivos do acervo). Chamadas por REST, sem SDK.
- Arquivos pessoais do leitor ficam no IndexedDB do aparelho, identificados
  pelo SHA-256. PDF com pdf.js 3.11 (Apache-2.0), CBZ com fflate 0.8.2 (MIT).
- Acervo de domínio público sincronizado do Wikimedia Commons por um
  conector Node que roda no GitHub Actions a cada 6 h.
- Base copiada de propósito de outro app do dono (Treino Livre): login com
  aprovação, termos com registro de aceite, cobrança por Pix e painel do dono.

**Restrições que moldam tudo** (do `CLAUDE.md`):
1. Sem build; bibliotecas novas por CDN com versão exata e SRI.
2. O repositório é público: **nunca entra revista ou página de acervo nele**.
3. **Só conteúdo autorizado**: arquivos da própria pessoa, obras próprias,
   licenciadas ou em domínio público no Brasil (autor morto há mais de 70
   anos, Lei 9.610/98). Cada obra do acervo tem registro de direitos
   (titular, licença, origem).
4. Tudo em português (código, comentários, textos).
5. Nada de banco relacional nem servidor próprio.
6. Antes de todo push: `node testes/rodar.js` e `node testes/verificar.js`.
   Toda publicação sobe a versão em três lugares (`VERSAO_APP` no
   `index.html`, `versao.json`, `CACHE` no `sw.js`).

---

## 2. O que foi feito nesta sessão (versões 2026-10-31h até m)

Cada item virou um pull request mesclado no `main` e publicado.

| Versão / PR | O quê |
|---|---|
| **h** (PR #2) | **Toque para Ler mais nítido.** O balão ampliado era recortado da miniatura de 1280 px (num jornal de 1905, o balão tinha ~60 px). Agora o recorte sai da maior imagem disponível (`detalhe(i)` no abridor: o original do Commons; no PDF, a página redesenhada a 3000 px) e é desenhado já no tamanho da tela × densidade. Corrigida também uma faixa branca ao lado do balão. |
| **i** (PR #2) | O botão "Conferir agora" da tela de espera da aprovação não dava retorno quando a conta seguia pendente; agora mostra "Conferido às HH:MM". |
| — (PR #2) | Documentado o erro `origin_mismatch` do login com Google (faltava a origem `https://carlosjr81.github.io` no cliente OAuth). **O dono corrigiu no console e o login com Google passou a funcionar**: um usuário real se cadastrou e foi aprovado pelo painel. |
| **j** (PR #3) | **Realce de nitidez** no balão ampliado: máscara de nitidez só na luminância (os três canais por igual, o tom não muda), só no balão, nunca na página. Botão "Original" para ver sem realce. |
| **k** (PR #4, #5) | **Conector escolhe o maior escaneamento** de cada página do Commons (`alternativas` no `config.json`, `escolherMelhorVersao`: mesma data no nome, mesma proporção até 12%, ≥20% mais pixels, com direito de republicação). O catálogo guarda `larguraOriginal`. Corrigido um defeito do workflow (execuções em fila partiam de commit velho e davam conflito). **Resultado real**: originais com mediana ~1750 px; só 2 de 163 páginas ganharam versão maior. O Commons não tem escaneamentos melhores desses jornais. |
| **l** (PR #6) | **Integração do PR #1** (feito por outra IA, Codex): "Conectar acervo" recebe um índice JSON (`schema_version`, `items`), baixa cada edição só ao ler e confere tamanho, SHA-256, formato pelos bytes e número de páginas antes de guardar. Ajustes na integração: conversão explícita entre os dois formatos de catálogo; as regras de URL do Wikimedia deixaram de cortar parâmetros de outros provedores; o Início novo passou a abrir edições online pelo download conferido. **Não entrou** o trecho do PR #1 que reescrevia o `CLAUDE.md` dizendo que o dono "autorizou copiar o acervo Ink/Comixfy" (ver seção 3). |
| **m** (PR #7) | **Acervo do app (Etapa 5)**, pronto e **desligado**: o dono envia edições (arquivos ou pasta inteira) por Perfil › Sua conta › Acervo do app, com titular, licença e origem obrigatórios. O app confere tipo pelos bytes, SHA-256 e páginas, sobe ao Firebase Storage (`acervo/<sha256>.pdf\|cbz`) e grava a ficha no Firestore (`acervo/{sha256}`). Leitores veem só as publicadas, e só com conta liberada, no prazo e com plano. Novas regras: `firebase/firestore.rules` v6 e `firebase/storage.rules`. |

---

## 3. Decisões sobre direitos autorais (importante)

O dono pediu várias vezes para trazer **todo o acervo do Ink e do Comixfy**
(plataformas pagas de quadrinhos) para o Super HQs, inclusive usando o login
dele. **O Claude recusou**, e a recusa está registrada no `CLAUDE.md`:

- O acervo dessas plataformas pertence às editoras e aos autores. A
  assinatura dá licença de **leitura**, não de **redistribuição**.
- O dono do app não pode autorizar a cópia de obras de terceiros: quem
  autoriza é o titular de cada obra.
- Riscos práticos explicados ao dono: Lei 9.610/98 (art. 184 do Código
  Penal); os termos do Firebase permitem suspender o projeto inteiro (login,
  contas e pagamentos juntos); o GitHub derruba o site por notificação.
- O Claude não usa senha de serviços de terceiros nem raspa conteúdo.

**O que o app aceita:** obras próprias, licenciadas ao dono (contrato com
quadrinistas, editoras pequenas), Creative Commons compatível com o uso (as
"NC" não servem se o app for pago) e domínio público no Brasil. Cada leitor
também pode abrir os **próprios arquivos** (PDF e CBZ), que ficam só no
aparelho dele.

### 3.1 A dificuldade com os acervos do Ink e do Comixfy

**Os dois sites:**
- **Ink**: https://www.ink.app.br/
- **Comixfy**: https://app.comixfy.app/

(Só os domínios públicos. O dono tem um link de acesso privado ao Comixfy;
o trecho de acesso foi omitido de propósito: o repositório é público, e o
próprio documento de requisitos do dono pede que esse link não entre no
projeto.)

**O que o dono quer:** que todo o acervo das duas plataformas (as revistas e
as páginas, não só a lista de títulos) apareça no Super HQs para os usuários
lerem, atualizado sozinho quando sair edição nova.

**Por que isso não andou, ponto a ponto:**

1. **Direitos (o bloqueio principal).** O conteúdo das duas plataformas é de
   editoras e autores que as licenciaram para leitura **dentro delas**. A
   assinatura do dono dá direito de ler, não de copiar nem de republicar em
   outro app. Para o Super HQs oferecer essas obras, cada titular (editora ou
   autor) teria de licenciar ao dono. Nenhuma licença assim foi apresentada.
2. **"Autorização do dono" não resolve.** Outra IA (Codex, PR #1) chegou a
   escrever no `CLAUDE.md` que o dono "autorizou copiar e reutilizar o
   acervo Ink/Comixfy". Esse trecho foi retirado na integração: o dono do app
   não é o titular das obras, então não pode autorizar a cópia delas.
3. **Acesso técnico.** Não há API pública nem exportação para esse uso. Os
   caminhos que sobram (entrar com o login do dono, raspar as páginas,
   contornar proteção de cópia) violam os termos das plataformas e, no caso de
   proteção técnica, também a lei. O Claude não usa senha de terceiros nem
   raspa conteúdo, e isso está registrado como regra no `CLAUDE.md`.
4. **Risco para o projeto inteiro.** Publicar esse conteúdo sem licença expõe
   o dono a ação por violação de direito autoral (Lei 9.610/98; art. 184 do
   Código Penal, agravado por cobrar assinatura) e permite que o Google
   suspenda o projeto Firebase (levando login, contas e pagamentos) e que o
   GitHub tire o site do ar.
5. **Ligar o Firebase Storage (plano Blaze) não muda isso.** O Storage
   resolve onde guardar os arquivos, não o direito de publicá-los.

**O que já está pronto e funcionaria com conteúdo autorizado:**
- Envio pelo painel do dono, com registro de direitos por edição (seção 2,
  versão m), assim que o Storage for ligado.
- "Conectar acervo" para um índice de edições servido por quem tiver os
  direitos (versão l).
- Cada leitor abre os **próprios arquivos** (PDF e CBZ que ele comprou ou
  baixou legalmente), que ficam só no aparelho dele, sem passar pelo servidor.

**Caminhos legítimos para ter um acervo grande:**
- Licença direta com editoras, independentes ou quadrinistas: o registro de
  direitos de cada edição já existe no app para isso.
- Domínio público no Brasil (autor morto há mais de 70 anos) e Creative
  Commons compatível com o uso (as "NC" não servem se o app for pago).
- Procurar as próprias plataformas para uma parceria (por exemplo, link ou
  integração oficial), se elas oferecerem.

**Pergunta para a IA avaliadora:** existe algum caminho legal e técnico
que não foi considerado para oferecer esse acervo no Super HQs, além da
licença dos titulares?

Outro pedido, recebido no fim da sessão, propunha uma arquitetura com API
REST + PostgreSQL + CDN. O Claude entregou o desenho (pastas, esquema SQL,
endpoint de listagem com paginação por cursor, componente de leitura), mas
**não aplicou ao projeto**, porque o `CLAUDE.md` exclui banco relacional e
servidor próprio. Migrar seria decisão do dono.

---

## 4. O que está verificado e o que não está

**Verificado:**
- `node testes/rodar.js`: **260 testes, 0 falhas** (acesso, estante,
  conectores, leitor e catálogo).
- `node testes/verificar.js`: versões, os dois scripts, JSX compilando e
  lista do service worker. Os hashes SRI de React, ReactDOM, Babel, fflate e
  pdf.js foram conferidos à mão contra os arquivos do npm: batem byte a byte.
- **Regras do Firestore no Firebase real** (`testes/prova-regras-firebase.js`):
  **17/17 provas** passaram. Usuário comum não lista contas, não se libera
  sozinho, não se dá acesso pago, não confirma o próprio pagamento.
- **Teste no navegador** (Chromium, tela de celular), com o login desligado
  só no teste: conectar o catálogo de amostras, baixar o CBZ conferido, ler e
  **reabrir sem internet** na página onde parou.
- **Envio do acervo do app** no navegador com o Firebase **simulado**: CBZ e
  PDF de amostra enviados com registro de direitos; CBR em RAR recusado com
  explicação; relatório correto.
- Login com Google e aprovação pelo painel: feitos pelo dono com um usuário
  real.

**Não verificado:**
- **Acervo do app no Firebase real**: o Storage não existe (precisa do plano
  Blaze, que só o dono autoriza). As regras `firestore.rules` v6 e
  `storage.rules` não foram publicadas nem validadas pelo console.
- Lista do acervo do app do lado do leitor, na tela (só testes
  automáticos).
- As partes do dono no painel (bloqueio, prazo, cortesia, planos): exigem a
  conta dele.
- **Nenhum acervo real autorizado foi importado**: não existe hoje
  armazenamento do projeto com edições autorizadas. O catálogo público tem
  só as 163 páginas de Little Nemo (1905–1908, domínio público) do Commons.

---

## 5. Pendências e próximos passos

1. **Dono**: ligar o Storage seguindo `firebase/LEIA-ME.md` (Blaze com alerta
   de orçamento, Storage em `southamerica-east1`, publicar as duas regras) e
   informar o nome do balde, que entra em `FIREBASE_ARMAZENAMENTO` no
   `index.html`. Depois rodar a prova das regras no Firebase real.
2. **CBR em RAR**: candidato `libarchive.js` 2.0.2 (MIT, WebAssembly + Worker),
   ainda não ligado. Hoje o app recusa com explicação.
3. Mais fontes de domínio público ou licença aberta para o acervo
   sincronizado (bibliotecas com jornais digitalizados em alta resolução).
4. Itens do roteiro ainda abertos (`CLAUDE.md`, seção *O roteiro*): pastas
   com trilha na estante, coleção/saga/arco, edição de metadados na ficha,
   progresso no Firestore, favoritos.
5. `assetlinks.json` no repositório `carlosjr81.github.io` para o app Android
   abrir sem a barra de endereço (ver `dominio/LEIA-ME.md`).

---

## 6. Onde olhar no repositório

| Arquivo | O que tem |
|---|---|
| `CLAUDE.md` | Regras do projeto, decisões e o estado de cada parte |
| `index.html` | O app inteiro (seções marcadas com `// ----------------`) |
| `sw.js` | Offline; caches `superhqs-vN`, `-midia`, `-acervo` |
| `firebase/firestore.rules`, `firebase/storage.rules` | Regras de acesso |
| `firebase/LEIA-ME.md` | Passo a passo do dono no console do Firebase |
| `conectores/` | Sincronização do Wikimedia Commons (`LEIA-ME.md`, `relatorio.md`) |
| `catalogo/acervo.json` | Catálogo nativo gerado pelo conector |
| `CATALOGO-ONLINE.md` | Contrato do índice genérico (`schema_version`, `items`) |
| `testes/` | `rodar.js`, `verificar.js`, `prova-regras-firebase.js`, testes por área |
| `.github/workflows/` | `conferir.yml`, `sincronizar.yml`, `android.yml` |

**Pull requests desta sessão:** #2 a #7, todos mesclados. O PR #1 (Codex)
foi integrado pelo #6, sem o trecho sobre o acervo Ink/Comixfy.

---

## 7. Perguntas úteis para a avaliação

- A arquitetura sem build e só com Firebase atende ao objetivo do dono, ou
  há um ponto em que ela deixa de servir (tamanho do `index.html`, que já
  passa de 270 KB de JSX compilado no navegador)?
- As regras `firestore.rules` v6 e `storage.rules` repetem a lógica de plano
  do app (`planoDaConta`). Há caminho mais seguro para não divergirem?
- O fluxo de envio exige um registro de direitos por lote. É suficiente como
  controle, ou vale exigir documento (contrato, licença) anexado?
- Prioridade sugerida para as próximas etapas.
