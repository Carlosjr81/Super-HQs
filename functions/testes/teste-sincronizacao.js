// Fluxo real do percurso e da retomada, com rede e persistência substituídas.
const assert = require("node:assert/strict");
const S = require("../sincronizacao");
const I = require("../indexador");
let ok = 0, mal = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { mal++; console.log("  X    " + nome + ": " + e.message); }
}
const pasta = (id, name) => ({ id, name, mimeType: I.PASTA });
const arquivo = (id) => ({ id, name: id + ".cbz", mimeType: "application/zip", size: "500" });
const clone = (x) => JSON.parse(JSON.stringify(x));
(async () => {
  await teste("formato verificado pelos bytes; HTML/RAR disfarçado recusado", () => {
    assert.equal(I.tipoPelosBytes(Buffer.from("%PDF-1.7")), "pdf");
    assert.equal(I.tipoPelosBytes(Buffer.from([80,75,3,4])), "zip");
    assert.equal(I.tipoPelosBytes(Buffer.from("<html>")), null);
    assert.equal(I.tipoPelosBytes(Buffer.from("Rar!abcd")), null);
  });
  await teste("retoma páginas e subpastas sem reprocessar edições; ignora quarentena e atalhos", async () => {
    let salvo, leituras = [], paginas = [];
    const listar = async (id, token) => {
      paginas.push(id + ":" + token);
      if (id === "raiz" && !token) return { files: [pasta("q", "90_Quarentena"), pasta("c", "Coleção A"), { id: "s", name: "Atalho", mimeType: I.ATALHO }], nextPageToken: "p2" };
      if (id === "raiz") return { files: [arquivo("1")] };
      if (id === "c") return { files: [arquivo("2"), arquivo("3")] };
      throw Error("Não deveria entrar na quarentena");
    };
    const processar = async (item, p) => { leituras.push([item.id, p.nome]); return { situacao: item.id === "3" ? "pendente" : "publicada" }; };
    for (let n = 0; n < 20 && !salvo?.completo; n++) {
      await S.processarLote({ raiz: "raiz", estado: salvo, listar, processar, limite: 2, salvar: async (e) => { salvo = clone(e); } });
    }
    assert.equal(salvo.completo, true);
    assert.deepEqual(leituras, [["1", ""], ["2", "Coleção A"], ["3", "Coleção A"]]);
    assert.deepEqual(paginas, ["raiz:", "raiz:p2", "c:"]);
    assert.equal(salvo.resumo.atalhos, 1); assert.equal(salvo.resumo.ignorados, 1);
    assert.equal(salvo.resumo.publicadas, 2); assert.equal(salvo.resumo.pendentes, 1);
  });
  await teste("falha de listagem não vira catálogo completo e conserva o cursor", async () => {
    let salvo;
    await assert.rejects(S.processarLote({ raiz: "r", listar: async () => { throw Error("Drive 503"); }, processar: async () => {}, salvar: async (e) => { salvo = clone(e); } }), /Drive 503/);
    // O estado inicial já é salvo pelo chamador antes de buscar a primeira página.
    const e = S.novoEstado("r");
    await assert.rejects(S.processarLote({ raiz: "r", estado: e, listar: async () => { throw Error("Drive 503"); }, salvar: async () => {} }), /Drive 503/);
    assert.equal(e.completo, false); assert.equal(e.atual.pasta.id, "r");
  });
  await teste("erro em uma revista é relatado e não impede a seguinte", async () => {
    const e = await S.processarLote({ raiz: "r", listar: async () => ({ files: [arquivo("ruim"), arquivo("boa")] }),
      processar: async (f) => { if (f.id === "ruim") throw Error("ZIP quebrado"); return { situacao: "publicada" }; }, salvar: async () => {} });
    assert.equal(e.completo, true); assert.equal(e.resumo.erros, 1); assert.equal(e.resumo.publicadas, 1);
  });
  await teste("mudança de raiz não reutiliza cursor de outra pasta", async () => {
    await assert.rejects(S.processarLote({ raiz: "nova", estado: S.novoEstado("antiga") }), /pasta mudou/);
  });
  await teste("mais de 500 edições são processadas com retomada", async () => {
    let e, gravadas = 0;
    const listar = async (id, token) => {
      const pagina = Number(token || 0);
      return { files: Array.from({ length: 100 }, (_, n) => arquivo(String(pagina * 100 + n))), nextPageToken: pagina < 5 ? String(pagina + 1) : undefined };
    };
    for (let n = 0; n < 30 && !e?.completo; n++) e = await S.processarLote({ raiz: "r", estado: e, listar,
      processar: async () => { gravadas++; return { situacao: "publicada" }; }, salvar: async () => {} });
    assert.equal(e.completo, true); assert.equal(gravadas, 600); assert.equal(e.resumo.publicadas, 600);
  });
  const metadados = {
    arquivo: { ...arquivo("arquivo"), parents: ["colecao"] },
    colecao: { ...pasta("colecao", "Minha coleção"), parents: ["raiz"] }, raiz: pasta("raiz", "Acervo"),
  };
  await teste("entrega só o arquivo atualmente sob a raiz", async () => {
    assert.equal((await S.arquivoNaRaiz("arquivo", "raiz", async (id) => metadados[id])).id, "arquivo");
    assert.equal(await S.arquivoNaRaiz("arquivo", "outra", async (id) => metadados[id]), null);
  });
  await teste("arquivo movido para quarentena ou lixeira não é entregue", async () => {
    const q = clone(metadados); q.colecao.name = "90_Quarentena";
    assert.equal(await S.arquivoNaRaiz("arquivo", "raiz", async (id) => q[id]), null);
    q.colecao.name = "Coleção"; q.arquivo.trashed = true;
    assert.equal(await S.arquivoNaRaiz("arquivo", "raiz", async (id) => q[id]), null);
  });
  await teste("ciclo de pais e atalho nunca dão acesso fora da raiz", async () => {
    assert.equal(await S.arquivoNaRaiz("arquivo", "raiz", async () => ({ ...arquivo("arquivo"), parents: ["arquivo"] })), null);
    assert.equal(await S.arquivoNaRaiz("arquivo", "raiz", async () => ({ mimeType: I.ATALHO, parents: ["raiz"] })), null);
  });
  await teste("intervalos de 8 MiB cobrem revista grande sem exceder cota da Function", () => {
    const total = 38934181, passo = 8 * 1048576; let cobertos = 0;
    for (let inicio = 0; inicio < total; inicio += passo) {
      const fim = Math.min(inicio + passo, total) - 1;
      const p = S.intervaloDoDownload("bytes=" + inicio + "-" + fim, total);
      assert.ok(p); cobertos += p.fim - p.inicio + 1;
    }
    assert.equal(cobertos, total); assert.equal(S.intervaloDoDownload("", total), null);
    for (const r of ["bytes=0-9000000", "bytes=10-0", "bytes=0-38934181", "bytes=0-1,3-4", "bytes=-4"]) assert.equal(S.intervaloDoDownload(r, total), null);
  });
  console.log("\n" + ok + " passou / " + mal + " falhou"); process.exit(mal ? 1 : 0);
})();
