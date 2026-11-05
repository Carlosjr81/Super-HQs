// Testes do núcleo do backend do Drive (autorização e indexação), sem rede.
// Rode: node functions/testes/teste-funcoes.js
const path = require("path");
const A = require(path.join(__dirname, "..", "acesso.js"));
const I = require(path.join(__dirname, "..", "indexador.js"));

let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log("  ok   " + nome); }
  else { mal++; console.log("  X    " + nome + ": " + JSON.stringify(obtido) + " (esperava " + JSON.stringify(esperado) + ")"); }
}
const DONO = "carlos.jr.81@hotmail.com";
const agora = Date.parse("2026-11-05T12:00:00Z");
const dia = 86400000;

console.log("--- autorização (espelha as regras) ---");
const liberado = { status: "liberado", ate: 0, criadoEm: agora - 400 * dia };
teste("liberado sem cobrança: lê", true, A.contaLiberada(liberado, agora, { cobranca: false }));
teste("pendente: não lê", false, A.contaLiberada({ status: "pendente" }, agora, {}));
teste("bloqueado: não lê", false, A.contaLiberada({ status: "bloqueado" }, agora, {}));
teste("vencido (ate no passado): não lê", false, A.contaLiberada({ status: "liberado", ate: agora - dia }, agora, {}));
teste("prazo no futuro: lê", true, A.contaLiberada({ status: "liberado", ate: agora + dia }, agora, { cobranca: false }));
const cob = { cobranca: true, cobrancaDesde: agora - 400 * dia, testeDias: 7 };
teste("cobrança ligada, sem plano e fora do teste: não lê", false, A.contaLiberada(liberado, agora, cob));
teste("cobrança ligada, com pagoAte futuro: lê", true, A.contaLiberada({ status: "liberado", pagoAte: agora + dia }, agora, cob));
teste("cobrança ligada, cortesia sem prazo: lê", true, A.contaLiberada({ status: "liberado", cortesia: true }, agora, cob));
teste("cobrança ligada, vitalício: lê", true, A.contaLiberada({ status: "liberado", vitalicio: true }, agora, cob));
teste("recém-criado no teste de 7 dias: lê", true, A.contaLiberada({ status: "liberado", criadoEm: agora - 2 * dia }, agora, { cobranca: true, cobrancaDesde: agora - 400 * dia, testeDias: 7 }));

console.log("\n--- acesso por coleção ---");
teste("sem o campo: todas as coleções", true, A.podeLerColecao({ status: "liberado" }, "Qualquer"));
teste("acervoTudo:false, só a lista", [true, false], [A.podeLerColecao({ acervoTudo: false, colecoes: ["A"] }, "A"), A.podeLerColecao({ acervoTudo: false, colecoes: ["A"] }, "B")]);

console.log("\n--- entregador: podeBaixarEdicao ---");
const ed = { status: "publicada", colecao: "A", caminho: "drive/xyz" };
teste("liberado + coleção liberada + publicada: pode", true, A.podeBaixarEdicao({}, { acervoTudo: false, colecoes: ["A"], status: "liberado", ate: 0 }, ed, agora, { cobranca: false }, DONO).pode);
teste("coleção não liberada: nega", false, A.podeBaixarEdicao({}, { acervoTudo: false, colecoes: ["B"], status: "liberado", ate: 0 }, ed, agora, { cobranca: false }, DONO).pode);
teste("edição pendente: nega (mesmo liberado)", false, A.podeBaixarEdicao({}, liberado, { status: "pendente", colecao: "A", caminho: "drive/x" }, agora, { cobranca: false }, DONO).pode);
teste("conta pendente: nega", false, A.podeBaixarEdicao({}, { status: "pendente" }, ed, agora, { cobranca: false }, DONO).pode);
teste("dono (e-mail confirmado) baixa até pendente", true, A.podeBaixarEdicao({ email: DONO, email_verified: true }, null, { status: "pendente", colecao: "Z", caminho: "drive/x" }, agora, {}, DONO).pode);
teste("mesmo e-mail do dono SEM confirmação: não é dono", false, A.podeBaixarEdicao({ email: DONO, email_verified: false }, null, { status: "pendente", colecao: "Z", caminho: "drive/x" }, agora, {}, DONO).pode);
teste("edição sem caminho cadastrado: nega", false, A.podeBaixarEdicao({ email: DONO, email_verified: true }, null, { status: "publicada", colecao: "A" }, agora, {}, DONO).pode);

console.log("\n--- indexador: classificação ---");
teste("pasta", "pasta", I.classificarItem({ mimeType: I.PASTA, name: "X" }));
teste("atalho (não é edição, não seguir)", "atalho", I.classificarItem({ mimeType: I.ATALHO, name: "link" }));
teste("arquivo pdf/cbz", ["arquivo", "arquivo"], [I.classificarItem({ mimeType: "application/pdf", name: "a.pdf" }), I.classificarItem({ mimeType: "x", name: "a.cbz" })]);
teste("outro (imagem solta)", "outro", I.classificarItem({ mimeType: "image/png", name: "capa.png" }));
teste("tipo por nome: cbr não entra", [null, "pdf", "zip"], [I.tipoDaEdicao("a.cbr", ""), I.tipoDaEdicao("a.pdf", ""), I.tipoDaEdicao("a.cbz", "")]);

console.log("\n--- indexador: ficha e direitos ---");
const arq = { driveId: "d1", nome: "Edição 01.cbz", tipo: "zip", sha256: "a".repeat(64), paginas: 24, tamanho: 999, colecao: "Turma", pastaId: "p1" };
const dir = { titular: "Editora X", licenca: "Contrato 2026", origem: "Acervo do dono" };
const r = I.montarFicha(arq, dir, agora);
teste("ficha publicada com direitos e caminho resolvido pelo servidor", ["a".repeat(64), "publicada", "Turma", "drive/d1", "Editora X"], r.ficha && [r.ficha.sha256, r.ficha.status, r.ficha.colecao, r.ficha.caminho, r.ficha.titular]);
teste("sem direitos: vai para revisão, não publica", true, !!I.montarFicha(arq, { titular: "X" }, agora).revisao);
teste("sem páginas: revisão", true, !!I.montarFicha(Object.assign({}, arq, { paginas: 0 }), dir, agora).revisao);
teste("sem sha256: revisão", true, !!I.montarFicha(Object.assign({}, arq, { sha256: "" }), dir, agora).revisao);
teste("tipo inválido: revisão", true, !!I.montarFicha(Object.assign({}, arq, { tipo: null }), dir, agora).revisao);

console.log("\n--- indexador: dedup e relatório ---");
teste("dedup por SHA-256", ["a".repeat(64), "b".repeat(64)], I.dedupPorSha([{ sha256: "a".repeat(64) }, { sha256: "a".repeat(64) }, { sha256: "b".repeat(64) }]).map((f) => f.sha256));
teste("relatório separa cada situação", { total: 5, arquivos: 3, pastas: 1, atalhos: 1, outros: 0, publicadas: 1, pendentes: 1, duplicados: 1, erros: 0 },
  I.resumoIndexacao([{ classe: "pasta" }, { classe: "atalho" }, { classe: "arquivo", situacao: "publicada" }, { classe: "arquivo", situacao: "pendente" }, { classe: "arquivo", situacao: "duplicado" }]));

console.log("\n" + ok + " passou / " + mal + " falhou");
process.exit(mal ? 1 : 0);
