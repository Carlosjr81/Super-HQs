// Autorização do acervo privado, NO SERVIDOR. Espelha firestore.rules /
// storage.rules e planoDaConta/acervoLiberadoDaConta do index.html: mudou uma,
// mude as outras. Funções puras, sem rede, para o entregador (index.js) e os
// testes. Ocultar na interface não basta: é aqui que a permissão é aplicada.
"use strict";

// A cobrança está ligada? (config/acesso.cobranca)
function cobrancaLigada(cfg) { return !!(cfg && cfg.cobranca); }

// Ainda no período de teste (quando a cobrança está ligada).
function emTeste(conta, agora, cfg) {
  const dias = cfg && cfg.testeDias != null ? cfg.testeDias : 7;
  if (!(dias > 0)) return false;
  const fim = dias * 86400000 + 86400000; // vale até o fim do dia
  return agora < ((conta && conta.criadoEm) || 0) + fim
    || agora < ((cfg && cfg.cobrancaDesde) || 0) + fim;
}

// A conta tem plano para ler (cortesia, vitalício, pago ou em teste)?
function temPlano(conta, agora, cfg) {
  if (!cobrancaLigada(cfg)) return true;
  if (!conta) return false;
  if (conta.cortesia && (!(conta.cortesiaAte > 0) || conta.cortesiaAte > agora)) return true;
  if (conta.vitalicio) return true;
  if ((conta.pagoAte || 0) > agora) return true;
  return emTeste(conta, agora, cfg);
}

// Liberado, dentro do prazo e com plano.
function contaLiberada(conta, agora, cfg) {
  if (!conta || conta.status !== "liberado") return false;
  if (conta.ate && conta.ate > 0 && agora >= conta.ate) return false; // vencido
  return temPlano(conta, agora, cfg);
}

// A conta pode ver esta coleção? acervoTudo ausente/true = acervo inteiro.
function podeLerColecao(conta, colecao) {
  if (!conta) return false;
  if (conta.acervoTudo === false) return Array.isArray(conta.colecoes) && conta.colecoes.indexOf(colecao) >= 0;
  return true;
}

// É o dono (e-mail confirmado)? O dono lê tudo, inclusive pendentes.
function ehDono(token, emailDono) {
  return !!token && token.email_verified === true
    && String(token.email || "").toLowerCase() === String(emailDono || "").toLowerCase();
}

// A decisão final do entregador: esta conta pode baixar ESTA edição agora?
// `edicao`: a ficha do Firestore (status, colecao). `token`: o ID token já
// verificado. Devolve { pode, motivo }.
function podeBaixarEdicao(token, conta, edicao, agora, cfg, emailDono) {
  if (!edicao || !edicao.caminho) return { pode: false, motivo: "edição não cadastrada" };
  if (ehDono(token, emailDono)) return { pode: true, motivo: "dono" };
  if (edicao.status !== "publicada") return { pode: false, motivo: "edição não publicada" };
  if (!contaLiberada(conta, agora, cfg)) return { pode: false, motivo: "conta sem acesso (pendente, bloqueada, vencida ou sem plano)" };
  if (!podeLerColecao(conta, edicao.colecao)) return { pode: false, motivo: "coleção não liberada para esta conta" };
  return { pode: true, motivo: "ok" };
}

module.exports = { cobrancaLigada, emTeste, temPlano, contaLiberada, podeLerColecao, ehDono, podeBaixarEdicao };
