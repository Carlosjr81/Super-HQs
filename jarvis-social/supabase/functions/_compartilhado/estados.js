// Máquina de estados da ENTREGA de um post (separada do estado editorial e da
// produção do conteúdo). Toda transição gera um evento com data, versão e motivo.
export const ESTADOS = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando aprovação",
  scheduled: "Agendado (no Jarvis)",
  paused: "Pausado",
  preparing: "Preparando envio",
  processing: "Instagram processando",
  publishing: "Publicando",
  published: "Publicado",
  retry_wait: "Nova tentativa programada",
  failed: "Falhou",
  cancelled: "Cancelado",
  needs_reconciliation: "Conferindo resultado",
};

const T = {
  draft: ["scheduled", "awaiting_approval", "cancelled", "draft"],
  awaiting_approval: ["scheduled", "draft", "cancelled", "awaiting_approval"],
  scheduled: ["scheduled", "paused", "cancelled", "preparing", "draft", "awaiting_approval", "failed", "retry_wait"],
  paused: ["scheduled", "cancelled", "paused"],
  preparing: ["processing", "failed", "retry_wait", "scheduled", "paused", "cancelled"],
  processing: ["processing", "publishing", "failed", "retry_wait", "needs_reconciliation", "cancelled", "paused"],
  publishing: ["published", "needs_reconciliation", "failed", "retry_wait"],
  retry_wait: ["preparing", "processing", "cancelled", "paused", "failed", "scheduled", "draft"],
  failed: ["scheduled", "cancelled", "draft"],
  needs_reconciliation: ["published", "failed", "processing", "cancelled"],
  published: [],
  cancelled: [],
};

// Estados em que o dono pode editar, pausar ou cancelar sem risco: ainda não
// pedimos a publicação à rede.
export const EDITAVEIS = ["draft", "awaiting_approval", "scheduled", "paused", "failed", "retry_wait"];
export const CANCELAVEIS = [...EDITAVEIS, "preparing", "processing", "needs_reconciliation"];
export const FINAIS = ["published", "cancelled"];

export function podeIr(de, para) { return (T[de] || []).includes(para); }

export class ErroEstado extends Error {
  constructor(de, para) { super(`Não dá para ir de "${ESTADOS[de] || de}" para "${ESTADOS[para] || para}".`); this.codigo = "transicao_invalida"; this.de = de; this.para = para; }
}

// Devolve { mudancas, evento } para gravar. `subirVersao` invalida jobs antigos.
export function transicao(post, para, { motivo = "", agora, ator = "sistema", subirVersao = false, extra = {} } = {}) {
  if (!podeIr(post.estado, para)) throw new ErroEstado(post.estado, para);
  const versao = (post.versao || 1) + (subirVersao ? 1 : 0);
  return {
    mudancas: { ...extra, estado: para, versao, atualizado_em: agora },
    evento: {
      post_id: post.id, org_id: post.org_id, de: post.estado, para, versao, motivo, ator, criado_em: agora,
    },
  };
}
