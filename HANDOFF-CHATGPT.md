> **Atualização 2026-11-04b:** a abertura (Tarefa 1) foi **concluída e
> publicada** (PR #12): `abertura-v1.mp4` + `capa-super-hqs.png`, botão
> Pular, `contain`, fallback, poster no precache; 270/0, verificar ok,
> teste visual no Chromium. **Pendentes** (credencial/Blaze/Drive):
> publicar+provar as regras v7/v2, backend do Drive, logo.
>
> IDs do Drive confirmados pelo dono (para o backend/logo): pasta
> `Super_HQs` `19ck3UTDNoB4EJ9u_BCL5hj4okPNDEmqc`; `Acervo_Organizado`
> `1NrPoBf734hH_haSV5H9AtNfwm97Uq5R6` (contém **atalhos e subpastas** — não
> contar atalho como edição; não seguir atalho para fora da pasta); vinheta
> original `1rE6IiNm7wE5pB8_ao-bejdAflhHan3mk`; capa original
> `1TswIe6j_PRRYiuH5rbJtoah0noiuo1cc`; projeto visual HD (ZIP, onde deve
> estar o logo) `1Czr4FI8vMNpVZX3kV_QPOfavrc2VJ7nh`.

# Continuação do Super HQs (handoff para o ChatGPT) — 04/11/2026

Cole o bloco **PROMPT** abaixo no ChatGPT que tem acesso ao seu Firebase e ao
seu Google Drive. Ele continua de onde o Claude Code (sessão na nuvem) parou.
O Claude parou nestes pontos **por falta de credencial/acesso nesta sessão**,
não por falta de implementação:

- A sessão na nuvem **não tem login no Firebase** (CLI/MCP sem autenticação) →
  não publica regras nem valida pelo console.
- O proxy da sessão **bloqueia `drive.google.com` e `github.io`** → não baixa a
  vinheta/logo nem abre o site publicado.
- O projeto está no **plano Spark** (sem Storage/Functions) e **ativar o Blaze
  (pago) depende de você** → o backend do Drive não pode ser publicado.

O que já está pronto, testado e publicado (main, versão 2026-11-04a):
acesso por coleção ao acervo (painel do dono + `firestore.rules` v7 +
`storage.rules` v2 + consulta por `chaveAcesso`), 270 testes passando.

---

## PROMPT

Você é um desenvolvedor sênior continuando o projeto **Super HQs**
(https://github.com/Carlosjr81/Super-HQs). Leia `CLAUDE.md`,
`firebase/FERRAMENTAS.md`, `firebase/LEIA-ME.md` e `RESUMO-PARA-OUTRA-IA.md`
antes de agir. Respeite todas as regras do `CLAUDE.md`. Entregue código testado
e publicado, não só um plano. Antes de cada push: `node testes/rodar.js` e
`node testes/verificar.js`; suba `VERSAO_APP`, `versao.json` e o `CACHE` do
`sw.js` juntos. Desenvolva numa branch e abra PR.

**Limites que continuam valendo (não burle):**
- Só conteúdo autorizado. **Não** copiar, raspar nem sincronizar o acervo do
  Ink, do Comixfy ou de qualquer serviço de terceiros, mesmo com o login do
  dono: a assinatura dá direito de ler, não de republicar. Esse pedido foi
  recusado e está registrado no `CLAUDE.md`. O backend do Drive abaixo é só
  para a **pasta de acervo do próprio dono**, com obras que ele tem direito de
  publicar (próprias, licenciadas ou de domínio público), cada uma com registro
  de direitos (titular, licença, origem).
- Credenciais (service account, tokens) **só no ambiente seguro do servidor**;
  nunca no repositório público nem no frontend. Nada de revista no repo.
- Não ativar serviço pago sem o dono autorizar explicitamente.

### Tarefa 1 — Publicar e provar as regras (v7 / v2)
1. Autentique a CLI oficial: `npx --yes firebase-tools@15.34.2 login`
   (projeto `super-hqs`, já em `.firebaserc`).
2. Valide e publique as regras do Firestore:
   `npx --yes firebase-tools@15.34.2 deploy --only firestore:rules --project super-hqs`.
3. Publique as regras do **Storage** (`firebase/storage.rules`) pelo console
   (Storage › Regras) ou configurando `firebase.json`; só depois que o Storage
   existir (ver Tarefa 3).
4. Rode `node testes/prova-regras-firebase.js` (prova as regras no Firebase
   real com conta descartável). Acrescente a ele provas do **acesso por
   coleção**: crie no `acervo` (como dono) duas edições publicadas de coleções
   diferentes (A e B); dê a um usuário liberado `acervoTudo:false,
   colecoes:["A"]`; prove que ele **lê** a edição de A, **não lê** a de B, e que
   uma consulta `chaveAcesso IN ["publicada|A"]` funciona enquanto
   `where status==publicada` (sem coleção) é recusada para ele. Apague as
   edições de teste no fim. Não declare aprovado sem essa prova real.

### Tarefa 2 — Confirmar o estado do Firebase
Confirme e relate: autenticação, projeto selecionado, provedores de login
(e-mail/senha e Google) e o domínio autorizado `carlosjr81.github.io`. Não
afrouxe regras nem desative login para "fazer funcionar".

### Tarefa 3 — Backend do acervo privado no Drive (precisa do Blaze)
Objetivo: usuários aprovados leem, pelo Super HQs, **somente** os arquivos de
uma pasta de acervo designada no Drive do dono, sem acesso ao resto do Drive.
O `CLAUDE.md` diz "nada de servidor próprio"; este backend é a menor ampliação
compatível: uma **Cloud Function** (Firebase Functions, exige Blaze — peça
autorização e configure alerta de orçamento). Implemente:
- Um **indexador** (Function agendada ou script no GitHub Actions) que lê a
  pasta designada do Drive via **service account** (credenciais só no servidor),
  trata paginação, duplicados, falhas e retomada, valida formato/tamanho/
  SHA-256/quantidade de páginas, e grava as fichas no Firestore (coleção
  `acervo`, o mesmo contrato que o app já lê: `sha256`, `titulo`, `colecao`,
  `tipo`, `paginas`, `tamanho`, `status`, `chaveAcesso`, direitos). Preserve
  origem e direitos; não invente licença.
- Um **entregador** (Function HTTPS) que: valida o **ID token do Firebase** e as
  permissões atuais (liberado, no prazo, com plano, e a coleção liberada para a
  conta — a mesma lógica de `podeLerColecaoAcervo`); serve **apenas** arquivos
  cadastrados daquela pasta; **nunca** aceita ID arbitrário do cliente; mantém a
  pasta privada. O app baixa por essa Function em vez da URL direta do Storage
  (adapte `baixarObraOnline`/`online.url`).
- Localize a pasta pelos conectores de Drive disponíveis; **não invente** o ID
  dela — peça ao dono ou leia do conector.
- Relatório real: encontrados, indexados, disponíveis, pendentes, erros.
- Testes de servidor (Node) para o indexador e para a autorização do
  entregador, incluindo coleção não liberada e token inválido.

### Tarefa 4 — Logo e vinheta (precisa do Drive)
Materiais na pasta `Super_HQs` do Drive do dono. Vinheta de referência:
https://drive.google.com/file/d/1rE6IiNm7wE5pB8_ao-bejdAflhHan3mk/view
- Baixe pelo conector/credencial (a página `/view` **não** é URL direta de
  vídeo). Confira o arquivo antes de integrar.
- Vinheta → `abertura-v1.mp4` (720×1280, **sem som**, comprimida); preencha
  `VIDEO_ABERTURA` no `index.html`; o `sw.js` já tem o cache `superhqs-midia`.
  Garanta: reprodução sem som, botão **Pular**, respeito a "movimento reduzido"
  e **continuar o app se o vídeo falhar**.
- Logo → use no app (cabeçalho/ícone) respeitando a identidade visual
  (`CLAUDE.md`, seção "A identidade visual": azul como marca, sem nada do
  Comixfy/Ink).

### Tarefa 5 — Validar e relatar
Rode a trava e os testes de servidor. Valide o app publicado em
https://carlosjr81.github.io/Super-HQs/ : login, aprovação, catálogo, leitura,
bloqueio, vencimento, **coleções**, logo e vinheta. Explique que **revogar
acesso no servidor não apaga cópias já baixadas** no aparelho. Informe: o que
foi publicado (branch/commit/PR), testes e resultados reais, **quantidade
comprovada de arquivos disponíveis** (inventário real, não estimativa), e
qualquer bloqueio restante com o erro exato e a ação mínima.
