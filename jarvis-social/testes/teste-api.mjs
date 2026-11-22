import { teste, igual, verdade, rodar } from "./base.mjs";
import { ambiente, A, B } from "./ambiente.mjs";
import { BancoMemoria } from "../supabase/functions/_compartilhado/banco.js";

let n = 0; const chave = () => "k" + (++n);

teste("sem login: 401; sem espaço: 403 pedindo para criar", async () => {
  const e = ambiente();
  igual((await e.chamar(null, "GET", "/v1/eu")).status, 401);
  igual((await e.chamar(A, "GET", "/v1/eu")).corpo.erro, "sem_organizacao");
});

teste("agendar com data/hora/fuso; recibo diz 'agendamento confirmado no Jarvis', não 'publicado'", async () => {
  const e = ambiente(); const { video, capa } = await e.preparar(A);
  const r = await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, capa_id: capa.id, legenda: "Treino 40+ #foco", data: "2026-11-23", hora: "10:00", agendar: true, chave_idempotencia: chave(), fonte: { autor: "@vikingthales", url: "https://www.instagram.com/reel/X/" } });
  igual(r.status, 200, JSON.stringify(r.corpo));
  const p = r.corpo.post;
  igual([p.estado, p.agendado_utc, p.fuso, p.recibo.confirmacao], ["scheduled", "2026-11-23T13:00:00.000Z", "America/Sao_Paulo", "agendamento_confirmado_no_jarvis"]);
  igual(p.recibo.agendado_local, "seg., 23/11/2026 às 10:00 (America/Sao_Paulo)");
  igual(p.recibo.perfil, "@conta_a"); igual(p.recibo.permalink, null); igual(p.recibo.fonte.autor, "@vikingthales");
  igual((await e.banco.listar("jobs", { post_id: p.id })).length, 1);
});

teste("“fechar e reabrir”: outra instância da API sobre o mesmo banco encontra o agendamento", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "x", data: "2026-11-24", hora: "18:00", agendar: true, chave_idempotencia: chave() });
  const copia = JSON.parse(JSON.stringify(e.banco.t));
  const e2 = ambiente({ estado: copia });
  const l = await e2.chamar(A, "GET", "/v1/posts", null, { de: "2026-11-24", ate: "2026-11-24" });
  igual(l.corpo.posts.map((p) => [p.estado, p.local.hora, p.recibo.fuso]), [["scheduled", "18:00", "America/Sao_Paulo"]]);
});

teste("idempotência: mesmo pedido repetido não duplica; mesma chave com outro conteúdo = 409", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  const pedido = { video_id: video.id, legenda: "x", data: "2026-11-23", hora: "10:00", agendar: true, chave_idempotencia: "fixa" };
  const r1 = await e.chamar(A, "POST", "/v1/posts", pedido);
  const r2 = await e.chamar(A, "POST", "/v1/posts", pedido);
  igual([r2.status, r2.corpo.repetido, r2.corpo.post.id], [200, true, r1.corpo.post.id]);
  igual((await e.banco.listar("posts", {})).length, 1);
  const r3 = await e.chamar(A, "POST", "/v1/posts", { ...pedido, legenda: "outra" });
  igual([r3.status, r3.corpo.erro], [409, "chave_reutilizada"]);
});

teste("isolamento: B não lê, edita, cancela nem usa mídia de A pelo ID", async () => {
  const e = ambiente(); const a = await e.preparar(A); await e.preparar(B);
  const p = (await e.chamar(A, "POST", "/v1/posts", { video_id: a.video.id, legenda: "x", data: "2026-11-23", hora: "10:00", agendar: true, chave_idempotencia: chave() })).corpo.post;
  igual((await e.chamar(B, "GET", `/v1/posts/${p.id}`)).status, 404);
  igual((await e.chamar(B, "PATCH", `/v1/posts/${p.id}`, { versao: 1, legenda: "hack" })).status, 404);
  igual((await e.chamar(B, "POST", `/v1/posts/${p.id}/cancelar`, {})).status, 404);
  igual((await e.chamar(B, "POST", "/v1/posts", { video_id: a.video.id, legenda: "x", chave_idempotencia: chave() })).corpo.erro, "midia_nao_encontrada");
  igual((await e.chamar(B, "GET", "/v1/posts")).corpo.posts.length, 0);
  igual((await e.chamar(B, "GET", "/v1/eu", null, { org_id: a.org.id })).status, 404, "org_id de outro não escolhe tenant");
});

teste("editar, pausar e cancelar sobem a versão e deixam o job antigo obsoleto", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  let p = (await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "x", data: "2026-11-23", hora: "10:00", agendar: true, chave_idempotencia: chave() })).corpo.post;
  p = (await e.chamar(A, "PATCH", `/v1/posts/${p.id}`, { versao: 1, legenda: "nova", data: "2026-11-23", hora: "11:00" })).corpo.post;
  igual([p.versao, p.legenda, p.local.hora, p.estado], [2, "nova", "11:00", "scheduled"]);
  const velho = await e.chamar(A, "PATCH", `/v1/posts/${p.id}`, { versao: 1, legenda: "conflito" });
  igual(velho.corpo.erro, "versao_desatualizada");
  p = (await e.chamar(A, "POST", `/v1/posts/${p.id}/pausar`, { versao: 2 })).corpo.post;
  igual(p.estado, "paused");
  p = (await e.chamar(A, "POST", `/v1/posts/${p.id}/retomar`, { versao: 3 })).corpo.post;
  igual(p.estado, "scheduled");
  p = (await e.chamar(A, "POST", `/v1/posts/${p.id}/cancelar`, { versao: 4 })).corpo.post;
  igual([p.estado, p.versao], ["cancelled", 5]);
  const jobs = await e.banco.listar("jobs", { post_id: p.id });
  verdade(jobs.every((j) => j.estado === "obsoleto"), JSON.stringify(jobs.map((j) => j.estado)));
  const ev = (await e.chamar(A, "GET", `/v1/posts/${p.id}`)).corpo.eventos.map((x) => x.para);
  igual(ev, ["scheduled", "scheduled", "paused", "scheduled", "cancelled"]);
});

teste("horário passado e legenda longa são recusados com motivo", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  igual((await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, data: "2026-11-22", hora: "11:00", agendar: true, chave_idempotencia: chave() })).corpo.erro, "horario_passado");
  igual((await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "a".repeat(2201), chave_idempotencia: chave() })).corpo.erro, "legenda_invalida");
});

teste("upload: finalizar sem o arquivo ou com tamanho diferente não marca pronta", async () => {
  const e = ambiente(); await e.preparar(A);
  const m = (await e.chamar(A, "POST", "/v1/midias", { tipo: "video", mime: "video/mp4", tamanho: 500 })).corpo.midia;
  igual((await e.chamar(A, "POST", `/v1/midias/${m.id}/finalizar`)).corpo.erro, "upload_ausente");
  e.arm.receber(m.caminho, 200, "video/mp4");
  igual((await e.chamar(A, "POST", `/v1/midias/${m.id}/finalizar`)).corpo.erro, "upload_incompleto");
  igual((await e.chamar(A, "POST", "/v1/midias", { tipo: "video", mime: "video/x-msvideo", tamanho: 5 })).corpo.erro, "formato_invalido");
});

teste("frequência: prévia obrigatória antes de remarcar; aplica sem duplicar", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  for (let i = 0; i < 3; i++) await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "v" + i, proximo_livre: true, agendar: true, chave_idempotencia: chave() });
  let l = (await e.chamar(A, "GET", "/v1/posts")).corpo.posts.map((p) => p.local.data + " " + p.local.hora);
  igual(l, ["2026-11-23 10:00", "2026-11-24 10:00", "2026-11-25 10:00"]);
  const pol = { horarios: ["10:00", "18:00"], dias: [1, 2, 3, 4, 5, 6, 7] };
  const semPrevia = await e.chamar(A, "PUT", "/v1/frequencia", { politica: pol });
  igual(semPrevia.corpo.erro, "previa_desatualizada");
  const prev = (await e.chamar(A, "POST", "/v1/frequencia/previa", { politica: pol })).corpo;
  igual(prev.mudancas.length, 3);
  const ap = await e.chamar(A, "PUT", "/v1/frequencia", { politica: pol, hash_previa: prev.hash_previa });
  igual(ap.corpo.aplicadas.length, 3);
  l = (await e.chamar(A, "GET", "/v1/posts")).corpo.posts.map((p) => p.local.data + " " + p.local.hora);
  igual(l, ["2026-11-22 18:00", "2026-11-23 10:00", "2026-11-23 18:00"]);
  igual((await e.banco.listar("posts", {})).length, 3);
});

teste("comando: “Programe este vídeo amanhã às 10h” agenda o último rascunho", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "rascunho", chave_idempotencia: chave() });
  const r = (await e.chamar(A, "POST", "/v1/comandos", { texto: "Programe este vídeo amanhã às 10h" })).corpo;
  igual(r.post.estado, "scheduled"); verdade(r.resposta.includes("23/11/2026 às 10:00"), r.resposta);
});

teste("comando: “Altere para dois vídeos por dia” mostra prévia e só aplica com confirmação", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "a", proximo_livre: true, agendar: true, chave_idempotencia: chave() });
  const p1 = (await e.chamar(A, "POST", "/v1/comandos", { texto: "Altere para dois vídeos por dia" })).corpo;
  verdade(p1.confirmar && p1.resposta.includes("10:00, 18:00"), p1.resposta);
  igual((await e.chamar(A, "GET", "/v1/frequencia")).corpo.politica.horarios, ["10:00"]);
  const p2 = (await e.chamar(A, "POST", "/v1/comandos", { texto: "Altere para dois vídeos por dia", confirmar: true, hash_previa: p1.previa.hash_previa })).corpo;
  verdade(p2.resposta.startsWith("Frequência alterada"), p2.resposta);
  igual((await e.chamar(A, "GET", "/v1/frequencia")).corpo.politica.horarios, ["10:00", "18:00"]);
});

teste("comando: “Mostre minha agenda da semana” e pausa da fila", async () => {
  const e = ambiente(); const { video } = await e.preparar(A);
  await e.chamar(A, "POST", "/v1/posts", { video_id: video.id, legenda: "agenda", data: "2026-11-24", hora: "10:00", agendar: true, chave_idempotencia: chave() });
  const r = (await e.chamar(A, "POST", "/v1/comandos", { texto: "Mostre minha agenda da semana" })).corpo;
  verdade(r.resposta.includes("24/11/2026 às 10:00"), r.resposta);
  await e.chamar(A, "POST", "/v1/comandos", { texto: "Pause as próximas publicações" });
  verdade((await e.chamar(A, "GET", "/v1/eu")).corpo.alertas.some((a) => a.tipo === "pausa"));
});

teste("Início alerta Instagram não conectado", async () => {
  const e = ambiente(); await e.preparar(A, { conectar: false });
  verdade((await e.chamar(A, "GET", "/v1/eu")).corpo.alertas.some((a) => a.tipo === "conexao"));
});

teste("OAuth: state de uso único, expira; token guardado cifrado", async () => {
  const e = ambiente(); await e.preparar(A, { conectar: false });
  const u = (await e.chamar(A, "POST", "/v1/instagram/conectar")).corpo.url;
  verdade(u, "deveria devolver a URL");
  const st = (await e.banco.listar("estados_oauth", {}))[0].id;
  const r = await e.chamar(null, "GET", "/v1/instagram/retorno", null, { code: "c", state: st });
  verdade(r.redirecionar.endsWith("instagram=conectado"), r.redirecionar);
  const c = (await e.banco.listar("conexoes", {}))[0];
  verdade(c.token_cifrado.startsWith("v1.") && !c.token_cifrado.includes("simulado"));
  verdade(!JSON.stringify((await e.chamar(A, "GET", "/v1/eu")).corpo).includes(c.token_cifrado), "token não sai na API");
  const de_novo = await e.chamar(null, "GET", "/v1/instagram/retorno", null, { code: "c", state: st });
  verdade(de_novo.redirecionar.endsWith("expirado"));
});

teste("banco em memória: atualização condicionada à versão", async () => {
  const b = new BancoMemoria(); const p = await b.inserir("posts", { versao: 1, estado: "scheduled" });
  verdade(await b.atualizar("posts", p.id, { versao: 2 }, { versao: 1 }));
  igual(await b.atualizar("posts", p.id, { versao: 3 }, { versao: 1 }), null);
});

teste("cadastro fechado: só e-mail liberado cria espaço", async () => {
  const { BancoMemoria: BM } = await import("../supabase/functions/_compartilhado/banco.js");
  const { criarApi } = await import("../supabase/functions/_compartilhado/api.js");
  const api = criarApi({ banco: new BM(), armazenamento: null, instagram: null, segredos: { emailsPermitidos: ["dono@x"] } });
  igual((await api.tratar({ metodo: "POST", caminho: "/v1/organizacoes", usuario: { id: "1", email: "outro@x" } })).corpo.erro, "cadastro_fechado");
  igual((await api.tratar({ metodo: "POST", caminho: "/v1/organizacoes", usuario: { id: "2", email: "Dono@x" } })).status, 200);
});

rodar("API: agendamento, isolamento, idempotência, frequência e comandos");
