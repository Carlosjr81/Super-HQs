// A sincronização do acervo, com um Commons de mentira: paginação, retomada
// depois de interrupção, duplicatas, novidades, alterações, fonte fora do ar,
// direitos, revisão, aprovação, pausa e as edições do dono preservadas.
const path = require("path");
const N = require(path.join(__dirname, "..", "conectores", "nucleo.js"));
const { sincronizar, relatorio } = require(path.join(__dirname, "..", "conectores", "rodar.js"));
const commons = require(path.join(__dirname, "..", "conectores", "commons.js"));

let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log("  ok   " + nome.padEnd(66) + JSON.stringify(obtido)); }
  else { mal++; console.log("  X    " + nome.padEnd(66) + JSON.stringify(obtido) + ", esperava " + JSON.stringify(esperado)); }
}

// ---- o Commons de mentira: arquivos em lotes de 2, com "continue"
function arquivo(nome, sha1, licenca, mime) {
  return { title: "File:" + nome, imageinfo: [{ url: "https://x/" + nome, thumburl: "https://x/1280px-" + nome, thumbwidth: 1280, thumbheight: 1700,
    width: 2000, height: 2600, sha1: sha1, mime: mime || "image/jpeg", size: 1000, descriptionurl: "https://commons/File:" + nome,
    extmetadata: { LicenseShortName: { value: licenca || "Public domain" }, Artist: { value: "<a>Winsor McCay</a>" } } }] };
}
function commonsFalso(arquivos, opcoes) {
  const o = opcoes || {};
  const chamadas = { n: 0 };
  const f = async (url) => {
    chamadas.n++;
    if (o.foraDoAr) throw new Error("Commons respondeu 503");
    if (o.quebrarNa && chamadas.n === o.quebrarNa) { const e = new Error("interrompido"); e.definitivo = true; throw e; }
    const q = new URL(url).searchParams;
    const ini = +(q.get("gcmcontinue") || 0);
    const lote = arquivos.slice(ini, ini + 2);
    const j = { query: { pages: lote } };
    if (ini + 2 < arquivos.length) j.continue = { gcmcontinue: String(ini + 2), continue: "gcmcontinue||" };
    return j;
  };
  f.chamadas = chamadas;
  return f;
}
const FONTE = { id: "nemo", tipo: "commons-categoria", categoria: "Category:Nemo", padrao: "^Nemo \\d+\\.jpg$", titulo: "Nemo", colecao: "Nemo",
  autor: "Winsor McCay", autorFalecidoEm: 1934, ano: 1906, categoriaApp: "hq", origemUrl: "https://commons/Category:Nemo" };
const BASE = [arquivo("Nemo 1.jpg", "a1"), arquivo("Nemo 2.jpg", "a2"), arquivo("Nemo 10.jpg", "a10"), arquivo("Nemo recorte.jpg", "r1"), arquivo("Nemo 3.jpg", "a3")];
const AGORA = Date.parse("2026-10-31T12:00:00Z");
const sempre = async () => true;
const semEspera = async () => {};
const dep = (extra) => Object.assign({ config: { fontes: [FONTE] }, conectores: { "commons-categoria": commons }, disponivel: sempre,
  esperar: semEspera, pausa: 0, agora: AGORA, forcar: true }, extra);

(async () => {
  console.log("--- direitos (Lei 9.610/98, art. 41) ---");
  teste("McCay (†1934): domínio público no Brasil em 2026", true, N.dominioPublicoNoBrasil(1934, 2026));
  teste("autor morto em 1956: ainda protegido em 2026 (livre em 2027)", [false, true], [N.dominioPublicoNoBrasil(1956, 2026), N.dominioPublicoNoBrasil(1956, 2027)]);
  teste("sem ano de morte: nunca publica sozinho", false, N.decidirDireitos({ licenca: "Public domain", mime: "image/jpeg", sha1: "x", url: "u" }, { autorFalecidoEm: null }, 2026).publicar);
  teste("licença que não é livre na fonte: revisão", false, N.decidirDireitos({ licenca: "CC BY-SA 4.0", mime: "image/jpeg", sha1: "x", url: "u" }, FONTE, 2026).publicar);
  teste("PDF ou vídeo da categoria: revisão", false, N.decidirDireitos({ licenca: "Public domain", mime: "application/pdf", sha1: "x", url: "u" }, FONTE, 2026).publicar);
  teste("CC0 vale", true, N.licencaLivre("CC0"));

  console.log("\n--- importação inicial com paginação ---");
  const f1 = commonsFalso(BASE);
  const r1 = await sincronizar(dep({ buscarJson: f1 }));
  const o1 = r1.catalogo.obras[0];
  teste("percorre todas as páginas da consulta (3 lotes de 2)", 3, f1.chamadas.n);
  teste("o padrão deixa de fora o recorte", ["Nemo 1.jpg", "Nemo 2.jpg", "Nemo 3.jpg", "Nemo 10.jpg"], o1.paginas.map((p) => p.titulo));
  teste("ordem natural (10 depois de 3)", "Nemo 10.jpg", o1.paginas[3].titulo);
  teste("id interno estável e procedência", ["dp-nemo", "commons-categoria", "Category:Nemo"], [o1.id, o1.fonte, o1.origem.id]);
  teste("direitos registrados na obra", ["dominio-publico", 1934], [o1.direitos.situacao, o1.direitos.autorFalecidoEm]);
  teste("crédito do artista sem HTML", "Winsor McCay", commons.paginaDoResultado(BASE[0]).artista);
  teste("publicada, com 4 páginas", ["publicada", 4], [o1.status, o1.paginas.length]);
  teste("relatório reconcilia: 4 na fonte, 4 publicadas, 0 em revisão", true, /\| Nemo \| ok \| nova \| 4 \| 4 \| 0 \|/.test(relatorio(r1.resumo, r1.catalogo)));

  const fsem = commonsFalso(BASE);
  const rsem = await sincronizar(dep({ buscarJson: fsem, esperar: undefined, pausa: undefined }));
  teste("opções ausentes (como na execução real) não quebram a paginação", ["ok", 3], [rsem.resumo.fontes[0].situacao, fsem.chamadas.n]);

  console.log("\n--- idempotência ---");
  const r2 = await sincronizar(dep({ buscarJson: commonsFalso(BASE), catalogo: r1.catalogo, estado: r1.estado }));
  teste("rodar de novo com a mesma fonte não muda nada", ["nada", 1, 4], [r2.resumo.fontes[0].mudanca, r2.catalogo.obras.length, r2.catalogo.obras[0].paginas.length]);
  const rDia = await sincronizar(dep({ buscarJson: commonsFalso(BASE), catalogo: r1.catalogo, estado: r1.estado, forcar: false }));
  teste("dentro do intervalo, a fonte nem é consultada", "em dia", rDia.resumo.fontes[0].situacao);
  teste("sem novidade, o catálogo fica idêntico (nem a hora muda: sem commit à toa)", [r1.catalogo.geradoEm, false],
    [(await sincronizar(dep({ buscarJson: commonsFalso(BASE), catalogo: r1.catalogo, estado: r1.estado, agora: AGORA + 5000 }))).catalogo.geradoEm, rDia.resumo.rodou]);

  console.log("\n--- duplicatas ---");
  const dup = BASE.concat([arquivo("Nemo 4.jpg", "a2")]);
  const r3 = await sincronizar(dep({ buscarJson: commonsFalso(dup) }));
  teste("a mesma imagem (mesmo SHA-1) com outro nome entra uma vez", 4, r3.catalogo.obras[0].paginas.length);

  console.log("\n--- novidade e alteração ---");
  const novo = BASE.concat([arquivo("Nemo 11.jpg", "a11")]);
  const r4 = await sincronizar(dep({ buscarJson: commonsFalso(novo), catalogo: r1.catalogo, estado: r1.estado }));
  teste("página nova na fonte: a obra é alterada e ganha a página", ["alterada", 5], [r4.resumo.fontes[0].mudanca, r4.catalogo.obras[0].paginas.length]);
  teste("publicadaEm se mantém, atualizadaEm muda", [r1.catalogo.obras[0].publicadaEm, AGORA], [r4.catalogo.obras[0].publicadaEm, r4.catalogo.obras[0].atualizadaEm]);
  const trocada = BASE.map((a) => (a.title === "File:Nemo 2.jpg" ? arquivo("Nemo 2.jpg", "a2-nova") : a));
  const r5 = await sincronizar(dep({ buscarJson: commonsFalso(trocada), catalogo: r1.catalogo, estado: r1.estado }));
  teste("arquivo substituído na fonte (SHA-1 novo): alteração detectada", ["alterada", "a2-nova"], [r5.resumo.fontes[0].mudanca, r5.catalogo.obras[0].paginas[1].id]);

  console.log("\n--- interrupção e retomada ---");
  const fq = commonsFalso(BASE, { quebrarNa: 2 });
  const salvos = [];
  const r6 = await sincronizar(dep({ buscarJson: fq, aoGuardar: async (e) => salvos.push(JSON.stringify(e)) }));
  teste("a interrupção vira erro da fonte, sem catálogo novo", ["erro", 0], [r6.resumo.fontes[0].situacao, r6.catalogo.obras.length]);
  teste("o cursor ficou guardado depois do 1º lote", [1, 2], [r6.estado.fontes.nemo.cursor.consultas, r6.estado.fontes.nemo.cursor.paginas.length]);
  const fr = commonsFalso(BASE);
  const r7 = await sincronizar(dep({ buscarJson: fr, estado: JSON.parse(salvos[salvos.length - 1]) }));
  teste("a retomada começa do 2º lote (2 consultas, não 3)", 2, fr.chamadas.n);
  teste("e termina com a obra completa", ["ok", 4], [r7.resumo.fontes[0].situacao, r7.catalogo.obras[0].paginas.length]);
  teste("cursor limpo depois de terminar", null, r7.estado.fontes.nemo.cursor);

  console.log("\n--- fonte fora do ar ---");
  const r8 = await sincronizar(dep({ buscarJson: commonsFalso(BASE, { foraDoAr: true }), catalogo: r1.catalogo, estado: r1.estado }));
  teste("falha temporária: nada é excluído", ["erro", "publicada", 4], [r8.resumo.fontes[0].situacao, r8.catalogo.obras[0].status, r8.catalogo.obras[0].paginas.length]);
  teste("o erro fica registrado no estado", true, /503/.test(r8.estado.fontes.nemo.erro));
  let tentativas = 0;
  await N.comTentativas(async () => { tentativas++; if (tentativas < 3) throw new Error("x"); }, { esperar: semEspera }).catch(() => {});
  teste("tentativas limitadas: recupera na 3ª", 3, tentativas);
  const esperas = [];
  await N.comTentativas(async () => { throw new Error("x"); }, { tentativas: 4, base: 1000, esperar: async (ms) => esperas.push(ms) }).catch(() => {});
  teste("espera progressiva: 1 s, 2 s, 4 s", [1000, 2000, 4000], esperas);

  console.log("\n--- a fonte esvaziou (consulta com sucesso, zero páginas) ---");
  const r9 = await sincronizar(dep({ buscarJson: commonsFalso([]), catalogo: r1.catalogo, estado: r1.estado }));
  teste("a obra fica indisponível, não some (o progresso de quem lia vale)", ["indisponivel", 1, 4], [r9.catalogo.obras[0].status, r9.catalogo.obras.length, r9.catalogo.obras[0].paginas.length]);
  const r10 = await sincronizar(dep({ buscarJson: commonsFalso(BASE), catalogo: r9.catalogo, estado: r9.estado }));
  teste("e volta quando a fonte volta", ["voltou", "publicada"], [r10.resumo.fontes[0].mudanca, r10.catalogo.obras[0].status]);

  console.log("\n--- revisão e aprovação ---");
  const misto = BASE.concat([arquivo("Nemo 5.jpg", "a5", "CC BY-SA 4.0")]);
  const r11 = await sincronizar(dep({ buscarJson: commonsFalso(misto) }));
  teste("página sem licença livre vai para revisão, as outras publicam", [4, 1, "Nemo 5.jpg"], [r11.catalogo.obras[0].paginas.length, r11.catalogo.revisao.length, r11.catalogo.revisao[0].pagina]);
  const r12 = await sincronizar(dep({ buscarJson: commonsFalso(misto), catalogo: r11.catalogo, estado: r11.estado, aprovacoes: ["dp-nemo|Nemo 5.jpg"] }));
  teste("aprovada pelo dono: publica e sai da revisão", [5, 0], [r12.catalogo.obras[0].paginas.length, r12.catalogo.revisao.length]);
  const protegida = Object.assign({}, FONTE, { autorFalecidoEm: 1980 });
  const r13 = await sincronizar(dep({ buscarJson: commonsFalso(BASE), config: { fontes: [protegida] } }));
  teste("autor morto em 1980: nada publica, tudo em revisão", [0, 4], [r13.catalogo.obras.length, r13.catalogo.revisao.length]);
  const r14 = await sincronizar(dep({ buscarJson: commonsFalso(BASE), disponivel: async (u) => !/Nemo 2/.test(u) }));
  teste("arquivo que não responde: revisão, não publica", [3, "o arquivo não respondeu na conferência"], [r14.catalogo.obras[0].paginas.length, r14.catalogo.revisao[0].motivo]);

  console.log("\n--- as edições do dono e a pausa ---");
  const editado = JSON.parse(JSON.stringify(r1.catalogo));
  editado.obras[0].editado = { titulo: "Little Nemo (meu título)" };
  editado.obras[0].titulo = "Little Nemo (meu título)";
  const r15 = await sincronizar(dep({ buscarJson: commonsFalso(novo), catalogo: editado, estado: r1.estado }));
  teste("alteração da fonte não desfaz o título editado pelo dono", ["Little Nemo (meu título)", 5], [r15.catalogo.obras[0].titulo, r15.catalogo.obras[0].paginas.length]);
  const fp = commonsFalso(BASE);
  const r16 = await sincronizar(dep({ buscarJson: fp, config: { pausado: true, fontes: [FONTE] } }));
  teste("tudo pausado: nenhuma consulta", [true, 0], [r16.resumo.pausado, fp.chamadas.n]);
  const r17 = await sincronizar(dep({ buscarJson: fp, config: { fontes: [Object.assign({}, FONTE, { pausado: true })] } }));
  teste("fonte pausada: nenhuma consulta", ["pausada", 0], [r17.resumo.fontes[0].situacao, fp.chamadas.n]);

  console.log("\n" + ok + " passou / " + mal + " falhou");
  process.exit(mal ? 1 : 0);
})();
