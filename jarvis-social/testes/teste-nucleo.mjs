import { teste, igual, verdade, rodar } from "./base.mjs";
import { localParaUtc, utcParaLocal, formatarLocal, partesLocais } from "../supabase/functions/_compartilhado/tempo.js";
import { gerarSlots, preverMudanca, proximoSlotLivre, validarPolitica } from "../supabase/functions/_compartilhado/frequencia.js";
import { interpretar, extrairHoras } from "../supabase/functions/_compartilhado/comandos.js";
import { podeIr, transicao } from "../supabase/functions/_compartilhado/estados.js";
import { horariosPadrao, validarLegenda } from "../supabase/functions/_compartilhado/api.js";
import { cifrar, decifrar } from "../supabase/functions/_compartilhado/cifra.js";

const SP = "America/Sao_Paulo";
teste("São Paulo: 10:00 local = 13:00 UTC (sem horário de verão)", () => igual(localParaUtc("2026-11-23", "10:00", SP), "2026-11-23T13:00:00.000Z"));
teste("volta UTC -> local", () => igual(utcParaLocal("2026-11-23T13:00:00.000Z", SP), { data: "2026-11-23", hora: "10:00", diaSemana: 1 }));
teste("Nova York: 02:30 de 08/03/2026 não existe (horário de verão)", () => {
  try { localParaUtc("2026-03-08", "02:30", "America/New_York"); throw new Error("passou"); } catch (e) { igual(e.codigo, "horario_inexistente"); }
});
teste("Nova York: 01:30 de 01/11/2026 repete; fica a 1ª vez (EDT)", () => igual(localParaUtc("2026-11-01", "01:30", "America/New_York"), "2026-11-01T05:30:00.000Z"));
teste("Londres no verão: 10:00 = 09:00 UTC", () => igual(localParaUtc("2026-07-01", "10:00", "Europe/London"), "2026-07-01T09:00:00.000Z"));
teste("data impossível recusada", () => { try { localParaUtc("2026-02-30", "10:00", SP); throw 0; } catch (e) { igual(e.codigo, "data_invalida"); } });
teste("formatação mostra fuso", () => igual(formatarLocal("2026-11-23T13:00:00.000Z", SP), "seg., 23/11/2026 às 10:00 (America/Sao_Paulo)"));
teste("o fuso da máquina não interfere", () => { process.env.TZ = "Asia/Tokyo"; igual(partesLocais(new Date("2026-11-23T13:00:00Z"), SP).horaTexto, "10:00"); });

const pol2 = { horarios: ["18:00", "10:00"], dias: [1, 2, 3, 4, 5, 6, 7], fuso: SP };
teste("dois por dia: slots ordenados em UTC", () => {
  igual(gerarSlots(pol2, "2026-11-22T15:00:00.000Z", "2026-11-24T02:59:00.000Z"), ["2026-11-22T21:00:00.000Z", "2026-11-23T13:00:00.000Z", "2026-11-23T21:00:00.000Z"]);
});
teste("sem teto comercial: 20 por dia aceitos", () => igual(validarPolitica({ horarios: Array.from({ length: 20 }, (_, i) => `${String(i + 2).padStart(2, "0")}:00`), dias: [1] }).horarios.length, 20));
teste("limite técnico de proteção (49/dia) recusado", () => { try { validarPolitica({ horarios: Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 3)).padStart(2, "0")}:${String((i % 3) * 20).padStart(2, "0")}`), dias: [1] }); throw 0; } catch (e) { igual(e.codigo, "politica_invalida"); } });
teste("dias da semana e pausa respeitados", () => {
  const s = gerarSlots({ horarios: ["10:00"], dias: [1, 3], pausadaAte: "2026-11-23", fuso: SP }, "2026-11-22T00:00:00Z", "2026-11-30T23:00:00Z");
  igual(s, ["2026-11-25T13:00:00.000Z", "2026-11-30T13:00:00.000Z"]);
});
teste("próximo slot livre pula ocupados", () => igual(proximoSlotLivre(pol2, ["2026-11-22T21:00:00.000Z"], "2026-11-22T15:00:00.000Z"), "2026-11-23T13:00:00.000Z"));
teste("prévia: só move horários da frequência; manual fica; sem duplicar", () => {
  const posts = [
    { id: "1", estado: "scheduled", origem_horario: "frequencia", agendado_utc: "2026-11-23T13:00:00.000Z" },
    { id: "2", estado: "scheduled", origem_horario: "frequencia", agendado_utc: "2026-11-24T13:00:00.000Z" },
    { id: "3", estado: "scheduled", origem_horario: "manual", agendado_utc: "2026-11-23T21:00:00.000Z" },
    { id: "4", estado: "published", origem_horario: "frequencia", agendado_utc: "2026-11-21T13:00:00.000Z" },
  ];
  const p = preverMudanca(posts, pol2, "2026-11-22T15:00:00.000Z");
  igual(p.mudancas.map((m) => [m.post_id, m.para]), [["1", "2026-11-22T21:00:00.000Z"], ["2", "2026-11-23T13:00:00.000Z"]]);
  verdade(!p.mudancas.some((m) => m.post_id === "3" || m.post_id === "4"));
});

const agora = "2026-11-22T15:00:00.000Z"; // domingo 12:00 em SP
teste("“Programe este vídeo amanhã às 10h”", () => igual(interpretar("Programe este vídeo amanhã às 10h.", agora, SP), { acao: "agendar", data: "2026-11-23", hora: "10:00" }));
teste("“agende para sexta às 18h30”", () => igual(interpretar("agende para sexta às 18h30", agora, SP), { acao: "agendar", data: "2026-11-27", hora: "18:30" }));
teste("“programe dia 25/12 às 9”", () => igual(interpretar("programe dia 25/12 às 9", agora, SP), { acao: "agendar", data: "2026-12-25", hora: "09:00" }));
teste("“programe amanhã” pergunta a hora", () => igual(interpretar("programe amanhã", agora, SP).falta, "hora"));
teste("“Mostre minha agenda da semana”", () => igual(interpretar("Mostre minha agenda da semana", agora, SP), { acao: "listar_agenda", de: "2026-11-22", ate: "2026-11-28" }));
teste("“Altere para dois vídeos por dia”", () => igual(interpretar("Altere para dois vídeos por dia.", agora, SP), { acao: "frequencia", quantidade: 2, horarios: [] }));
teste("“Mude para dois vídeos por dia, às 10h e às 18h”", () => igual(interpretar("Mude para dois vídeos por dia, às 10h e às 18h", agora, SP), { acao: "frequencia", quantidade: 2, horarios: ["10:00", "18:00"] }));
teste("“Pause as próximas publicações”", () => igual(interpretar("Pause as próximas publicações", agora, SP).acao, "pausar_fila"));
teste("“Mostre o motivo desta falha”", () => igual(interpretar("Mostre o motivo desta falha", agora, SP).acao, "listar_falhas"));
teste("horas: 10:30, meio-dia, 18 horas", () => igual(extrairHoras("10:30, meio-dia e 18 horas"), ["10:30", "18:00", "12:00"]));
teste("horários padrão: 2 por dia = 10h e 18h", () => igual(horariosPadrao(2), ["10:00", "18:00"]));

teste("estados: publicado é final; publicando não cancela", () => { verdade(!podeIr("published", "scheduled")); verdade(!podeIr("publishing", "cancelled")); });
teste("transição gera evento com versão e motivo", () => {
  const t = transicao({ id: "p", org_id: "o", estado: "scheduled", versao: 3 }, "paused", { agora, motivo: "x", subirVersao: true });
  igual([t.mudancas.versao, t.evento.de, t.evento.para, t.evento.motivo], [4, "scheduled", "paused", "x"]);
});
teste("legenda: limite de 2200 e 30 hashtags", () => {
  verdade(validarLegenda("a".repeat(2200)).ok); verdade(!validarLegenda("a".repeat(2201)).ok);
  verdade(!validarLegenda(Array.from({ length: 31 }, (_, i) => "#t" + i).join(" ")).ok);
});
teste("token cifrado e decifrado (AES-GCM)", async () => {
  const k = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
  const c = await cifrar("segredo-meta", k);
  verdade(!c.includes("segredo")); igual(await decifrar(c, k), "segredo-meta");
});

rodar("núcleo: fusos, frequência, comandos, estados");
