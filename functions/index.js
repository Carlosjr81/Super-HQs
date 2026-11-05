// Backend do acervo privado no Drive (Firebase Cloud Functions, 2ª geração).
//
// ATENÇÃO: este código ainda NÃO foi implantado nem testado contra o Drive e o
// Firebase reais. Precisa de: plano Blaze (Functions), uma identidade de
// serviço com acesso de LEITURA só às pastas aprovadas (compartilhadas com o
// e-mail da conta de serviço; nunca o Drive inteiro), e os segredos no ambiente
// seguro (Secret Manager / variáveis do Functions), nunca no repositório. O
// núcleo de autorização (acesso.js) e de indexação (indexador.js) é testado por
// functions/testes/teste-funcoes.js. Ver functions/LEIA-ME.md.
"use strict";

const crypto = require("crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const yauzl = require("yauzl");
const pdfParse = require("pdf-parse");

const acesso = require("./acesso");
const indexador = require("./indexador");

admin.initializeApp();
const db = admin.firestore();

const EMAIL_DONO = "carlos.jr.81@hotmail.com";
const ORIGEM_APP = "https://carlosjr81.github.io";
// pastas aprovadas (IDs confirmados pelo dono; o backend NUNCA sai delas)
const PASTA_ACERVO = defineSecret("DRIVE_PASTA_ACERVO"); // ex.: Acervo_Organizado
const SA_JSON = defineSecret("DRIVE_SERVICE_ACCOUNT"); // chave da conta de serviço (JSON)

function driveClient() {
  const cred = JSON.parse(SA_JSON.value());
  const auth = new google.auth.GoogleAuth({ credentials: cred, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  return google.drive({ version: "v3", auth });
}

// SHA-256 e tamanho de um stream, sem carregar tudo na memória.
function hashDoStream(stream) {
  return new Promise((res, rej) => {
    const h = crypto.createHash("sha256"); let tamanho = 0;
    stream.on("data", (c) => { tamanho += c.length; h.update(c); });
    stream.on("end", () => res({ sha256: h.digest("hex"), tamanho }));
    stream.on("error", rej);
  });
}

// Conta as páginas de um buffer, conforme o tipo (pdf = pdf-parse; cbz/zip =
// imagens dentro do zip).
async function contarPaginas(buf, tipo) {
  if (tipo === "pdf") { const d = await pdfParse(buf); return d.numpages; }
  return await new Promise((res, rej) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return rej(err);
      let n = 0;
      zip.on("entry", (e) => { if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(e.fileName)) n++; zip.readEntry(); });
      zip.on("end", () => res(n));
      zip.on("error", rej);
      zip.readEntry();
    });
  });
}

// Baixa um arquivo do Drive inteiro (precisa para o hash e a contagem).
async function baixarDrive(drive, fileId) {
  const r = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return Buffer.from(r.data);
}

// ---- INDEXADOR: só o dono dispara; percorre a pasta aprovada sem seguir
// atalhos para fora, baixa, confere e grava as fichas em `acervo`. Devolve o
// relatório real (encontrados, indexados, pendentes, erros).
exports.indexarAcervo = onCall({ secrets: [PASTA_ACERVO, SA_JSON], timeoutSeconds: 540, memory: "1GiB" }, async (req) => {
  const t = req.auth && req.auth.token;
  if (!acesso.ehDono(t, EMAIL_DONO)) throw new HttpsError("permission-denied", "Só o dono indexa o acervo.");
  const drive = driveClient();
  const raiz = PASTA_ACERVO.value();
  const linhas = [];
  const fichas = [];
  const agora = Date.now();

  // percorre a pasta e as subpastas aprovadas (dentro da raiz), sem seguir atalhos
  async function percorrer(pastaId) {
    let pageToken;
    do {
      const r = await drive.files.list({
        q: "'" + pastaId + "' in parents and trashed = false",
        fields: "nextPageToken, files(id,name,mimeType,size,md5Checksum,shortcutDetails)",
        pageSize: 200, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const item of r.data.files || []) {
        const classe = indexador.classificarItem(item);
        if (classe === "pasta") { linhas.push({ classe, nome: item.name }); await percorrer(item.id); continue; }
        if (classe === "atalho" || classe === "outro") { linhas.push({ classe, nome: item.name }); continue; }
        // arquivo: baixa, confere, monta ficha
        try {
          const buf = await baixarDrive(drive, item.id);
          const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
          const tipo = indexador.tipoDaEdicao(item.name, item.mimeType);
          const paginas = await contarPaginas(buf, tipo);
          const direitos = await direitosDaPasta(pastaId); // registro por pasta (abaixo)
          const m = indexador.montarFicha({ driveId: item.id, nome: item.name, tipo, sha256, paginas, tamanho: buf.length, colecao: colecaoDaPasta(item), pastaId }, direitos, agora);
          if (m.revisao) { linhas.push({ classe: "arquivo", situacao: "pendente", nome: item.name, motivo: m.motivo }); continue; }
          if (fichas.some((f) => f.sha256 === m.ficha.sha256)) { linhas.push({ classe: "arquivo", situacao: "duplicado", nome: item.name }); continue; }
          fichas.push(m.ficha);
          linhas.push({ classe: "arquivo", situacao: "publicada", nome: item.name });
        } catch (e) { linhas.push({ classe: "arquivo", situacao: "erro", nome: item.name, motivo: String(e && e.message) }); }
      }
      pageToken = r.data.nextPageToken;
    } while (pageToken);
  }
  await percorrer(raiz);

  // grava as fichas (uma por sha), preservando origem/direitos
  const batch = db.batch();
  for (const f of indexador.dedupPorSha(fichas)) batch.set(db.collection("acervo").doc(f.sha256), f, { merge: true });
  await batch.commit();

  return indexador.resumoIndexacao(linhas);
});

// O registro de direitos por pasta vem de uma planilha/mapa do dono em
// Firestore (config/direitosAcervo/<pastaId>); nunca é inventado.
async function direitosDaPasta(pastaId) {
  const d = await db.doc("config/direitosAcervo").get();
  const mapa = d.exists ? d.data() : {};
  return mapa[pastaId] || null;
}
function colecaoDaPasta(item) { return ""; } // preenchido pelo mapa de direitos/pasta; fica vazio se não houver

// ---- ENTREGADOR: valida o ID token e a permissão, resolve o arquivo pela
// ficha (NUNCA por id do cliente) e entrega os bytes.
exports.baixarEdicao = onRequest({ secrets: [SA_JSON], cors: [ORIGEM_APP], timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  try {
    const m = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
    if (!m) return res.status(401).json({ erro: "sem token" });
    let token;
    try { token = await admin.auth().verifyIdToken(m[1]); } catch (e) { return res.status(401).json({ erro: "token inválido" }); }
    const sha = String((req.query.edicao || (req.body && req.body.edicao) || "")).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) return res.status(400).json({ erro: "edição inválida" });

    const [edSnap, contaSnap, cfgSnap] = await Promise.all([
      db.collection("acervo").doc(sha).get(),
      db.collection("usuarios").doc(token.uid).get(),
      db.doc("config/acesso").get(),
    ]);
    if (!edSnap.exists) return res.status(404).json({ erro: "edição não encontrada" });
    const ed = edSnap.data();
    const d = acesso.podeBaixarEdicao(token, contaSnap.exists ? contaSnap.data() : null, ed, Date.now(), cfgSnap.exists ? cfgSnap.data() : {}, EMAIL_DONO);
    if (!d.pode) return res.status(403).json({ erro: d.motivo });

    // resolve o arquivo SÓ pela ficha; o cliente nunca manda um driveId
    const driveId = ed.origem && ed.origem.driveId;
    if (!driveId) return res.status(409).json({ erro: "edição sem arquivo de origem" });
    const drive = driveClient();
    res.setHeader("Content-Type", ed.tipo === "pdf" ? "application/pdf" : "application/zip");
    res.setHeader("Cache-Control", "private, no-store");
    const stream = await drive.files.get({ fileId: driveId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
    stream.data.on("error", () => { if (!res.headersSent) res.status(502).end(); }).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ erro: "falha ao entregar" });
  }
});
