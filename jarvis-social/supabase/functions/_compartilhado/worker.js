// O worker: roda no servidor (agendado a cada minuto), independente do
// navegador e da conversa. Cada execução reivindica jobs vencidos com lease,
// confere a versão do post e avança UM passo do envio por vez, gravando o
// estado ANTES de cada chamada externa. Reiniciar no meio não perde nada:
// lease vencido = job volta para a fila; post com contêiner = continua dele.
import { ErroRede } from "./instagram.js";
import { decifrar, cifrar } from "./cifra.js";
import { transicao } from "./estados.js";
import { proximoSlotLivre, politicaPadrao } from "./frequencia.js";

export const MAX_TENTATIVAS = 5;
const ESPERA_STATUS_SEG = 30;
const LIMITE_PROCESSAMENTO_MIN = 30;
const VALIDADE_URL_SEG = 6 * 3600;

export function espera(tentativa, { esperarSeg, aleatorio = Math.random } = {}) {
  if (esperarSeg) return esperarSeg;
  const base = Math.min(3600, 60 * 2 ** Math.max(0, tentativa - 1));
  return Math.round(base * (0.8 + 0.4 * aleatorio()));
}

export function criarWorker({ banco, armazenamento, instagram, agora = () => new Date().toISOString(), segredos = {}, dono = "worker", aleatorio = Math.random, registrar: log = () => {} }) {
  const mais = (seg) => new Date(Date.parse(agora()) + seg * 1000).toISOString();

  async function evento(e) { try { await banco.inserir("eventos", e); } catch { /* a versão protege */ } }

  // Transição condicionada; null = o post mudou (edição/cancelamento do dono).
  async function mover(post, para, motivo, extra = {}, subirVersao = false) {
    const { mudancas, evento: ev } = transicao(post, para, { motivo, agora: agora(), ator: dono, extra, subirVersao });
    const novo = await banco.atualizar("posts", post.id, mudancas, { versao: post.versao, estado: post.estado });
    if (novo) await evento(ev);
    return novo;
  }
  const fimJob = (job, estado) => banco.atualizar("jobs", job.id, { estado, lease_ate: null, concluido_em: agora() }, { dono: job.dono, estado: "executando" });
  const adiar = (job, seg, versao) => banco.atualizar("jobs", job.id, { estado: "pendente", executar_em: mais(seg), lease_ate: null, ...(versao ? { versao_post: versao } : {}) }, { dono: job.dono, estado: "executando" });

  async function falhaOuNovaTentativa(job, post, erro, { manterContainer = false } = {}) {
    const tent = (post.tentativas || 0) + 1;
    const msg = erro.message || String(erro);
    if (erro.tipo === "permanente" || tent >= MAX_TENTATIVAS) {
      await mover(post, "failed", `falhou: ${msg}`, { tentativas: tent, ultimo_erro: tent >= MAX_TENTATIVAS && erro.tipo !== "permanente" ? `${msg} (após ${tent} tentativas)` : msg });
      await fimJob(job, "concluido");
      return "failed";
    }
    const seg = espera(tent, { esperarSeg: erro.esperarSeg, aleatorio });
    const novo = await mover(post, "retry_wait", `nova tentativa em ${seg}s: ${msg}`, { tentativas: tent, ultimo_erro: msg, proxima_tentativa_em: mais(seg), ...(manterContainer ? {} : { container_id: null }) });
    await adiar(job, seg);
    return novo ? "retry_wait" : "obsoleto";
  }

  async function conexaoETokens(post) {
    const c = post.conta_id ? await banco.obter("conexoes", post.conta_id) : (await banco.listar("conexoes", { org_id: post.org_id, estado: "ativa" }))[0];
    if (!c || c.org_id !== post.org_id) return { erro: "Instagram não conectado. Conecte em Ajustes e reprograme." };
    if (c.estado !== "ativa") return { erro: `Reconecte @${c.usuario_rede} em Ajustes (autorização ${c.estado}).` };
    const token = c.simulado ? "simulado" : await decifrar(c.token_cifrado, segredos.chaveCifra);
    return { conexao: c, token };
  }

  async function processar(job, publicadasNestaRodada) {
    let post = await banco.obter("posts", job.post_id);
    if (!post || post.org_id !== job.org_id || post.versao !== job.versao_post) { await fimJob(job, "obsoleto"); return "obsoleto"; }
    if (["published", "cancelled", "failed", "paused", "draft", "awaiting_approval"].includes(post.estado)) { await fimJob(job, "obsoleto"); return "obsoleto"; }
    const org = await banco.obter("organizacoes", post.org_id);
    if (org.fila_pausada) { await adiar(job, 60); return "fila_pausada"; }

    // Atraso (worker parado, fila retomada...): nunca despejar vários de uma vez.
    if (post.estado === "scheduled" && !post.container_id) {
      const atrasoMin = (Date.parse(agora()) - Date.parse(post.agendado_utc)) / 60e3;
      if (atrasoMin > (org.tolerancia_atraso_min ?? 60)) {
        const pol = org.politica_atraso || "aguardar";
        if (pol === "reagendar") {
          const ocup = (await banco.listar("posts", { org_id: org.id, estado: { in: ["scheduled", "paused", "processing", "retry_wait"] } })).map((p) => p.agendado_utc).filter(Boolean);
          const slot = proximoSlotLivre(org.politica || politicaPadrao(org.fuso), ocup, agora());
          const novo = slot && await mover(post, "scheduled", `atrasado ${Math.round(atrasoMin)} min: reagendado`, { agendado_utc: slot, origem_horario: "frequencia" }, true);
          if (novo) await banco.inserir("jobs", { org_id: org.id, post_id: post.id, versao_post: novo.versao, estado: "pendente", executar_em: slot, tentativas: 0, criado_em: agora() });
          await fimJob(job, "concluido");
          return "reagendado";
        }
        if (pol !== "publicar") {
          await mover(post, "paused", `passou ${Math.round(atrasoMin)} min do horário (tolerância ${org.tolerancia_atraso_min ?? 60} min): aguardando sua decisão`, { ultimo_erro: "Horário perdido: escolha um novo horário ou publique agora." }, true);
          await fimJob(job, "concluido");
          return "aguardando_decisao";
        }
      }
      if (publicadasNestaRodada.has(org.id)) { await adiar(job, 60); return "espacado"; }
    }

    const ct = await conexaoETokens(post);
    if (ct.erro) {
      await mover(post, "failed", ct.erro, { ultimo_erro: ct.erro });
      await fimJob(job, "concluido");
      return "failed";
    }
    const { conexao, token } = ct;
    const igUserId = conexao.ig_user_id;

    try {
      // 1. Criar o contêiner (seguro repetir: contêiner não publicado expira sozinho).
      if (!post.container_id && ["scheduled", "retry_wait", "preparing"].includes(post.estado)) {
        try {
          const cota = await instagram.cota({ igUserId, token });
          const d = cota && cota.data && cota.data[0];
          if (d && d.config && d.quota_usage >= d.config.quota_total) {
            return falhaOuNovaTentativa(job, post, new ErroRede("limite", `Cota de publicação do Instagram atingida (${d.quota_usage}/${d.config.quota_total} em 24 h).`, { esperarSeg: 3600 }));
          }
        } catch (e) { if (e instanceof ErroRede && e.tipo === "autenticacao") throw e; /* sem cota legível: segue, a publicação dirá */ }
        const video = await banco.obter("midias", post.video_id);
        if (!video || video.org_id !== post.org_id) throw new ErroRede("permanente", "Vídeo não encontrado na biblioteca.");
        const info = await armazenamento.info(video.caminho);
        if (!info || info.tamanho !== video.tamanho) throw new ErroRede("permanente", "O arquivo do vídeo no armazenamento não confere (ausente ou de outro tamanho). Envie de novo.");
        if (post.estado !== "preparing") { post = await mover(post, "preparing", "enviando ao Instagram"); if (!post) { await fimJob(job, "obsoleto"); return "obsoleto"; } }
        const videoUrl = await armazenamento.urlAssinada(video.caminho, VALIDADE_URL_SEG);
        let capaUrl = null;
        if (post.capa_id) { const capa = await banco.obter("midias", post.capa_id); if (capa && capa.org_id === post.org_id) capaUrl = await armazenamento.urlAssinada(capa.caminho, VALIDADE_URL_SEG); }
        const { containerId } = await instagram.criarContainerReel({ igUserId, token, videoUrl, legenda: post.legenda, capaUrl });
        post = await mover(post, "processing", `contêiner ${containerId} criado`, { container_id: containerId, container_criado_em: agora(), conta_id: conexao.id, ...(instagram.simulado ? { simulado: true } : {}) });
        if (!post) { await fimJob(job, "obsoleto"); return "obsoleto"; }
        await adiar(job, ESPERA_STATUS_SEG);
        return "processing";
      }

      // 2. Acompanhar o processamento e publicar.
      if (["processing", "retry_wait"].includes(post.estado) && post.container_id) {
        const st = await instagram.statusContainer({ containerId: post.container_id, token });
        const code = st.status_code;
        if (code === "IN_PROGRESS") {
          if (Date.parse(agora()) - Date.parse(post.container_criado_em || post.atualizado_em) > LIMITE_PROCESSAMENTO_MIN * 60e3) {
            return falhaOuNovaTentativa(job, post, new ErroRede("transitorio", `O Instagram não terminou de processar em ${LIMITE_PROCESSAMENTO_MIN} min.`));
          }
          if (post.estado === "retry_wait") post = await mover(post, "processing", "retomando acompanhamento");
          await adiar(job, ESPERA_STATUS_SEG);
          return "processing";
        }
        if (code === "ERROR" || code === "EXPIRED") return falhaOuNovaTentativa(job, post, new ErroRede("transitorio", `O Instagram recusou o processamento do vídeo (${code}${st.status ? ": " + st.status : ""}).`));
        if (code === "PUBLISHED") {
          post = await mover(post, "needs_reconciliation", "contêiner já consta como publicado", { publicacao_pedida_em: post.publicacao_pedida_em || post.container_criado_em });
          await adiar(job, 5);
          return "needs_reconciliation";
        }
        if (code === "FINISHED") {
          if (post.estado === "retry_wait") { post = await mover(post, "processing", "nova tentativa de publicar"); if (!post) { await fimJob(job, "obsoleto"); return "obsoleto"; } }
          // Portão: só pede a publicação se a versão continua a mesma (sem edição/cancelamento).
          post = await mover(post, "publishing", "pedindo a publicação", { publicacao_pedida_em: agora() });
          if (!post) { await fimJob(job, "obsoleto"); return "obsoleto"; }
          let mediaId;
          try {
            ({ mediaId } = await instagram.publicar({ igUserId, token, containerId: post.container_id }));
          } catch (e) {
            if (e instanceof ErroRede && e.tipo === "ambiguo") {
              await mover(post, "needs_reconciliation", `resposta ambígua ao publicar: ${e.message}`, { ultimo_erro: "Resposta ambígua do Instagram: conferindo antes de qualquer reenvio." });
              await adiar(job, 60);
              return "needs_reconciliation";
            }
            throw Object.assign(e, { definitivoNaoPublicado: true });
          }
          return concluir(job, post, mediaId, token, publicadasNestaRodada);
        }
        await adiar(job, ESPERA_STATUS_SEG);
        return "processing";
      }

      // 3. Conferir resultado ambíguo SEM reenviar às cegas.
      if (post.estado === "needs_reconciliation") {
        const st = await instagram.statusContainer({ containerId: post.container_id, token });
        if (st.status_code === "FINISHED") { post = await mover(post, "processing", "conferido: não foi publicado; pode publicar"); await adiar(job, 1); return "processing"; }
        if (st.status_code === "PUBLISHED") {
          const recentes = await instagram.midiasRecentes({ igUserId, token, limite: 25 });
          const desde = Date.parse(post.publicacao_pedida_em || post.container_criado_em || post.agendado_utc) - 10 * 60e3;
          const achou = (recentes.data || []).find((m) => (m.caption || "") === (post.legenda || "") && Date.parse(m.timestamp) >= desde);
          if (achou) return concluir(job, post, achou.id, token, publicadasNestaRodada, achou.permalink);
        }
        if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
          return falhaOuNovaTentativa(job, post, new ErroRede("transitorio", `Contêiner ${st.status_code} na conferência; será recriado.`));
        }
        const tent = (post.tentativas || 0) + 1;
        if (tent >= MAX_TENTATIVAS) {
          await mover(post, "failed", "não foi possível confirmar", { tentativas: tent, ultimo_erro: "Não deu para confirmar se publicou. Confira no Instagram antes de reprogramar." });
          await fimJob(job, "concluido"); return "failed";
        }
        await banco.atualizar("posts", post.id, { tentativas: tent }, { versao: post.versao });
        await adiar(job, espera(tent, { aleatorio }));
        return "needs_reconciliation";
      }

      await fimJob(job, "obsoleto");
      return "obsoleto";
    } catch (e) {
      if (!(e instanceof ErroRede)) throw e;
      if (e.tipo === "autenticacao") {
        await banco.atualizar("conexoes", conexao.id, { estado: "reconectar", atualizado_em: agora() });
        const atual = await banco.obter("posts", post.id);
        await mover(atual, "failed", "autorização do Instagram expirou", { ultimo_erro: `Reconecte o Instagram em Ajustes: ${e.message}` });
        await fimJob(job, "concluido");
        return "failed";
      }
      const atual = await banco.obter("posts", post.id);
      if (atual.versao !== job.versao_post) { await fimJob(job, "obsoleto"); return "obsoleto"; }
      return falhaOuNovaTentativa(job, atual, e, { manterContainer: atual.estado === "publishing" || atual.estado === "processing" });
    }
  }

  async function concluir(job, post, mediaId, token, publicadasNestaRodada, permalinkPronto) {
    let permalink = permalinkPronto || null;
    if (!permalink) { try { permalink = (await instagram.midia({ mediaId, token })).permalink || null; } catch { /* tenta de novo depois */ } }
    const novo = await mover(post, "published", `publicado: mídia ${mediaId}`, { media_id: mediaId, permalink, publicado_em: agora(), ultimo_erro: null });
    publicadasNestaRodada.add(post.org_id);
    await fimJob(job, "concluido");
    return novo ? "published" : "obsoleto";
  }

  // Tokens longos duram ~60 dias e só renovam depois de 24 h de emitidos.
  async function renovarTokens() {
    const vencendo = await banco.listar("conexoes", { estado: "ativa", token_expira_em: { lt: mais(10 * 86400) } });
    let n = 0;
    for (const c of vencendo) {
      if (c.simulado || !c.token_cifrado) continue;
      if (c.atualizado_em && Date.parse(agora()) - Date.parse(c.atualizado_em) < 86400e3) continue;
      try {
        const t = await instagram.renovarToken({ token: await decifrar(c.token_cifrado, segredos.chaveCifra), agoraMs: Date.parse(agora()) });
        await banco.atualizar("conexoes", c.id, { token_cifrado: await cifrar(t.token, segredos.chaveCifra), token_expira_em: t.expiraEm, atualizado_em: agora() });
        n++;
      } catch (e) {
        if (e instanceof ErroRede && e.tipo === "autenticacao") await banco.atualizar("conexoes", c.id, { estado: "reconectar", atualizado_em: agora() });
      }
    }
    return n;
  }

  async function rodar({ limite = 10 } = {}) {
    const inicio = agora();
    const jobs = await banco.reivindicarJobs({ agora: inicio, dono, leaseSeg: 300, limite });
    const publicadas = new Set();
    const resultados = [];
    for (const job of jobs) {
      try { resultados.push({ job: job.id, post: job.post_id, resultado: await processar(job, publicadas) }); }
      catch (e) {
        log("erro no job", job.id, e);
        await banco.atualizar("jobs", job.id, { estado: "pendente", executar_em: mais(120), lease_ate: null }, { dono: job.dono, estado: "executando" });
        resultados.push({ job: job.id, post: job.post_id, resultado: "erro_interno", detalhe: String(e && e.message) });
      }
    }
    let renovados = 0;
    try { renovados = await renovarTokens(); } catch (e) { log("renovar tokens", e); }
    try { await banco.inserir("batimentos", { dono, inicio, fim: agora(), jobs: jobs.length, resultado: resultados }); } catch { /* opcional */ }
    return { inicio, fim: agora(), reivindicados: jobs.length, resultados, tokens_renovados: renovados };
  }

  return { rodar, processar };
}
