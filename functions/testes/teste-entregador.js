// Exercita o handler HTTP de verdade, substituindo somente serviços externos.
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const I = require("../indexador");
const A = require("../acesso");
const S = require("../sincronizacao");
const { Readable } = require("node:stream");
let token = {}, conta = { status: "liberado" }, edicao, revogado = false, metadados, abriu = 0;
const doc = (v) => ({ exists: !!v, data: () => v });
const db = { collection: (nome) => ({ doc: () => ({ get: async () => doc(nome === "acervo" ? edicao : conta) }) }), doc: () => ({ get: async () => doc({ cobranca: false }) }) };
const firestore = () => db;
const drive = { files: { get: async (p, opt) => {
  if (p.alt !== "media") return { data: metadados[p.fileId] };
  abriu++;
  const m = /bytes=(\d+)-(\d+)/.exec(opt.headers.Range);
  return { status: 206, data: Readable.from([Buffer.alloc(Number(m[2]) - Number(m[1]) + 1, 1)]) };
} } };
const ctx = { exports: {}, Buffer, require: (nome) => {
  if (nome === "firebase-functions/v2/https") return { onRequest: (_, fn) => fn, onCall: (_, fn) => fn, HttpsError: Error };
  if (nome === "firebase-functions/params") return { defineSecret: (n) => ({ value: () => n === "DRIVE_PASTA_ACERVO" ? "raiz" : "{}" }) };
  if (nome === "firebase-admin") return { initializeApp() {}, firestore, auth: () => ({ verifyIdToken: async (valor, verificarRevogacao) => {
    assert.equal(verificarRevogacao, true); if (valor === "invalido" || revogado) throw Error("invalid"); return token;
  } }) };
  if (nome === "googleapis") return { google: { auth: { GoogleAuth: class {} }, drive: () => drive } };
  if (nome === "./configuracao-drive.json") return { pastaId: "raiz", regiao: "us-central1" };
  if (nome === "./indexador") return I;
  if (nome === "./acesso") return A;
  if (nome === "./sincronizacao") return S;
  if (nome === "pdf-parse" || nome === "yauzl") return {};
  return require(nome);
} };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require("node:path").join(__dirname, "../index.js"), "utf8"), ctx);
const handler = ctx.exports.baixarEdicao;
const sha = "a".repeat(64);
async function pedir(auth = "Bearer valido", range = "bytes=0-9", method = "GET") {
  const res = { codigo: 200, headers: {}, status(n) { this.codigo = n; return this; }, set(n, v) { this.headers[n] = v; return this; }, setHeader(n, v) { this.headers[n] = v; }, json(j) { this.corpo = j; return this; }, end(b) { this.corpo = b; return this; } };
  await handler({ method, query: { edicao: sha }, get: (n) => n === "Authorization" ? auth : range }, res);
  return res;
}
let ok = 0, mal = 0;
async function teste(nome, fn) { try { await fn(); ok++; console.log("  ok   " + nome); } catch (e) { mal++; console.log("  X    " + nome + ": " + e.message); } }
(async () => {
  edicao = { sha256: sha, provedor: "drive", caminho: "drive/ed", arquivoDrive: { id: "ed" }, status: "publicada", colecao: "A", tamanho: 40 * 1048576, tipo: "zip" };
  metadados = { ed: { id: "ed", name: "01.cbz", mimeType: "application/zip", size: String(edicao.tamanho), parents: ["raiz"] }, raiz: { id: "raiz", name: "Acervo", mimeType: I.PASTA } };
  await teste("sem token ou token inválido: 401, nenhum byte do Drive", async () => { assert.equal((await pedir("")).codigo, 401); assert.equal((await pedir("Bearer invalido")).codigo, 401); assert.equal(abriu, 0); });
  await teste("token revogado: 401", async () => { revogado = true; assert.equal((await pedir()).codigo, 401); revogado = false; });
  await teste("método diferente de GET: 405", async () => { assert.equal((await pedir("Bearer valido", "", "POST")).codigo, 405); });
  await teste("coleção não liberada: 403 antes do download", async () => { conta = { status: "liberado", acervoTudo: false, colecoes: ["B"] }; assert.equal((await pedir()).codigo, 403); assert.equal(abriu, 0); });
  await teste("conta bloqueada: 403", async () => { conta = { status: "bloqueado" }; assert.equal((await pedir()).codigo, 403); });
  await teste("coleção liberada: 206 com os bytes e sem cache público", async () => { conta = { status: "liberado", acervoTudo: false, colecoes: ["A"] }; const r = await pedir(); assert.equal(r.codigo, 206); assert.equal(r.corpo.length, 10); assert.equal(r.headers["Content-Range"], "bytes 0-9/" + edicao.tamanho); assert.equal(r.headers["Cache-Control"], "private, no-store"); });
  await teste("edição despublicada: 403", async () => { edicao.status = "pendente"; assert.equal((await pedir()).codigo, 403); edicao.status = "publicada"; });
  await teste("arquivo movido para fora da raiz: 403", async () => { metadados.ed.parents = ["fora"]; assert.equal((await pedir()).codigo, 403); metadados.ed.parents = ["raiz"]; });
  await teste("revista grande sem intervalo: 416; acima de 8 MiB: 416", async () => { assert.equal((await pedir("Bearer valido", "")).codigo, 416); assert.equal((await pedir("Bearer valido", "bytes=0-9000000")).codigo, 416); });
  await teste("ficha aponta para arquivo alterado: 409", async () => { metadados.ed.size = "4"; assert.equal((await pedir()).codigo, 409); });
  console.log("\n" + ok + " passou / " + mal + " falhou"); process.exit(mal ? 1 : 0);
})();
