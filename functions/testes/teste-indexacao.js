// Handler callable real com Firestore/Drive simulados: escrita pelo hash dos
// bytes, duplicação, autorização e falhas de formato sem serviços externos.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const A = require("../acesso"), I = require("../indexador"), S = require("../sincronizacao");
const bytes = Buffer.from("%PDF-1.4\nconteudo proprio de teste");
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
let dados, baixados, listagens;
const snap = (v) => ({ exists: v !== undefined, data: () => structuredClone(v) });
const ref = (id) => ({ id, get: async () => snap(dados.get(id)), set: async (v, opts) => {
  dados.set(id, structuredClone(opts && opts.merge ? { ...dados.get(id), ...v } : v));
} });
const db = { doc: ref, collection: (nome) => ({ doc: (id) => ref(nome + "/" + id) }),
  runTransaction: async (fn) => fn({ get: (r) => r.get(),
    set: (r, v) => dados.set(r.id, structuredClone(v)),
    update: (r, v) => dados.set(r.id, { ...dados.get(r.id), ...structuredClone(v) }),
    create: (r, v) => { assert.equal(dados.has(r.id), false); dados.set(r.id, structuredClone(v)); },
  }) };
const firestore = () => db;
firestore.FieldValue = { serverTimestamp: () => 123456 };
const drive = { files: {
  list: async () => { listagens++; return { data: { files: [
    { id: "edicao", name: "01.pdf", mimeType: "application/pdf", size: String(bytes.length) },
    { id: "falso", name: "02.pdf", mimeType: "application/pdf", size: "5" },
  ] } }; },
  get: async (p) => { baixados++; return { data: Readable.from([p.fileId === "edicao" ? bytes : Buffer.from("HTML!")]) }; },
} };
const ctx = { exports: {}, Buffer, require: (nome) => {
  if (nome === "firebase-functions/v2/https") return { onRequest: (_, fn) => fn, onCall: (_, fn) => fn,
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } } };
  if (nome === "firebase-functions/params") return { defineSecret: () => ({ value: () => "{}" }) };
  if (nome === "firebase-admin") return { initializeApp() {}, firestore };
  if (nome === "googleapis") return { google: { auth: { GoogleAuth: class {} }, drive: () => drive } };
  if (nome === "./configuracao-drive.json") return { pastaId: "raiz", regiao: "us-central1" };
  if (nome === "./indexador") return I;
  if (nome === "./acesso") return A;
  if (nome === "./sincronizacao") return S;
  if (nome === "pdf-parse") return async () => ({ numpages: 1 });
  if (nome === "yauzl") return {};
  return require(nome);
} };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, "../index.js"), "utf8"), ctx);
const req = { auth: { token: { email: "carlos.jr.81@hotmail.com", email_verified: true } }, data: { continuar: true, pastaId: "fora" } };
function reiniciar(direitos = true) {
  dados = new Map(); baixados = 0; listagens = 0;
  if (direitos) dados.set("config/direitosAcervo", { raiz: { titular: "Autor do teste", licenca: "Obra própria", origem: "Fixture" } });
}
let ok = 0, mal = 0;
async function teste(nome, fn) { try { await fn(); ok++; console.log("  ok   " + nome); } catch (e) { mal++; console.log("  X    " + nome + ": " + e.message); } }
(async () => {
  await teste("usuário comum não indexa e não abre o Drive", async () => {
    reiniciar(); await assert.rejects(ctx.exports.indexarAcervo({ auth: { token: {} } }), /Só o dono/);
    assert.equal(listagens, 0);
  });
  await teste("arquivo íntegro grava acervo pelo SHA-256 dos bytes; falso PDF vira erro", async () => {
    reiniciar(); const r = await ctx.exports.indexarAcervo(req);
    const ficha = dados.get("acervo/" + sha);
    assert.equal(r.publicadas, 1); assert.equal(r.erros, 1); assert.equal(r.completo, true);
    assert.equal(ficha.sha256, sha); assert.equal(ficha.paginas, 1); assert.equal(ficha.enviadoEm, 123456);
    assert.equal(ficha.arquivoDrive.pasta, "raiz"); assert.equal(ficha.arquivoDrive.id, "edicao");
    assert.equal(dados.get("controleAcervo/indexacaoDrive").ocupadoAte, 0);
  });
  await teste("nova varredura deduplica sem republicar ficha despublicada", async () => {
    dados.get("acervo/" + sha).status = "pendente";
    const r = await ctx.exports.indexarAcervo(req);
    assert.equal(r.duplicados, 1); assert.equal(r.publicadas, 0);
    assert.equal(dados.get("acervo/" + sha).status, "pendente");
  });
  await teste("sem registro de direitos relata pendência sem gravar edição", async () => {
    reiniciar(false); const r = await ctx.exports.indexarAcervo(req);
    assert.equal(r.pendentes, 2); assert.equal(r.publicadas, 0); assert.equal(baixados, 0);
    assert.equal(dados.has("acervo/" + sha), false);
  });
  console.log("\n" + ok + " passou / " + mal + " falhou"); process.exitCode = mal ? 1 : 0;
})();
