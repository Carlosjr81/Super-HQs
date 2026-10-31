// Conector do Wikimedia Commons (API documentada: commons.wikimedia.org/w/api.php).
//
// Uma fonte = uma categoria do Commons escolhida pelo dono em config.json.
// Uma consulta só traz os arquivos da categoria com a licença, o SHA-1, o
// tamanho e uma miniatura (generator=categorymembers + prop=imageinfo), 50 por
// vez, seguindo o "continue" da própria API. O cursor é guardado a cada página
// da consulta: interrompida, a coleta recomeça de onde parou.
//
// Nada é copiado: o catálogo guarda o endereço de cada imagem no Commons,
// com o crédito e a licença. Etiqueta da API respeitada: uma consulta por vez,
// User-Agent identificado, maxlag e pausa entre consultas.
"use strict";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "SuperHQs-conector/1.0 (https://github.com/Carlosjr81/Super-HQs)";
const LARGURA_LEITURA = 1280;

function paramsDaConsulta(fonte, cont) {
  const p = {
    action: "query", format: "json", formatversion: "2", maxlag: "5",
    generator: "categorymembers", gcmtitle: fonte.categoria, gcmtype: "file", gcmlimit: "50",
    prop: "imageinfo", iiprop: "url|size|sha1|mime|extmetadata", iiurlwidth: String(LARGURA_LEITURA),
    iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal",
  };
  return Object.assign(p, cont || { continue: "" });
}

function semTags(html) { return String(html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }

// Uma página do resultado da API vira uma página do catálogo.
function paginaDoResultado(r) {
  const ii = r.imageinfo && r.imageinfo[0];
  if (!ii) return null;
  const md = ii.extmetadata || {};
  return {
    titulo: r.title.replace(/^File:/, ""),
    // sem os parâmetros de rastreio e no host que serve a outros sites
    url: ii.url, thumb: String(ii.thumburl || ii.url).split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"),
    largura: ii.thumbwidth || ii.width, altura: ii.thumbheight || ii.height,
    // o tamanho do arquivo original: o Toque para Ler recorta dele
    larguraOriginal: ii.width || 0, alturaOriginal: ii.height || 0,
    sha1: ii.sha1, mime: ii.mime, tamanho: ii.size,
    licenca: semTags(md.LicenseShortName && md.LicenseShortName.value),
    artista: semTags(md.Artist && md.Artist.value).slice(0, 200),
    origemUrl: ii.descriptionurl,
  };
}

// Coleta uma fonte inteira, com checkpoint. `buscarJson(url)` é injetado (o
// teste usa um Commons de mentira); `guardarCursor(cursor)` é chamado depois
// de cada página da consulta.
async function coletarFonte(fonte, opcoes) {
  const o = Object.assign({}, opcoes);
  // valores ausentes (undefined) não podem apagar os padrões
  if (o.pausa == null) o.pausa = 1000;
  if (typeof o.esperar !== "function") o.esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const cursor = o.cursor || { cont: null, paginas: [], consultas: 0 };
  const padrao = fonte.padrao ? new RegExp(fonte.padrao) : null;
  // `alternativas`: outros arquivos da categoria que podem ser a MESMA página
  // em resolução maior (outro escaneamento). Só entram como candidatas: quem
  // decide é o escolherMelhorVersao do núcleo.
  const alternativas = fonte.alternativas ? new RegExp(fonte.alternativas, "i") : null;
  cursor.outros = cursor.outros || [];
  for (;;) {
    const q = new URLSearchParams(paramsDaConsulta(fonte, cursor.cont)).toString();
    const j = await o.buscarJson(API + "?" + q);
    if (j.error) {
      const e = new Error("Commons: " + j.error.code + " " + (j.error.info || ""));
      e.definitivo = j.error.code !== "maxlag";
      throw e;
    }
    const itens = (j.query && j.query.pages) || [];
    for (const r of itens) {
      const p = paginaDoResultado(r);
      if (!p) continue;
      if (padrao && !padrao.test(p.titulo)) {
        if (alternativas && alternativas.test(p.titulo)) p.alternativa = true;
        else {
          // para o relatório: o que mais existe na categoria (e de que tamanho)
          if (cursor.outros.length < 300 && !cursor.outros.some((x) => x.titulo === p.titulo))
            cursor.outros.push({ titulo: p.titulo, largura: p.larguraOriginal, altura: p.alturaOriginal, mime: p.mime });
          continue;
        }
      }
      if (!cursor.paginas.some((x) => x.titulo === p.titulo)) cursor.paginas.push(p);
    }
    cursor.consultas++;
    cursor.cont = j.continue || null;
    if (o.guardarCursor) await o.guardarCursor(cursor);
    if (!cursor.cont) break;
    if (o.limiteConsultas && cursor.consultas >= o.limiteConsultas) { cursor.incompleta = true; break; }
    await o.esperar(o.pausa);
  }
  return cursor;
}

// fetch de verdade, com User-Agent e tempo limite
async function buscarJsonReal(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (r.status === 429 || r.status >= 500) throw new Error("Commons respondeu " + r.status);
  if (!r.ok) { const e = new Error("Commons respondeu " + r.status); e.definitivo = true; throw e; }
  return r.json();
}
async function disponivelReal(url) {
  const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  return r.ok;
}

module.exports = { coletarFonte, paginaDoResultado, paramsDaConsulta, buscarJsonReal, disponivelReal, UA, API };
