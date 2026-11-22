// Datas e fusos. Regra: o banco guarda instantes em UTC (ISO 8601) e o fuso
// IANA de origem ao lado; a tela mostra no fuso do espaço (padrão
// America/Sao_Paulo). Nada aqui usa o fuso da máquina: tudo recebe o fuso.
export const FUSO_PADRAO = "America/Sao_Paulo";

const cacheFmt = new Map();
function fmt(fuso) {
  if (!cacheFmt.has(fuso)) {
    cacheFmt.set(fuso, new Intl.DateTimeFormat("en-US", {
      timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    }));
  }
  return cacheFmt.get(fuso);
}

export function fusoValido(fuso) {
  try { fmt(fuso); return true; } catch { return false; }
}

const DIAS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Partes do relógio local de um instante. diaSemana: 1 = segunda ... 7 = domingo.
export function partesLocais(instante, fuso) {
  const d = instante instanceof Date ? instante : new Date(instante);
  const p = {};
  for (const { type, value } of fmt(fuso).formatToParts(d)) p[type] = value;
  return {
    ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second,
    diaSemana: DIAS[p.weekday],
    data: `${p.year}-${p.month}-${p.day}`,
    horaTexto: `${p.hour}:${p.minute}`,
  };
}

function deslocamentoMs(ms, fuso) {
  const p = partesLocais(new Date(ms), fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(ms / 1000) * 1000;
}

export class ErroHorario extends Error {
  constructor(codigo, msg) { super(msg); this.codigo = codigo; }
}

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^(\d{1,2}):(\d{2})$/;

// "2026-11-23" + "10:00" no fuso -> ISO UTC. Horário que não existe (o
// relógio pulou na mudança de horário de verão) dá erro em vez de virar outro
// horário calado. Horário repetido (o relógio voltou) fica com a 1ª vez.
export function localParaUtc(data, hora, fuso) {
  const md = RE_DATA.exec(data || ""), mh = RE_HORA.exec(hora || "");
  if (!md) throw new ErroHorario("data_invalida", "Data inválida: use AAAA-MM-DD.");
  if (!mh || +mh[1] > 23 || +mh[2] > 59) throw new ErroHorario("hora_invalida", "Horário inválido: use HH:MM.");
  if (!fusoValido(fuso)) throw new ErroHorario("fuso_invalido", "Fuso desconhecido: " + fuso);
  const ingenuo = Date.UTC(+md[1], +md[2] - 1, +md[3], +mh[1], +mh[2]);
  const chk = new Date(ingenuo);
  if (chk.getUTCDate() !== +md[3] || chk.getUTCMonth() !== +md[2] - 1) {
    throw new ErroHorario("data_invalida", "Essa data não existe no calendário.");
  }
  const candidatos = new Set();
  for (const ref of [ingenuo - 36e5 * 14, ingenuo, ingenuo + 36e5 * 14]) {
    candidatos.add(ingenuo - deslocamentoMs(ref, fuso));
  }
  const validos = [...candidatos]
    .filter((ms) => { const p = partesLocais(new Date(ms), fuso); return p.data === data && p.horaTexto === hora.padStart(5, "0"); })
    .sort((a, b) => a - b);
  if (!validos.length) {
    throw new ErroHorario("horario_inexistente", `${data} ${hora} não existe em ${fuso} (mudança de horário). Escolha outro horário.`);
  }
  return new Date(validos[0]).toISOString();
}

export function utcParaLocal(iso, fuso) {
  const p = partesLocais(new Date(iso), fuso);
  return { data: p.data, hora: p.horaTexto, diaSemana: p.diaSemana };
}

export function somarDias(data, n) {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemanaDaData(data) {
  const [a, m, d] = data.split("-").map(Number);
  const w = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

const NOMES_DIA = ["", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."];
export const NOMES_DIA_LONGO = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

// "seg., 23/11/2026 às 10:00 (America/Sao_Paulo)"
export function formatarLocal(iso, fuso, { comFuso = true } = {}) {
  if (!iso) return "sem data";
  const p = partesLocais(new Date(iso), fuso);
  const txt = `${NOMES_DIA[p.diaSemana]}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano} às ${p.horaTexto}`;
  return comFuso ? `${txt} (${fuso})` : txt;
}
