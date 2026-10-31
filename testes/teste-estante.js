// A estante: o tipo do arquivo pelos bytes, as páginas de um CBZ, o título,
// a busca sem acento, o estado de leitura e o continuar lendo. O abrir de
// verdade (pdf.js, fflate, IndexedDB) é conferido no navegador com as
// amostras de testes/amostras/.
const html = require("./app").lerApp();
function pedaco(de, ate) {
  const i = html.indexOf(de), f = html.indexOf(ate, i);
  if (i < 0 || f < 0) { console.error("nao achei: " + de); process.exit(1); }
  return html.slice(i, f);
}
eval(pedaco("const semAcento = (s) =>", ";\n") + ";\nglobalThis.semAcento = semAcento;");
eval(pedaco("// ---------------- ESTANTE: AS CONTAS", "// ---------------- FIM DAS CONTAS DA ESTANTE") +
  "\nglobalThis.E = { tipoDoArquivo, paginasDoZip, tituloDoArquivo, buscarObras, estadoLeitura, progressoTexto, continuarLendo, ordemNatural, hexDe, tamanhoTexto };");

let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log("  ok   " + nome.padEnd(62) + JSON.stringify(obtido)); }
  else { mal++; console.log("  X    " + nome.padEnd(62) + JSON.stringify(obtido) + ", esperava " + JSON.stringify(esperado)); }
}
const bytes = (s) => Array.from(Buffer.from(s, "binary"));

console.log("--- o tipo vem dos bytes, não do nome ---");
teste("PDF", "pdf", E.tipoDoArquivo(bytes("%PDF-1.7")));
teste("ZIP (CBZ, ou CBR que é ZIP por dentro)", "zip", E.tipoDoArquivo(bytes("PK\x03\x04")));
teste("RAR (CBR de verdade)", "rar", E.tipoDoArquivo(bytes("Rar!\x1a\x07")));
teste("7-Zip", "7z", E.tipoDoArquivo([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]));
teste("outra coisa", null, E.tipoDoArquivo(bytes("GIF89a")));
teste("arquivo vazio", null, E.tipoDoArquivo([]));

console.log("\n--- as páginas de um CBZ ---");
teste("ordem natural: 2 antes de 10", ["p1.jpg", "p2.jpg", "p10.jpg"], E.paginasDoZip(["p10.jpg", "p2.jpg", "p1.jpg"]));
teste("fora: lixo do Mac, ocultos e o que não é imagem", ["a/001.png"],
  E.paginasDoZip(["__MACOSX/a/._001.png", "a/.DS_Store", "a/001.png", "info.txt", "ComicInfo.xml"]));
teste("pastas também em ordem natural", ["cap 2/01.jpg", "cap 10/01.jpg"], E.paginasDoZip(["cap 10/01.jpg", "cap 2/01.jpg"]));
teste("extensão em maiúscula e webp", ["01.JPG", "02.webp"], E.paginasDoZip(["02.webp", "01.JPG"]));
teste("números especiais: 0, 0.1, 1", ["#0", "#0.1", "#1"], ["#1", "#0.1", "#0"].sort(E.ordemNatural));

console.log("\n--- o título, sem inventar nada ---");
teste("tira a extensão e os sublinhados", "Minha Revista 001 (2020)", E.tituloDoArquivo("Minha_Revista_001 (2020).cbz"));
teste("tira a pasta do caminho", "Edição 3", E.tituloDoArquivo("C:\\HQs\\Coleção\\Edição 3.pdf"));
teste("nome vazio", "Sem título", E.tituloDoArquivo(".cbz"));

console.log("\n--- estado de leitura ---");
const nova = { id: "a", titulo: "Ação", nomeOriginal: "acao.cbz", paginas: 10, categoria: "hq", adicionadoEm: 3, leitura: null };
const lendo = { id: "b", titulo: "Bárbaro", nomeOriginal: "b.pdf", paginas: 20, categoria: "manga", adicionadoEm: 1, leitura: { pagina: 4, em: 50 } };
const lida = { id: "c", titulo: "Cidade 10", nomeOriginal: "c.cbz", paginas: 8, categoria: "hq", adicionadoEm: 2, colecao: "Saga da Noite", leitura: { pagina: 7, em: 40 } };
const lendo2 = { id: "d", titulo: "Cidade 2", nomeOriginal: "d.cbz", paginas: 8, categoria: "hq", adicionadoEm: 4, leitura: { pagina: 1, em: 90 } };
const todas = [nova, lendo, lida, lendo2];
teste("nova, lendo e lida", ["nova", "lendo", "lida"], [nova, lendo, lida].map(E.estadoLeitura));
teste("o texto do progresso", ["Não iniciada", "Página 5 de 20", "Lida"], [nova, lendo, lida].map(E.progressoTexto));
teste("continuar lendo: só as começadas, a mais recente primeiro", ["d", "b"], E.continuarLendo(todas).map((o) => o.id));

console.log("\n--- a busca ---");
teste("sem acento: 'barbaro' acha 'Bárbaro'", ["b"], E.buscarObras(todas, { termo: "barbaro" }).map((o) => o.id));
teste("acento na busca também: 'AÇÃO' acha 'Ação'", ["a"], E.buscarObras(todas, { termo: "AÇÃO" }).map((o) => o.id));
teste("palavra por palavra, em qualquer ordem", ["c"], E.buscarObras(todas, { termo: "noite cidade" }).map((o) => o.id));
teste("acha pelo nome original do arquivo", ["b"], E.buscarObras(todas, { termo: "b.pdf" }).map((o) => o.id));
teste("categoria", ["b"], E.buscarObras(todas, { categoria: "manga" }).map((o) => o.id));
teste("estado: só as lidas", ["c"], E.buscarObras(todas, { estado: "lida" }).map((o) => o.id));
teste("recentes primeiro", ["d", "a", "c", "b"], E.buscarObras(todas, { ordem: "recentes" }).map((o) => o.id));
teste("título A-Z, com número em ordem natural", ["a", "b", "d", "c"], E.buscarObras(todas, { ordem: "titulo" }).map((o) => o.id));
teste("lidas por último", ["d", "b", "c", "a"], E.buscarObras(todas, { ordem: "lidas" }).map((o) => o.id));
teste("busca vazia devolve tudo", 4, E.buscarObras(todas, {}).length);
teste("a busca não mexe na lista original", ["a", "b", "c", "d"], todas.map((o) => o.id));

console.log("\n--- miudezas ---");
teste("hex do SHA-256", "00ff10", E.hexDe(new Uint8Array([0, 255, 16]).buffer));
teste("tamanho em KB e MB", ["12 KB", "3,5 MB"], [E.tamanhoTexto(12 * 1024), E.tamanhoTexto(3.5 * 1048576)]);

console.log("\n--- o que a estante promete ---");
teste("o arquivo é identificado pelo conteúdo (SHA-256), não pelo nome", true, /crypto\.subtle\.digest\("SHA-256"/.test(html));
teste("o mesmo arquivo não entra duas vezes", true, /if \(await estanteDb\.obra\(id\)\) return \{ repetida: true \}/.test(html));
teste("as bibliotecas da estante vêm com SRI", 2, (html.match(/LIB_ESTANTE\.(fflate|pdf)\.sri/g) || []).length);
teste("página descompactada tem limite (arquivo feito para estourar a memória)", true, /f\.originalSize <= LIMITE_PAGINA/.test(html));

console.log("\n" + ok + " passou / " + mal + " falhou");
process.exit(mal ? 1 : 0);
