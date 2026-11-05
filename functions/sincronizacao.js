// Percurso paginado, com ponto de retomada salvo depois de cada item.
// As operações externas são injetadas para testar falhas sem Firebase/Drive.
"use strict";
const I = require("./indexador");

function novoEstado(raiz) {
  return { raiz, fila: [{ id: raiz, nome: "" }], vistos: [raiz], atual: null, completo: false,
    resumo: { total: 0, arquivos: 0, pastas: 0, atalhos: 0, outros: 0, publicadas: 0, pendentes: 0, duplicados: 0, erros: 0, ignorados: 0 }, detalhes: [] };
}

async function processarLote({ raiz, estado, listar, processar, salvar, limite = 30, tempoMs = 180000 }) {
  const e = estado || novoEstado(raiz);
  if (e.raiz !== raiz) throw Error("A pasta mudou; reinicie a indexação.");
  const inicio = Date.now();
  let feitos = 0;
  while (!e.completo && feitos < limite && Date.now() - inicio < tempoMs) {
    if (!e.atual) {
      const pasta = e.fila.shift();
      if (!pasta) { e.completo = true; await salvar(e); break; }
      e.atual = { pasta, pagina: "", itens: null, proxima: "" };
    }
    const a = e.atual;
    if (!a.itens) {
      // Uma falha de listagem interrompe sem perder o cursor nem declarar fim.
      const r = await listar(a.pasta.id, a.pagina);
      a.itens = r.files || [];
      a.proxima = r.nextPageToken || "";
      await salvar(e);
    }
    if (!a.itens.length) {
      if (a.proxima) { a.pagina = a.proxima; a.itens = null; a.proxima = ""; }
      else e.atual = null;
      await salvar(e);
      continue;
    }
    const item = a.itens[0];
    const classe = I.classificarItem(item);
    let situacao = "", motivo = "";
    if (I.ignorarItem(item)) { situacao = "ignorado"; motivo = "controle ou quarentena"; }
    else if (classe === "pasta") {
      if (!e.vistos.includes(item.id)) {
        if (e.vistos.length >= 4000) throw Error("Limite de pastas por execução atingido; divida o acervo em raízes menores.");
        e.vistos.push(item.id); e.fila.push({ id: item.id, nome: item.name });
      }
    } else if (classe === "arquivo") {
      try {
        const r = await processar(item, a.pasta);
        situacao = r.situacao; motivo = r.motivo || "";
      } catch (err) { situacao = "erro"; motivo = String(err.message || err); }
    } else if (classe === "atalho") motivo = "atalho não é cópia; destino externo não importado";
    else motivo = "formato não suportado ou arquivo administrativo";
    e.resumo.total++;
    if (situacao === "ignorado") e.resumo.ignorados++;
    else {
      const campo = { pasta: "pastas", arquivo: "arquivos", atalho: "atalhos", outro: "outros" }[classe];
      e.resumo[campo]++;
      const campoSituacao = { publicada: "publicadas", pendente: "pendentes", duplicado: "duplicados", erro: "erros" }[situacao];
      if (campoSituacao) e.resumo[campoSituacao]++;
    }
    e.detalhes.push({ nome: String(item.name || "").slice(0, 300), classe, situacao, motivo: motivo.slice(0, 500) });
    e.detalhes = e.detalhes.slice(-50);
    a.itens.shift(); feitos++;
    // Se a gravação do cursor falhar, a ficha já gravada será reencontrada por
    // SHA no próximo lote: não apaga dados nem cria uma segunda edição.
    await salvar(e);
  }
  return e;
}

// Conferir a localização ATUAL também no download: mover um arquivo para fora
// da raiz ou para a quarentena revoga sua entrega, mesmo com ficha antiga.
async function arquivoNaRaiz(fileId, raiz, obter) {
  const fila = [fileId], vistos = new Set();
  let arquivo = null;
  while (fila.length && vistos.size < 100) {
    const id = fila.shift();
    if (vistos.has(id)) continue;
    vistos.add(id);
    const m = await obter(id);
    if (!m || m.trashed || I.ignorarItem(m) || m.mimeType === I.ATALHO) continue;
    if (id === fileId) arquivo = m;
    if (id === raiz) return arquivo && I.classificarItem(arquivo) === "arquivo" ? arquivo : null;
    fila.push(...(m.parents || []));
  }
  return null;
}
// Cada resposta fica abaixo do limite de streaming de 10 MB das Functions.
// A edição inteira só é aceita pelo app depois de conferir tamanho e SHA-256.
function intervaloDoDownload(cabecalho, tamanho, maximo = 8 * 1048576) {
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return null;
  if (!cabecalho) return tamanho <= maximo ? { inicio: 0, fim: tamanho - 1, parcial: false } : null;
  const m = /^bytes=(\d+)-(\d+)$/.exec(cabecalho);
  if (!m) return null;
  const inicio = Number(m[1]), fim = Number(m[2]);
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fim) || inicio > fim || fim >= tamanho || fim - inicio + 1 > maximo) return null;
  return { inicio, fim, parcial: true };
}
module.exports = { novoEstado, processarLote, arquivoNaRaiz, intervaloDoDownload };
