// Política de frequência: quantos vídeos por dia, em que dias e horários.
// Não existe teto comercial: a quantidade é a que o dono configurar. Os
// limites que existem são os da rede (cota oficial, consultada na hora) e os
// técnicos (LIMITE_TECNICO_POR_DIA, proteção contra erro de digitação).
import { localParaUtc, partesLocais, somarDias, diaSemanaDaData, FUSO_PADRAO, ErroHorario } from "./tempo.js";

export const LIMITE_TECNICO_POR_DIA = 48;

export function politicaPadrao(fuso = FUSO_PADRAO) {
  return { horarios: ["10:00"], dias: [1, 2, 3, 4, 5, 6, 7], inicio: null, pausadaAte: null, fuso };
}

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizarHora(h) {
  const m = /^(\d{1,2})(?::|h)?(\d{2})?$/.exec(String(h).trim());
  if (!m) return null;
  const t = `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
  return RE_HORA.test(t) ? t : null;
}

export function validarPolitica(p) {
  const erros = [];
  const horarios = [...new Set((p.horarios || []).map(normalizarHora))];
  if (horarios.includes(null)) erros.push("Há um horário inválido (use HH:MM).");
  if (!horarios.length) erros.push("Informe ao menos um horário.");
  if (horarios.length > LIMITE_TECNICO_POR_DIA) erros.push(`Mais de ${LIMITE_TECNICO_POR_DIA} horários por dia: limite técnico de proteção.`);
  const dias = [...new Set(p.dias || [])].filter((d) => d >= 1 && d <= 7).sort();
  if (!dias.length) erros.push("Escolha ao menos um dia da semana.");
  if (erros.length) { const e = new Error(erros.join(" ")); e.codigo = "politica_invalida"; e.erros = erros; throw e; }
  return {
    horarios: horarios.sort(), dias,
    inicio: p.inicio || null, pausadaAte: p.pausadaAte || null,
    fuso: p.fuso || FUSO_PADRAO,
  };
}

// Horários (ISO UTC) da política entre dois instantes, em ordem.
export function gerarSlots(politica, deIso, ateIso, maximo = 2000) {
  const p = validarPolitica(politica);
  const de = Date.parse(deIso), ate = Date.parse(ateIso);
  let data = partesLocais(new Date(de), p.fuso).data;
  if (p.inicio && p.inicio > data) data = p.inicio;
  const fim = partesLocais(new Date(ate), p.fuso).data;
  const saida = [];
  for (let i = 0; data <= fim && i < 3700 && saida.length < maximo; i++, data = somarDias(data, 1)) {
    if (p.pausadaAte && data <= p.pausadaAte) continue;
    if (!p.dias.includes(diaSemanaDaData(data))) continue;
    for (const h of p.horarios) {
      let iso;
      try { iso = localParaUtc(data, h, p.fuso); } catch (e) { if (e instanceof ErroHorario) continue; throw e; }
      const ms = Date.parse(iso);
      if (ms > de && ms <= ate) saida.push(iso);
    }
  }
  return saida;
}

// Próximo horário livre da política depois de `agora` (para "coloque na fila").
export function proximoSlotLivre(politica, ocupadosIso, agoraIso, folgaMin = 5) {
  const ocupados = new Set(ocupadosIso.map((x) => new Date(x).toISOString()));
  const de = new Date(Date.parse(agoraIso) + folgaMin * 60e3).toISOString();
  let ini = de;
  for (let janela = 0; janela < 12; janela++) {
    const ate = new Date(Date.parse(ini) + 31 * 864e5).toISOString();
    const livre = gerarSlots(politica, ini, ate).find((s) => !ocupados.has(s));
    if (livre) return livre;
    ini = ate;
  }
  return null;
}

// Prévia do que muda nos posts futuros ao trocar a política. Regra explícita:
//  - só mexe em posts `scheduled`/`paused` cujo horário veio da frequência
//    (origem_horario = "frequencia") e ainda não começaram a ser enviados;
//  - horário escolhido à mão (origem "manual") nunca é mudado;
//  - mantém a ordem da fila; posts publicados/cancelados não entram;
//  - nada é apagado nem duplicado: cada post recebe exatamente um horário novo.
export function preverMudanca(posts, politicaNova, agoraIso) {
  const p = validarPolitica(politicaNova);
  const moveis = posts
    .filter((x) => ["scheduled", "paused"].includes(x.estado) && x.origem_horario === "frequencia" && !x.container_id)
    .filter((x) => x.agendado_utc && x.agendado_utc > agoraIso)
    .sort((a, b) => a.agendado_utc.localeCompare(b.agendado_utc) || String(a.id).localeCompare(String(b.id)));
  const fixos = new Set(posts
    .filter((x) => !moveis.includes(x) && x.agendado_utc && !["cancelled", "failed", "draft"].includes(x.estado))
    .map((x) => new Date(x.agendado_utc).toISOString()));
  const mudancas = [];
  let cursor = agoraIso;
  for (const post of moveis) {
    let novo = proximoSlotLivre(p, [...fixos], cursor, 0);
    if (!novo) { mudancas.push({ post_id: post.id, de: post.agendado_utc, para: null, motivo: "sem horário livre em 1 ano" }); continue; }
    fixos.add(novo);
    cursor = novo;
    mudancas.push({ post_id: post.id, de: post.agendado_utc, para: novo });
  }
  return { politica: p, mudancas: mudancas.filter((m) => m.de !== m.para), afetados: moveis.length };
}
