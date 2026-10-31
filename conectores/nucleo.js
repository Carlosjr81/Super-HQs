// O núcleo da sincronização do acervo: contas puras, sem rede e sem disco,
// para o teste exercitar tudo com fontes de mentira.
//
// Princípios (do pedido do dono e do prompt do app):
// - Só publica o que tem direito de republicação comprovado; o resto vai para
//   revisão, nunca é descartado.
// - Idempotente: rodar duas vezes com a mesma fonte não muda nada.
// - Falha da fonte nunca apaga o que já foi publicado: obra que some da fonte
//   fica "indisponível", com o progresso de quem lia preservado (o id não muda).
"use strict";

// Domínio público no Brasil (Lei 9.610/98, art. 41): 70 anos contados de 1º
// de janeiro do ano seguinte à morte do autor. Quem morreu em 1934 está em
// domínio público desde 1º/1/2005 (1934 + 71).
function dominioPublicoNoBrasil(autorFalecidoEm, anoAtual) {
  return Number.isInteger(autorFalecidoEm) && autorFalecidoEm + 71 <= anoAtual;
}

// A licença que a fonte declara para o arquivo. "Public domain" no Commons
// costuma querer dizer "nos EUA": por isso ela sozinha não basta, e a morte do
// autor (informada pelo dono na configuração da fonte) também é exigida.
function licencaLivre(nome) {
  const n = String(nome || "").toLowerCase();
  return /public domain|^pd\b|cc0/.test(n);
}

// A decisão de direitos de UMA página. Devolve { publicar, motivo }.
function decidirDireitos(pagina, fonte, anoAtual) {
  if (!fonte || !Number.isInteger(fonte.autorFalecidoEm)) return { publicar: false, motivo: "a fonte não informa o ano de morte do autor" };
  if (!dominioPublicoNoBrasil(fonte.autorFalecidoEm, anoAtual)) return { publicar: false, motivo: "autor morto há menos de 70 anos: ainda protegido no Brasil" };
  if (!licencaLivre(pagina.licenca)) return { publicar: false, motivo: "a fonte não declara domínio público para este arquivo (" + (pagina.licenca || "sem licença") + ")" };
  if (!/^image\/(jpeg|png|webp|gif)$/.test(pagina.mime || "")) return { publicar: false, motivo: "não é imagem (" + (pagina.mime || "?") + ")" };
  if (!pagina.sha1 || !pagina.url) return { publicar: false, motivo: "sem hash ou sem endereço do arquivo" };
  return { publicar: true, motivo: "domínio público no Brasil (autor †" + fonte.autorFalecidoEm + ") e livre na fonte" };
}

// Ordem natural, igual à da estante do app: "2" antes de "10".
const ordemNatural = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" }).compare;

// Monta a obra (uma edição) a partir das páginas coletadas de uma fonte.
// O id interno é estável ("dp-" + id da fonte): o progresso de leitura e os
// favoritos de cada pessoa ficam presos a ele, e ele nunca muda.
// `aprovadas`: chaves "obra|página" que o dono aprovou à mão na revisão
// (conectores/aprovacoes.json) depois de conferir os direitos por fora.
// `indisponiveis`: páginas cujo arquivo não respondeu na conferência.
function montarObra(fonte, paginas, anoAtual, aprovadas, indisponiveis) {
  const aceitas = [], revisao = [];
  const ok = aprovadas || new Set(), fora = indisponiveis || new Set();
  for (const p of paginas) {
    const chave = "dp-" + fonte.id + "|" + p.titulo;
    let d = decidirDireitos(p, fonte, anoAtual);
    if (!d.publicar && ok.has(chave) && p.url && p.sha1) d = { publicar: true };
    if (d.publicar && fora.has(p.titulo)) d = { publicar: false, motivo: "o arquivo não respondeu na conferência" };
    if (d.publicar) aceitas.push(p);
    else revisao.push({ obra: "dp-" + fonte.id, pagina: p.titulo, origemUrl: p.origemUrl, motivo: d.motivo });
  }
  // sem duplicar: a mesma imagem (mesmo hash) só entra uma vez na obra
  const vistas = new Set();
  const unicas = aceitas.filter((p) => (vistas.has(p.sha1) ? false : (vistas.add(p.sha1), true)));
  unicas.sort((a, b) => ordemNatural(a.titulo, b.titulo));
  return {
    obra: {
      id: "dp-" + fonte.id,
      fonte: fonte.tipo,
      origem: { id: fonte.categoria, url: fonte.origemUrl },
      titulo: fonte.titulo,
      colecao: fonte.colecao || "",
      autor: fonte.autor || "",
      ano: fonte.ano || null,
      categoria: fonte.categoriaApp || "hq",
      idioma: fonte.idioma || "",
      direitos: {
        situacao: "dominio-publico",
        base: "Lei 9.610/98, art. 41: autor falecido em " + fonte.autorFalecidoEm,
        autor: fonte.autor || "",
        autorFalecidoEm: fonte.autorFalecidoEm,
      },
      paginas: unicas.map((p) => ({ id: p.sha1, titulo: p.titulo, url: p.url, thumb: p.thumb, largura: p.largura, altura: p.altura, licenca: p.licenca, origemUrl: p.origemUrl })),
      versao: unicas.map((p) => p.sha1).join(",").length ? hashTexto(unicas.map((p) => p.sha1).join(",")) : "",
      status: unicas.length ? "publicada" : "sem-paginas",
    },
    revisao: revisao,
  };
}

// Hash curto e estável de um texto (FNV-1a 32 bits): basta para saber se a
// lista de páginas de uma obra mudou. A integridade de cada página é o SHA-1
// que a própria fonte informa.
function hashTexto(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// Junta o catálogo antigo com o que acabou de ser coletado de UMA fonte.
// - obra nova: entra; obra com versão diferente: atualiza; igual: nada muda.
// - obra que não veio porque a fonte falhou: fica como estava.
// - obra cuja fonte foi consultada com sucesso e não tem mais páginas: vira
//   "indisponível" (não some: o progresso de quem lia continua valendo).
function aplicarObra(catalogo, obraNova, agora) {
  const obras = (catalogo.obras || []).slice();
  const i = obras.findIndex((o) => o.id === obraNova.id);
  if (i < 0) {
    if (obraNova.status !== "publicada") return { catalogo, mudanca: "nada" };
    obras.push(Object.assign({}, obraNova, { publicadaEm: agora, atualizadaEm: agora }));
    return { catalogo: Object.assign({}, catalogo, { obras }), mudanca: "nova" };
  }
  const velha = obras[i];
  if (obraNova.status !== "publicada") {
    if (velha.status === "indisponivel") return { catalogo, mudanca: "nada" };
    obras[i] = Object.assign({}, velha, { status: "indisponivel", atualizadaEm: agora });
    return { catalogo: Object.assign({}, catalogo, { obras }), mudanca: "indisponivel" };
  }
  if (velha.versao === obraNova.versao && velha.status === "publicada") return { catalogo, mudanca: "nada" };
  // as alterações editoriais do dono (campo "editado") vencem a fonte
  const editado = velha.editado || {};
  obras[i] = Object.assign({}, obraNova, editado, { editado, publicadaEm: velha.publicadaEm, atualizadaEm: agora });
  return { catalogo: Object.assign({}, catalogo, { obras }), mudanca: velha.status === "indisponivel" ? "voltou" : "alterada" };
}

// A fila de revisão: sem repetir o mesmo item a cada rodada.
function juntarRevisao(atual, novos, aprovacoes) {
  const aprovadas = new Set(aprovacoes || []);
  const chave = (r) => r.obra + "|" + r.pagina;
  const mapa = new Map((atual || []).map((r) => [chave(r), r]));
  for (const r of novos) if (!mapa.has(chave(r))) mapa.set(chave(r), r);
  return Array.from(mapa.values()).filter((r) => !aprovadas.has(chave(r)));
}

// Tentativas limitadas com espera progressiva (1 s, 2 s, 4 s... até o teto).
async function comTentativas(fazer, opcoes) {
  const o = Object.assign({ tentativas: 4, base: 1000, teto: 30000 }, opcoes);
  if (typeof o.esperar !== "function") o.esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  let ultimo;
  for (let t = 0; t < o.tentativas; t++) {
    try { return await fazer(t); }
    catch (e) {
      ultimo = e;
      if (e && e.definitivo) break;
      if (t < o.tentativas - 1) await o.esperar(Math.min(o.teto, o.base * Math.pow(2, t)));
    }
  }
  throw ultimo;
}

module.exports = { dominioPublicoNoBrasil, licencaLivre, decidirDireitos, montarObra, aplicarObra, juntarRevisao, comTentativas, hashTexto, ordemNatural };
