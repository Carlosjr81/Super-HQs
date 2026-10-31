// A sincronização do acervo: roda as fontes de conectores/config.json e
// atualiza catalogo/acervo.json, que o app lê.
//
//   node conectores/rodar.js                  todas as fontes ativas
//   node conectores/rodar.js --fonte nemo-1906 só uma
//   node conectores/rodar.js --limite 1       no máximo 1 consulta por fonte (teste)
//
// Roda no GitHub Actions (sincronizar.yml) de tempos em tempos, e também na
// mão. Uma fonte que falha não derruba as outras nem apaga nada: o erro fica
// no estado e no relatório, e o cursor fica guardado para retomar.
"use strict";
const fs = require("fs");
const path = require("path");
const N = require("./nucleo");
const commons = require("./commons");

const RAIZ = path.join(__dirname, "..");
const ARQ = {
  config: path.join(__dirname, "config.json"),
  estado: path.join(__dirname, "estado.json"),
  aprovacoes: path.join(__dirname, "aprovacoes.json"),
  catalogo: path.join(RAIZ, "catalogo", "acervo.json"),
  relatorio: path.join(__dirname, "relatorio.md"),
};

function lerJson(arq, padrao) { try { return JSON.parse(fs.readFileSync(arq, "utf8")); } catch (e) { return padrao; } }
// Gravação atômica: escreve ao lado e renomeia. Uma interrupção no meio nunca
// deixa um catálogo pela metade.
function gravarJson(arq, dados) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = arq + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 1) + "\n");
  fs.renameSync(tmp, arq);
}

const CONECTORES = { "commons-categoria": commons };

// O trabalho em si, com tudo injetável para o teste.
async function sincronizar(d) {
  const agora = d.agora || Date.now();
  const anoAtual = new Date(agora).getUTCFullYear();
  const config = d.config;
  const estado = d.estado || { fontes: {} };
  estado.fontes = estado.fontes || {};
  let catalogo = d.catalogo || { versao: 1, obras: [], revisao: [] };
  const aprovadas = new Set(d.aprovacoes || []);
  const resumo = { inicio: agora, fontes: [] };

  if (config.pausado) { resumo.pausado = true; return { catalogo, estado, resumo }; }
  for (const fonte of config.fontes || []) {
    if (d.soFonte && fonte.id !== d.soFonte) continue;
    const ef = estado.fontes[fonte.id] = estado.fontes[fonte.id] || {};
    const r = { id: fonte.id, titulo: fonte.titulo };
    resumo.fontes.push(r);
    if (fonte.pausado) { r.situacao = "pausada"; continue; }
    const conector = d.conectores[fonte.tipo];
    if (!conector) { r.situacao = "erro"; r.erro = "tipo de fonte desconhecido: " + fonte.tipo; ef.erro = r.erro; continue; }
    // intervalo mínimo entre coletas de uma fonte (respeito à fonte)
    const intervalo = (config.intervaloHoras || 24) * 3600000;
    if (!d.forcar && !ef.cursor && ef.ultimaColeta && agora - ef.ultimaColeta < intervalo) { r.situacao = "em dia"; continue; }
    try {
      ef.ultimaTentativa = agora;
      const cursor = await N.comTentativas(() => conector.coletarFonte(fonte, {
        buscarJson: d.buscarJson, cursor: ef.cursor, limiteConsultas: d.limiteConsultas, pausa: d.pausa, esperar: d.esperar,
        guardarCursor: async (c) => { ef.cursor = c; if (d.aoGuardar) await d.aoGuardar(estado); },
      }), { esperar: d.esperar, tentativas: 3 });
      if (cursor.incompleta) { r.situacao = "parcial"; r.paginas = cursor.paginas.length; continue; }
      // confere se as páginas NOVAS respondem (as já publicadas foram conferidas antes)
      const velha = (catalogo.obras || []).find((o) => o.id === "dp-" + fonte.id);
      const conhecidas = new Set(((velha && velha.paginas) || []).map((p) => p.id));
      const fora = new Set();
      for (const p of cursor.paginas) {
        if (conhecidas.has(p.sha1)) continue;
        let ok = false;
        try { ok = await d.disponivel(p.thumb); } catch (e) {}
        if (!ok) fora.add(p.titulo);
      }
      const { obra, revisao } = N.montarObra(fonte, cursor.paginas, anoAtual, aprovadas, fora);
      const ap = N.aplicarObra(catalogo, obra, agora);
      catalogo = ap.catalogo;
      catalogo.revisao = N.juntarRevisao((catalogo.revisao || []).filter((x) => x.obra !== obra.id), revisao, d.aprovacoes);
      Object.assign(r, { situacao: "ok", mudanca: ap.mudanca, encontradas: cursor.paginas.length, publicadas: obra.paginas.length, revisao: revisao.length });
      Object.assign(ef, { cursor: null, erro: null, ultimaColeta: agora, encontradas: cursor.paginas.length, publicadas: obra.paginas.length, revisao: revisao.length });
    } catch (e) {
      r.situacao = "erro"; r.erro = String((e && e.message) || e).slice(0, 300);
      ef.erro = r.erro; ef.erroEm = agora;
      ef.falhas = (ef.falhas || 0) + 1;
    }
  }
  catalogo.versao = 1;
  // A hora só muda quando o conteúdo muda: senão cada rodada agendada viraria
  // um commit e uma republicação do site sem novidade nenhuma.
  const conteudo = (c) => JSON.stringify([c && c.obras, c && c.revisao]);
  if (!catalogo.geradoEm || conteudo(catalogo) !== conteudo(d.catalogo)) catalogo.geradoEm = agora;
  resumo.rodou = resumo.fontes.some((f) => f.situacao !== "em dia" && f.situacao !== "pausada");
  return { catalogo, estado, resumo };
}

// A reconciliação: o que a fonte tem x o que foi publicado x o que espera revisão.
function relatorio(resumo, catalogo) {
  const l = ["# Relatório da sincronização do acervo", "",
    "Gerado em " + new Date(resumo.inicio).toISOString() + ". Gravado a cada execução por `conectores/rodar.js`.", ""];
  if (resumo.pausado) l.push("**A sincronização está pausada** (`pausado: true` em `conectores/config.json`).", "");
  l.push("| Fonte | Situação | Mudança | Na fonte | Publicadas | Em revisão |", "|---|---|---|---|---|---|");
  for (const f of resumo.fontes) {
    l.push("| " + [f.titulo || f.id, f.situacao + (f.erro ? ": " + f.erro.replace(/\|/g, "/") : ""), f.mudanca || "", f.encontradas != null ? f.encontradas : "", f.publicadas != null ? f.publicadas : "", f.revisao != null ? f.revisao : ""].join(" | ") + " |");
  }
  const obras = catalogo.obras || [];
  l.push("", "No catálogo: " + obras.filter((o) => o.status === "publicada").length + " obras publicadas, " +
    obras.filter((o) => o.status === "indisponivel").length + " indisponíveis, " +
    obras.reduce((s, o) => s + (o.status === "publicada" ? o.paginas.length : 0), 0) + " páginas, " +
    (catalogo.revisao || []).length + " itens esperando revisão.", "",
    "\"Na fonte\" conta só os arquivos que casam com o padrão da fonte; a diferença para \"Publicadas\" está em revisão (com o motivo em `catalogo/acervo.json`, campo `revisao`) ou é imagem repetida (mesmo SHA-1).");
  return l.join("\n") + "\n";
}

async function principal() {
  const args = process.argv.slice(2);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const estado = lerJson(ARQ.estado, { fontes: {} });
  const r = await sincronizar({
    config: lerJson(ARQ.config, { fontes: [] }),
    estado,
    catalogo: lerJson(ARQ.catalogo, null),
    aprovacoes: lerJson(ARQ.aprovacoes, { aprovadas: [] }).aprovadas,
    conectores: CONECTORES,
    buscarJson: commons.buscarJsonReal,
    disponivel: commons.disponivelReal,
    soFonte: val("--fonte"),
    limiteConsultas: val("--limite") ? +val("--limite") : 0,
    forcar: args.includes("--forcar") || !!val("--fonte"),
    aoGuardar: async (e) => gravarJson(ARQ.estado, e),
  });
  gravarJson(ARQ.catalogo, r.catalogo);
  gravarJson(ARQ.estado, r.estado);
  // o relatório é o da última rodada que consultou alguma fonte
  if (r.resumo.rodou || !fs.existsSync(ARQ.relatorio)) fs.writeFileSync(ARQ.relatorio, relatorio(r.resumo, r.catalogo));
  for (const f of r.resumo.fontes) console.log((f.situacao + "").padEnd(8) + " " + f.id + (f.erro ? "  " + f.erro : "") + (f.publicadas != null ? "  publicadas " + f.publicadas + "/" + f.encontradas + ", revisão " + f.revisao + ", " + f.mudanca : ""));
  // erro numa fonte não reprova a execução: o Actions continua agendando, e o
  // relatório mostra o problema. Só reprova se TODAS falharem.
  const rodadas = r.resumo.fontes.filter((f) => f.situacao !== "pausada" && f.situacao !== "em dia");
  if (rodadas.length && rodadas.every((f) => f.situacao === "erro")) process.exit(1);
}

if (require.main === module) principal().catch((e) => { console.error(e); process.exit(1); });
module.exports = { sincronizar, relatorio, gravarJson };
