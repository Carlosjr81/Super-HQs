// Backend privado do Drive. Implantação real depende da configuração descrita
// em LEIA-ME.md; nenhum segredo nem arquivo de revista vai para o cliente.
"use strict";
const crypto = require("crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const yauzl = require("yauzl");
const pdfParse = require("pdf-parse");
const acesso = require("./acesso");
const I = require("./indexador");
const S = require("./sincronizacao");
admin.initializeApp();
const db = admin.firestore();
const EMAIL_DONO = "carlos.jr.81@hotmail.com";
const ORIGEM_APP = "https://carlosjr81.github.io";
const CONFIG_DRIVE = require("./configuracao-drive.json");
const PASTA_ACERVO = CONFIG_DRIVE.pastaId;
const SA_JSON = defineSecret("DRIVE_SERVICE_ACCOUNT");
const MAX_ARQUIVO = 150 * 1048576;

function driveClient() {
  const credentials = JSON.parse(SA_JSON.value());
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  return google.drive({ version: "v3", auth });
}
async function baixarDrive(drive, item) {
  if (!Number.isSafeInteger(Number(item.size)) || Number(item.size) <= 0 || Number(item.size) > MAX_ARQUIVO) throw Error("Tamanho ausente ou acima de 150 MiB.");
  const r = await drive.files.get({ fileId: item.id, alt: "media", supportsAllDrives: true }, { responseType: "stream", timeout: 60000 });
  const partes = []; let tamanho = 0;
  for await (const parte of r.data) {
    tamanho += parte.length;
    if (tamanho > MAX_ARQUIVO) { r.data.destroy(); throw Error("Arquivo excede 150 MiB."); }
    partes.push(parte);
  }
  if (tamanho !== Number(item.size)) throw Error("Download incompleto ou arquivo alterado durante a leitura.");
  return Buffer.concat(partes);
}
async function contarPaginas(buf, tipo) {
  if (tipo === "pdf") { const d = await pdfParse(buf); return d.numpages; }
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let n = 0, total = 0;
      zip.on("error", reject);
      zip.on("entry", (e) => {
        if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(e.fileName) && !e.fileName.startsWith("__MACOSX/")) {
          n++; total += e.uncompressedSize;
          if (n > 5000 || e.uncompressedSize > 80 * 1048576 || total > 1024 * 1048576) {
            zip.close(); reject(Error("CBZ excede os limites de páginas ou tamanho descompactado.")); return;
          }
        }
        zip.readEntry();
      });
      zip.on("end", () => resolve(n));
      zip.readEntry();
    });
  });
}

exports.indexarAcervo = onCall({ region: CONFIG_DRIVE.regiao, secrets: [SA_JSON], concurrency: 1, maxInstances: 2, invoker: "public", cors: [ORIGEM_APP], timeoutSeconds: 540, memory: "1GiB" }, async (req) => {
  if (!acesso.ehDono(req.auth && req.auth.token, EMAIL_DONO)) throw new HttpsError("permission-denied", "Só o dono indexa o acervo.");
  const raiz = PASTA_ACERVO;
  const controle = db.doc("controleAcervo/indexacaoDrive");
  const execucao = crypto.randomUUID();
  let estado;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(controle); const anterior = snap.exists ? snap.data() : {};
    if (anterior.ocupadoAte > Date.now()) throw new HttpsError("already-exists", "Há uma indexação em andamento. Aguarde antes de continuar.");
    estado = req.data && req.data.continuar && anterior.estado && !anterior.estado.completo ? anterior.estado : S.novoEstado(raiz);
    tx.set(controle, { execucao, ocupadoAte: Date.now() + 600000, estado });
  });
  try {
    const drive = driveClient();
    const dirSnap = await db.doc("config/direitosAcervo").get();
    const mapa = dirSnap.exists ? dirSnap.data() : {};
    estado = await S.processarLote({ raiz, estado,
      listar: async (pastaId, pagina) => (await drive.files.list({
        q: "'" + pastaId + "' in parents and trashed = false",
        fields: "nextPageToken,files(id,name,mimeType,size)", pageSize: 100,
        pageToken: pagina || undefined, supportsAllDrives: true, includeItemsFromAllDrives: true,
      })).data,
      processar: async (item, pasta) => {
        const direitos = mapa[pasta.id];
        if (!I.direitosOk(direitos)) return { situacao: "pendente", motivo: "Sem registro de direitos para esta pasta." };
        const buf = await baixarDrive(drive, item);
        const tipo = I.tipoPelosBytes(buf);
        if (!tipo || tipo !== I.tipoDaEdicao(item.name, item.mimeType)) throw Error("O formato pelos bytes não confere com PDF/CBZ declarado.");
        const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
        const paginas = await contarPaginas(buf, tipo);
        const m = I.montarFicha({ driveId: item.id, nome: item.name, tipo, sha256, paginas, tamanho: buf.length,
          colecao: String(direitos.colecao || pasta.nome || ""), pastaId: pasta.id }, direitos, Date.now());
        if (m.revisao) return { situacao: "pendente", motivo: m.motivo };
        // Uma gravação por edição e cursor por item: sem batch que estoura 500
        // operações, sem republicar edição que o dono despublicou no painel.
        const ref = db.collection("acervo").doc(sha256);
        const criada = await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return false;
          tx.create(ref, { ...m.ficha, enviadoEm: admin.firestore.FieldValue.serverTimestamp() });
          return true;
        });
        return { situacao: criada ? "publicada" : "duplicado" };
      },
      salvar: async (e) => controle.set({ estado: e }, { merge: true }),
    });
    return { ...estado.resumo, completo: estado.completo, detalhes: estado.detalhes };
  } finally {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(controle);
      if (snap.exists && snap.data().execucao === execucao) tx.update(controle, { ocupadoAte: 0 });
    });
  }
});

exports.baixarEdicao = onRequest({ region: CONFIG_DRIVE.regiao, secrets: [SA_JSON], concurrency: 1, maxInstances: 2, invoker: "public", cors: [ORIGEM_APP], timeoutSeconds: 540, memory: "512MiB" }, async (req, res) => {
  if (req.method !== "GET") return res.status(405).set("Allow", "GET").json({ erro: "método não permitido" });
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const m = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
    if (!m) return res.status(401).json({ erro: "sem token" });
    let token;
    try { token = await admin.auth().verifyIdToken(m[1], true); } catch (e) { return res.status(401).json({ erro: "token inválido ou revogado" }); }
    const sha = String(req.query.edicao || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) return res.status(400).json({ erro: "edição inválida" });
    const [edSnap, contaSnap, cfgSnap] = await Promise.all([
      db.collection("acervo").doc(sha).get(), db.collection("usuarios").doc(token.uid).get(), db.doc("config/acesso").get(),
    ]);
    if (!edSnap.exists) return res.status(404).json({ erro: "edição não encontrada" });
    const ed = edSnap.data();
    const d = acesso.podeBaixarEdicao(token, contaSnap.exists ? contaSnap.data() : null, ed, Date.now(), cfgSnap.exists ? cfgSnap.data() : {}, EMAIL_DONO);
    if (!d.pode) return res.status(403).json({ erro: d.motivo });
    const driveId = ed.provedor === "drive" && ed.arquivoDrive && ed.arquivoDrive.id;
    if (!driveId || ed.caminho !== "drive/" + driveId) return res.status(409).json({ erro: "edição sem arquivo do Drive cadastrado" });
    const drive = driveClient();
    const meta = await S.arquivoNaRaiz(driveId, PASTA_ACERVO, async (fileId) =>
      (await drive.files.get({ fileId, fields: "id,name,mimeType,size,parents,trashed", supportsAllDrives: true })).data);
    if (!meta) return res.status(403).json({ erro: "arquivo fora da pasta aprovada ou em quarentena" });
    if (Number(meta.size) !== ed.tamanho || I.tipoDaEdicao(meta.name, meta.mimeType) !== ed.tipo) return res.status(409).json({ erro: "arquivo alterado; atualize o acervo" });
    const intervalo = S.intervaloDoDownload(req.get("Range"), ed.tamanho);
    if (!intervalo) return res.status(416).set("Content-Range", "bytes */" + ed.tamanho).json({ erro: "Peça um intervalo válido de até 8 MiB." });
    const { inicio, fim } = intervalo;
    const stream = await drive.files.get({ fileId: driveId, alt: "media", supportsAllDrives: true },
      { responseType: "stream", timeout: 120000, headers: { Range: "bytes=" + inicio + "-" + fim } });
    const partes = []; let tamanho = 0;
    for await (const parte of stream.data) {
      tamanho += parte.length;
      if (tamanho > fim - inicio + 1) { stream.data.destroy(); throw Error("Drive não respeitou o intervalo."); }
      partes.push(parte);
    }
    if (tamanho !== fim - inicio + 1 || (inicio > 0 && stream.status !== 206)) throw Error("Intervalo incompleto.");
    res.setHeader("Content-Type", ed.tipo === "pdf" ? "application/pdf" : "application/zip");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length");
    if (intervalo.parcial) res.setHeader("Content-Range", "bytes " + inicio + "-" + fim + "/" + ed.tamanho);
    res.status(intervalo.parcial ? 206 : 200).end(Buffer.concat(partes));
  } catch (e) {
    if (!res.headersSent && !res.destroyed) res.status(502).json({ erro: "falha ao entregar arquivo do Drive" });
    else if (!res.destroyed) res.destroy();
  }
});
