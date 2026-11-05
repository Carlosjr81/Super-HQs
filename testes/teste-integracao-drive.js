// Configuração consistente e continuação do fluxo real usado pelo painel.
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { preparar, configuracao } = require("../conectores/configurar-drive");
const html = require("./app").lerApp();
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf("async function indexarDriveAteConcluir("), html.indexOf("function TelaAcervoDono(")), ctx);
let ok = 0, mal = 0;
async function teste(nome, fn) { try { await fn(); ok++; console.log("  ok   " + nome); } catch (e) { mal++; console.log("  X    " + nome + ": " + e.message); } }
(async () => {
  await teste("origem, pacote de deploy e endpoints do app estão consistentes", () => {
    const d = preparar(undefined, true);
    assert.equal(d.pastaId, "1NrPoBf734hH_haSV5H9AtNfwm97Uq5R6");
    assert.equal(d.endpoints.baixar, "https://us-central1-super-hqs.cloudfunctions.net/baixarEdicao");
  });
  await teste("configuração de outro projeto é recusada", () => {
    assert.throws(() => configuracao({ fontePrimaria: "drive", drive: { projeto: "outro" } }));
  });
  await teste("mil lotes continuam automaticamente até completo, sem uma chamada extra", async () => {
    let chamadas = 0, recebido = 0;
    const r = await ctx.indexarDriveAteConcluir(async () => ({ total: ++chamadas * 30, completo: chamadas === 1000 }),
      async (r) => { recebido = r.total; }, () => true);
    assert.equal(chamadas, 1000); assert.equal(recebido, 30000); assert.equal(r.completo, true);
  });
  await teste("interromper conserva o último lote e não inicia outro", async () => {
    let chamadas = 0, ativo = true;
    await ctx.indexarDriveAteConcluir(async () => { chamadas++; return { completo: false }; },
      async () => { ativo = false; }, () => ativo);
    assert.equal(chamadas, 1);
  });
  await teste("falha de rede interrompe sem anunciar conclusão", async () => {
    let chamadas = 0, lotes = 0;
    await assert.rejects(ctx.indexarDriveAteConcluir(async () => {
      if (++chamadas === 2) throw Error("rede indisponível");
      return { completo: false };
    }, async () => { lotes++; }, () => true), /rede indisponível/);
    assert.equal(chamadas, 2); assert.equal(lotes, 1);
  });
  await teste("resposta incompatível do backend é recusada", async () => {
    await assert.rejects(ctx.indexarDriveAteConcluir(async () => ({}), async () => {}, () => true), /inválida/);
  });
  console.log("\n" + ok + " passou / " + mal + " falhou"); process.exitCode = mal ? 1 : 0;
})();
