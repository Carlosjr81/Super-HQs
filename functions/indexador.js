// O núcleo do indexador do acervo privado no Drive. Funções puras, sem rede:
// o index.js injeta a listagem do Drive e o download (que calcula SHA-256 e
// conta páginas). Aqui ficam a classificação, a decisão de direitos, a
// montagem da ficha, a deduplicação e o relatório — testáveis sem Drive.
// Mesmo padrão de conectores/nucleo.js.
"use strict";

const PASTA = "application/vnd.google-apps.folder";
const ATALHO = "application/vnd.google-apps.shortcut";

// O que é este item do Drive: pasta, atalho, arquivo (pdf/cbz/zip) ou outro.
// Atalho NÃO é edição e não deve ser seguido para fora da pasta designada.
function classificarItem(item) {
  if (!item || !item.mimeType) return "outro";
  if (item.mimeType === PASTA) return "pasta";
  if (item.mimeType === ATALHO) return "atalho";
  return tipoDaEdicao(item.name, item.mimeType) ? "arquivo" : "outro";
}

// Tipo de edição pelo nome e/ou mime. CBR/RAR não entra (precisa converter).
function tipoDaEdicao(nome, mime) {
  const ext = String(nome || "").split(".").pop().toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "cbz" || ext === "zip" || mime === "application/zip") return "zip";
  return null;
}

// O registro de direitos está completo? (titular, licença, origem)
function direitosOk(d) {
  return !!d && ["titular", "licenca", "origem"].every((k) => typeof d[k] === "string" && d[k].trim().length > 0);
}

// Pastas administrativas e arquivos explicitamente separados não são edições.
function ignorarItem(item) {
  const nome = String(item && item.name || "").trim();
  return /^(00_Controle|90_Quarentena)$/i.test(nome)
    || /^INCOMPLETO_NAO_IMPORTAR_/i.test(nome);
}

function tipoPelosBytes(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b
    && ((buf[2] === 3 && buf[3] === 4) || (buf[2] === 5 && buf[3] === 6))) return "zip";
  return null;
}

// Monta a ficha do Firestore (coleção `acervo`) a partir de um arquivo já
// baixado e conferido pelo index.js. `arq`: { driveId, nome, tipo, sha256,
// paginas, tamanho, colecao }. `direitos`: { titular, licenca, origem } da
// pasta/planilha do dono. Devolve { ficha } ou { revisao, motivo } — nunca
// inventa direito nem publica sem registro.
function montarFicha(arq, direitos, agora) {
  if (!arq || !arq.driveId) return { revisao: true, motivo: "item sem id do Drive" };
  if (!["pdf", "zip"].includes(arq.tipo)) return { revisao: true, motivo: "não é PDF nem CBZ" };
  if (!/^[a-f0-9]{64}$/.test(String(arq.sha256 || ""))) return { revisao: true, motivo: "sem SHA-256" };
  if (!Number.isSafeInteger(arq.paginas) || arq.paginas <= 0) return { revisao: true, motivo: "sem contagem de páginas" };
  if (!Number.isSafeInteger(arq.tamanho) || arq.tamanho <= 0) return { revisao: true, motivo: "sem tamanho verificado" };
  if (!direitosOk(direitos)) return { revisao: true, motivo: "sem registro de direitos (titular, licença, origem)" };
  const txt = (v, n) => (typeof v === "string" ? v.slice(0, n || 500) : "");
  return {
    ficha: {
      sha256: arq.sha256,
      titulo: txt(arq.titulo) || txt(arq.nome).replace(/\.[^.]+$/, "") || "Sem título",
      nomeOriginal: txt(arq.nome),
      tipo: arq.tipo,
      paginas: arq.paginas,
      tamanho: arq.tamanho || 0,
      colecao: txt(arq.colecao, 200),
      categoria: ["hq", "manga", "manhwa", "livro"].indexOf(arq.categoria) >= 0 ? arq.categoria : "hq",
      status: "publicada",
      // o arquivo é resolvido pelo servidor a partir daqui; o cliente nunca
      // manda um driveId
      provedor: "drive",
      arquivoDrive: { id: arq.driveId, pasta: txt(arq.pastaId, 80) },
      caminho: "drive/" + arq.driveId,
      titular: txt(direitos.titular),
      licenca: txt(direitos.licenca),
      origem: txt(direitos.origem),
      chaveAcesso: "publicada|" + txt(arq.colecao, 200),
      enviadoEm: agora || 0,
    },
  };
}

// Deduplica por SHA-256: a mesma obra (mesmos bytes) entra uma vez.
function dedupPorSha(fichas) {
  const visto = new Set();
  return fichas.filter((f) => (f && f.sha256 && !visto.has(f.sha256) ? (visto.add(f.sha256), true) : false));
}

// O relatório da indexação, cada item numa situação só.
function resumoIndexacao(linhas) {
  const r = { total: linhas.length, arquivos: 0, pastas: 0, atalhos: 0, outros: 0, publicadas: 0, pendentes: 0, duplicados: 0, erros: 0 };
  for (const l of linhas) {
    if (l.classe === "pasta") r.pastas++;
    else if (l.classe === "atalho") r.atalhos++;
    else if (l.classe === "outro") r.outros++;
    else if (l.classe === "arquivo") {
      r.arquivos++;
      if (l.situacao === "publicada") r.publicadas++;
      else if (l.situacao === "duplicado") r.duplicados++;
      else if (l.situacao === "erro") r.erros++;
      else if (l.situacao === "pendente") r.pendentes++;
    }
  }
  return r;
}

module.exports = { PASTA, ATALHO, classificarItem, tipoDaEdicao, direitosOk, ignorarItem, tipoPelosBytes, montarFicha, dedupPorSha, resumoIndexacao };
