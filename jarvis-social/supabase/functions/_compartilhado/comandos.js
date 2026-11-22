// Comandos em português ("Programe este vídeo amanhã às 10h"). Só INTERPRETA:
// quem executa é a API, com as mesmas regras do painel. Datas relativas são
// resolvidas no instante do pedido e no fuso do espaço (nunca no da máquina).
import { partesLocais, somarDias, diaSemanaDaData } from "./tempo.js";

const NUM = { um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const DIAS = { segunda: 1, "terça": 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, "sábado": 6, sabado: 6, domingo: 7 };

function semAcento(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

export function extrairHoras(texto) {
  const t = semAcento(texto.toLowerCase());
  const horas = [];
  const re = /(?:\b(?:as|a|ao|para)\s+)?\b(\d{1,2})(?:\s*(?:h|:|horas?)\s*(\d{2})?|\s*h\b)(?!\s*\/)/g;
  let m;
  while ((m = re.exec(t))) {
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h <= 23 && mi <= 59) horas.push(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
  }
  if (/\bmeio[- ]dia\b/.test(t)) horas.push("12:00");
  if (/\bmeia[- ]noite\b/.test(t)) horas.push("00:00");
  // "às 18" sem "h"
  const re2 = /\bas\s+(\d{1,2})\b(?!\s*(?:h|:|\/|horas?))/g;
  while ((m = re2.exec(t))) if (+m[1] <= 23) horas.push(`${m[1].padStart(2, "0")}:00`);
  return [...new Set(horas)];
}

// Data local AAAA-MM-DD a partir do texto; null se não houver data no texto.
export function extrairData(texto, agoraIso, fuso) {
  const t = semAcento(texto.toLowerCase());
  const hoje = partesLocais(new Date(agoraIso), fuso).data;
  if (/\bdepois de amanha\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bhoje\b/.test(t)) return hoje;
  let m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (m) {
    let ano = m[3] ? +m[3] : +hoje.slice(0, 4);
    if (ano < 100) ano += 2000;
    let d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!m[3] && d < hoje) d = `${ano + 1}${d.slice(4)}`;
    return d;
  }
  m = /\bdia\s+(\d{1,2})\b/.exec(t);
  if (m) {
    let [a, me] = hoje.split("-").map(Number);
    let d = `${a}-${String(me).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (d < hoje) { me++; if (me > 12) { me = 1; a++; } d = `${a}-${String(me).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return d;
  }
  for (const [nome, n] of Object.entries(DIAS)) {
    if (new RegExp(`\\b${semAcento(nome)}(?:-feira)?\\b`).test(t)) {
      const hojeDs = diaSemanaDaData(hoje);
      let delta = (n - hojeDs + 7) % 7;
      if (delta === 0) delta = 7; // "na sexta" dito numa sexta = a próxima
      return somarDias(hoje, delta);
    }
  }
  return null;
}

function numeroNoTexto(t) {
  const m = /\b(\d{1,2})\s+(?:videos?|posts?|reels?|publicac)/.exec(t);
  if (m) return +m[1];
  for (const [p, n] of Object.entries(NUM)) {
    if (new RegExp(`\\b${semAcento(p)}\\s+(?:videos?|posts?|reels?|publicac)`).test(t)) return n;
  }
  if (/\bum por dia\b|\buma por dia\b/.test(t)) return 1;
  return null;
}

// Devolve { acao, ...parâmetros } ou { acao: "desconhecido", ajuda }.
// Quando faltar algo essencial: { acao, falta: "hora" | "data" | ... , pergunta }.
export function interpretar(texto, agoraIso, fuso) {
  const t = semAcento(String(texto || "").toLowerCase()).trim();
  if (!t) return { acao: "desconhecido", ajuda: AJUDA };

  if (/\b(motivo|por que|porque)\b.*\b(falha|falhou|erro)\b|\bfalhas?\b.*\bmostr/.test(t) || /^mostre? (as )?falhas/.test(t)) {
    return { acao: "listar_falhas" };
  }
  if (/\b(pause|pausar|pausa|suspenda|segure)\b/.test(t)) return { acao: "pausar_fila" };
  if (/\b(retome|retomar|despause|volte a publicar|reative)\b/.test(t)) return { acao: "retomar_fila" };

  if (/\bpor dia\b|\bfrequencia\b|\bpor semana\b/.test(t) && /\b(altere|mude|mudar|alterar|passe|quero|defina|coloque|troque)\b|^\d|\b(um|uma|dois|duas|tres|quatro|cinco|seis)\b/.test(t)) {
    const quantidade = numeroNoTexto(t);
    const horarios = extrairHoras(texto);
    if (!quantidade && !horarios.length) return { acao: "frequencia", falta: "quantidade", pergunta: "Quantos vídeos por dia?" };
    return { acao: "frequencia", quantidade: quantidade || horarios.length, horarios };
  }

  if (/\b(agenda|programac|agendad|calendario|fila)\b/.test(t) && /\b(mostr|ver|veja|qual|quais|liste|listar|minha|da semana|de hoje|de amanha)\b/.test(t)) {
    const hoje = partesLocais(new Date(agoraIso), fuso).data;
    if (/\bhoje\b/.test(t)) return { acao: "listar_agenda", de: hoje, ate: hoje };
    if (/\bamanha\b/.test(t)) { const a = somarDias(hoje, 1); return { acao: "listar_agenda", de: a, ate: a }; }
    if (/\bmes\b/.test(t)) return { acao: "listar_agenda", de: hoje, ate: somarDias(hoje, 30) };
    return { acao: "listar_agenda", de: hoje, ate: somarDias(hoje, 6) };
  }

  if (/\b(cancele|cancelar|cancela|apague)\b/.test(t)) return { acao: "cancelar" };

  if (/\b(programe|programar|agende|agendar|poste|postar|publique|publicar|marque|coloque)\b/.test(t)) {
    const data = extrairData(texto, agoraIso, fuso);
    const horas = extrairHoras(texto);
    const naFila = /\bna fila\b|\bproximo horario\b|\bproximo espaco\b/.test(t);
    if (naFila) return { acao: "agendar", proximoLivre: true };
    if (!data && !horas.length) return { acao: "agendar", falta: "data_hora", pergunta: "Para quando? (ex.: amanhã às 10h, ou \"no próximo horário da fila\")" };
    if (!horas.length) return { acao: "agendar", data, falta: "hora", pergunta: `Em que horário de ${data.split("-").reverse().join("/")}?` };
    const dataFinal = data || partesLocais(new Date(agoraIso), fuso).data;
    return { acao: "agendar", data: dataFinal, hora: horas[0] };
  }
  return { acao: "desconhecido", ajuda: AJUDA };
}

export const AJUDA = [
  "Programe este vídeo amanhã às 10h",
  "Coloque este vídeo no próximo horário da fila",
  "Mostre minha agenda da semana",
  "Altere para dois vídeos por dia, às 10h e às 18h",
  "Pause as próximas publicações / Retome as publicações",
  "Mostre o motivo das falhas",
];
