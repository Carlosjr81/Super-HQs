import { teste, igual, verdade, rodar } from "./base.mjs";
import { ambiente, A, B } from "./ambiente.mjs";
import { ErroRede } from "../supabase/functions/_compartilhado/instagram.js";

let n = 0; const chave = () => "w" + (++n);
async function agendar(e, video, hora = "10:00", data = "2026-11-23", legenda = "Reel " + n) {
  return (await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda, data, hora, agendar: true, chave_idempotencia: chave() })).corpo.post;
}
async function ate(e, id, estados, passos = 30, minutos = 1) {
  for (let i = 0; i < passos; i++) {
    const p = await e.banco.obter("posts", id);
    if (estados.includes(p.estado)) return p;
    await e.worker().rodar(); e.avancar(minutos);
  }
  return e.banco.obter("posts", id);
}

teste("antes do horário o worker não toca no post", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); const p = await agendar(e, video);
  const r = await e.worker().rodar(); igual(r.reivindicados, 0);
  igual((await e.banco.obter("posts", p.id)).estado, "scheduled");
});

teste("caminho feliz: contêiner → processamento → publicado com ID e permalink", async () => {
  const e = ambiente(); const { video, capa } = await e.preparar(A);
  const p = (await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, capa_id: capa.id, legenda: "feliz", data: "2026-11-23", hora: "10:00", agendar: true, chave_idempotencia: chave() })).corpo.post;
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const fim = await ate(e, p.id, ["published", "failed"]);
  igual(fim.estado, "published"); verdade(fim.media_id && fim.permalink.startsWith("https://www.instagram.com/reel/"));
  igual(e.ig.publicadas.length, 1);
  const rc = (await e.chamar(A, "GET", `/v1/posts/${p.id}`)).corpo;
  igual(rc.eventos.map((x) => x.para), ["scheduled", "preparing", "processing", "publishing", "published"]);
  igual(rc.post.recibo.confirmacao, "demonstracao", "posts do simulador nunca viram 'publicação concluída'");
});

teste("cancelar durante o processamento impede a publicação", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  await e.worker().rodar();
  const meio = await e.banco.obter("posts", p.id); igual(meio.estado, "processing");
  await e.chamar(A, "POST", `/v1/posts/${p.id}/cancelar`, { versao: meio.versao });
  e.avancar(1); await e.worker().rodar(); e.avancar(1); await e.worker().rodar();
  igual((await e.banco.obter("posts", p.id)).estado, "cancelled"); igual(e.ig.publicadas.length, 0);
});

teste("edição com job antigo na fila: o job velho não publica a versão antiga", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); let p = await agendar(e, video);
  await e.chamar(A, "PATCH", `/v1/posts/${p.id}`, { versao: 1, legenda: "versão 2" });
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const fim = await ate(e, p.id, ["published"]);
  igual(e.ig.publicadas.map((x) => x.legenda), ["versão 2"]); igual(fim.versao, 2);
});

teste("resposta ambígua ao publicar: confere e NÃO reenvia (já tinha publicado)", async () => {
  const e = ambiente({ falhas: { publicar: [{ depoisDePublicar: true, erro: new ErroRede("ambiguo", "timeout") }] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const fim = await ate(e, p.id, ["published", "failed"]);
  igual(fim.estado, "published"); igual(e.ig.publicadas.length, 1, "uma publicação só");
  verdade((await e.banco.listar("eventos", { post_id: p.id })).some((x) => x.para === "needs_reconciliation"));
});

teste("resposta ambígua sem ter publicado: confere e publica uma vez", async () => {
  const e = ambiente({ falhas: { publicar: [new ErroRede("ambiguo", "sem resposta")] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const fim = await ate(e, p.id, ["published", "failed"]);
  igual(fim.estado, "published"); igual(e.ig.publicadas.length, 1);
});

teste("limite da rede: espera o Retry-After e tenta de novo", async () => {
  const e = ambiente({ falhas: { criar: [new ErroRede("limite", "muitas chamadas", { esperarSeg: 600 })] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  await e.worker().rodar();
  const r = await e.banco.obter("posts", p.id);
  igual([r.estado, r.proxima_tentativa_em], ["retry_wait", "2026-11-23T13:10:00.000Z"]);
  e.avancar(5); await e.worker().rodar(); igual((await e.banco.obter("posts", p.id)).estado, "retry_wait");
  e.avancar(6);
  igual((await ate(e, p.id, ["published"])).estado, "published");
});

teste("erro permanente: falha com motivo legível, sem insistir", async () => {
  const e = ambiente({ falhas: { criar: [new ErroRede("permanente", "Formato de vídeo não suportado")] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z"; await e.worker().rodar();
  const r = await e.banco.obter("posts", p.id);
  igual([r.estado, r.ultimo_erro], ["failed", "Formato de vídeo não suportado"]);
  const motivo = (await e.chamar(A, "POST", "/v1/comandos", { texto: "Mostre o motivo desta falha" })).corpo.resposta;
  verdade(motivo.includes("Formato de vídeo não suportado"), motivo);
});

teste("transitório repetido: para depois de 5 tentativas e avisa", async () => {
  const t = () => new ErroRede("transitorio", "instável");
  const e = ambiente({ falhas: { criar: [t(), t(), t(), t(), t(), t()] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const fim = await ate(e, p.id, ["failed", "published"], 40, 70);
  igual(fim.estado, "failed"); verdade(fim.ultimo_erro.includes("5 tentativas"), fim.ultimo_erro);
});

teste("token expirado: conexão vira 'reconectar' e o Início avisa", async () => {
  const e = ambiente({ falhas: { cota: [new ErroRede("autenticacao", "token expirado")] } });
  const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z"; await e.worker().rodar();
  igual((await e.banco.obter("posts", p.id)).estado, "failed");
  igual((await e.banco.listar("conexoes", {}))[0].estado, "reconectar");
  verdade((await e.chamar(A, "GET", "/v1/eu")).corpo.alertas.some((a) => a.texto.startsWith("Reconecte")));
});

teste("worker morreu no meio: lease vence e outro worker continua sem duplicar", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z";
  const presos = await e.banco.reivindicarJobs({ agora: e.rel.t, dono: "morto", leaseSeg: 300 });
  igual(presos.length, 1);
  igual((await e.worker("w2").rodar()).reivindicados, 0, "lease válido segura o job");
  e.avancar(6);
  const fim = await ate(e, p.id, ["published"]);
  igual(fim.estado, "published"); igual(e.ig.publicadas.length, 1);
});

teste("dois workers ao mesmo tempo não pegam o mesmo job", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  for (let i = 0; i < 4; i++) await agendar(e, video, `10:0${i}`);
  e.rel.t = "2026-11-23T13:10:00.000Z";
  const [j1, j2] = await Promise.all([e.banco.reivindicarJobs({ agora: e.rel.t, dono: "x", limite: 3 }), e.banco.reivindicarJobs({ agora: e.rel.t, dono: "y", limite: 3 })]);
  const ids = [...j1, ...j2].map((j) => j.id);
  igual(new Set(ids).size, ids.length); igual(ids.length, 4);
});

teste("atraso além da tolerância: pausa e espera decisão (não despeja vídeos atrasados)", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  const p1 = await agendar(e, video, "10:00"); const p2 = await agendar(e, video, "10:30");
  e.rel.t = "2026-11-23T16:00:00.000Z"; // 3 h depois
  await e.worker().rodar();
  igual([(await e.banco.obter("posts", p1.id)).estado, (await e.banco.obter("posts", p2.id)).estado], ["paused", "paused"]);
  igual(e.ig.publicadas.length, 0);
});

teste("dentro da tolerância e vários vencidos: um por rodada por conta", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  const p1 = await agendar(e, video, "10:00"); const p2 = await agendar(e, video, "10:01");
  e.rel.t = "2026-11-23T13:05:00.000Z";
  await e.worker().rodar();
  igual([(await e.banco.obter("posts", p1.id)).estado, (await e.banco.obter("posts", p2.id)).estado], ["processing", "processing"]);
});

teste("fila pausada: nada é reivindicado", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); await agendar(e, video);
  await e.chamar(A, "POST", "/v1/fila/pausar");
  e.rel.t = "2026-11-23T13:00:00.000Z";
  igual((await e.worker().rodar()).reivindicados, 0);
});

teste("Instagram desconectado na hora: falha com instrução, sem publicar", async () => {
  const e = ambiente(); const { video } = await e.preparar(A, { conectar: false }); const p = await agendar(e, video);
  e.rel.t = "2026-11-23T13:00:00.000Z"; await e.worker().rodar();
  const r = await e.banco.obter("posts", p.id);
  igual(r.estado, "failed"); verdade(r.ultimo_erro.includes("Conecte"));
});

teste("vídeo sumiu do armazenamento: falha antes de chamar o Instagram", async () => {
  const e = ambiente(); const { video } = await e.preparar(A); const p = await agendar(e, video);
  e.arm.objetos.delete(video.caminho);
  e.rel.t = "2026-11-23T13:00:00.000Z"; await e.worker().rodar();
  igual((await e.banco.obter("posts", p.id)).estado, "failed"); igual(e.ig.containers.size, 0);
});

teste("fila extensa (200 posts, 4 por dia) sem duplicar horários", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  await e.chamar(A, "PUT", "/v1/frequencia", { politica: { horarios: ["08:00", "12:00", "16:00", "20:00"], dias: [1, 2, 3, 4, 5, 6, 7] } });
  for (let i = 0; i < 200; i++) await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "f" + i, proximo_livre: true, agendar: true, chave_idempotencia: chave() });
  const hs = (await e.banco.listar("posts", {})).map((p) => p.agendado_utc);
  igual(new Set(hs).size, 200);
});

rodar("worker: publicação, reconciliação, falhas, concorrência e atraso");
