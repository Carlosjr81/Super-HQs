// Adaptador oficial: "Instagram API com login do Instagram" (conta profissional,
// sem página do Facebook). Hosts, versão e permissões ficam em CONFIG para
// serem revalidados na documentação vigente antes do teste real
// (docs/MAPEAMENTO_FUNCIONAL.md registra o que foi verificado e quando).
//
// O Instagram NÃO tem agendamento nativo pela API: o Jarvis guarda a fila e,
// na hora, cria o contêiner do Reel, espera o processamento e publica. Só
// chamamos de "publicado" depois de receber o ID da mídia e ler o permalink.
export const CONFIG_IG = {
  versao: "v23.0",                    // A REVALIDAR na documentação da Meta
  hostGraph: "https://graph.instagram.com",
  hostAuth: "https://www.instagram.com/oauth/authorize",
  hostToken: "https://api.instagram.com/oauth/access_token",
  escopos: ["instagram_business_basic", "instagram_business_content_publish"],
};

export class ErroRede extends Error {
  // tipo: transitorio | permanente | limite | autenticacao | ambiguo
  constructor(tipo, mensagem, { codigo, subcodigo, status, esperarSeg } = {}) {
    super(mensagem); this.tipo = tipo; this.codigo = codigo; this.subcodigo = subcodigo; this.status = status; this.esperarSeg = esperarSeg;
  }
}

// Classificação dos erros da Graph API. Códigos conhecidos: 190 token
// inválido/expirado; 4, 17, 32, 613 limites; 1, 2 erros temporários.
export function classificarErro(status, corpo, cabecalhos = {}) {
  const e = (corpo && corpo.error) || {};
  const codigo = e.code, sub = e.error_subcode;
  const ra = Number(cabecalhos["retry-after"]);
  const esperarSeg = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  const msg = e.error_user_msg || e.message || `HTTP ${status}`;
  if (codigo === 190 || status === 401) return new ErroRede("autenticacao", msg, { codigo, subcodigo: sub, status });
  if ([4, 17, 32, 613].includes(codigo) || status === 429) return new ErroRede("limite", msg, { codigo, subcodigo: sub, status, esperarSeg: esperarSeg || 3600 });
  if ([1, 2].includes(codigo) || e.is_transient || status >= 500) return new ErroRede("transitorio", msg, { codigo, subcodigo: sub, status, esperarSeg });
  return new ErroRede("permanente", msg, { codigo, subcodigo: sub, status });
}

export function criarInstagram({ fetch: f = globalThis.fetch, config = CONFIG_IG, tempoLimiteMs = 30000 } = {}) {
  const base = `${config.hostGraph}/${config.versao}`;

  async function chamar(metodo, caminho, params, { host = base, ambiguoSeFalhar = false } = {}) {
    const url = new URL(host + caminho);
    let corpo;
    if (metodo === "GET") for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
    else corpo = new URLSearchParams(params || {});
    let resp;
    try {
      resp = await f(url.toString(), { method: metodo, body: corpo, signal: AbortSignal.timeout ? AbortSignal.timeout(tempoLimiteMs) : undefined });
    } catch (err) {
      // Sem resposta: num pedido que muda algo do lado da rede, não sabemos
      // se ele chegou. Quem chama decide (publicar vira "conferir").
      throw new ErroRede(ambiguoSeFalhar ? "ambiguo" : "transitorio", "Sem resposta do Instagram: " + (err && err.message));
    }
    let json = null;
    try { json = await resp.json(); } catch { json = null; }
    if (!resp.ok || (json && json.error)) {
      const cab = {}; resp.headers && resp.headers.forEach && resp.headers.forEach((v, k) => { cab[k.toLowerCase()] = v; });
      if (ambiguoSeFalhar && resp.status >= 500) throw new ErroRede("ambiguo", `Instagram respondeu ${resp.status} ao publicar`, { status: resp.status });
      throw classificarErro(resp.status, json, cab);
    }
    return json;
  }

  return {
    config,
    urlAutorizacao({ appId, redirectUri, estado }) {
      const u = new URL(config.hostAuth);
      u.searchParams.set("client_id", appId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", config.escopos.join(","));
      u.searchParams.set("state", estado);
      return u.toString();
    },
    // code -> token curto -> token longo (~60 dias). Devolve { token, expiraEm, igUserId, permissoes }
    async trocarCodigo({ appId, appSecret, redirectUri, codigo, agoraMs }) {
      const curto = await chamar("POST", "", { client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: codigo }, { host: config.hostToken });
      const dados = curto.data ? curto.data[0] : curto;
      const longo = await chamar("GET", "/access_token", { grant_type: "ig_exchange_token", client_secret: appSecret, access_token: dados.access_token }, { host: config.hostGraph });
      return {
        token: longo.access_token,
        expiraEm: new Date(agoraMs + (longo.expires_in || 0) * 1000).toISOString(),
        igUserId: String(dados.user_id),
        permissoes: dados.permissions || null,
      };
    },
    async renovarToken({ token, agoraMs }) {
      const r = await chamar("GET", "/refresh_access_token", { grant_type: "ig_refresh_token", access_token: token }, { host: config.hostGraph });
      return { token: r.access_token, expiraEm: new Date(agoraMs + (r.expires_in || 0) * 1000).toISOString() };
    },
    perfil({ token }) {
      return chamar("GET", "/me", { fields: "user_id,username,account_type", access_token: token });
    },
    cota({ igUserId, token }) {
      return chamar("GET", `/${igUserId}/content_publishing_limit`, { fields: "quota_usage,config", access_token: token });
    },
    // Reel: contêiner com o vídeo numa URL temporária que a Meta busca.
    async criarContainerReel({ igUserId, token, videoUrl, legenda, capaUrl, compartilharNoFeed = true }) {
      const p = { media_type: "REELS", video_url: videoUrl, caption: legenda || "", share_to_feed: String(compartilharNoFeed), access_token: token };
      if (capaUrl) p.cover_url = capaUrl;
      const r = await chamar("POST", `/${igUserId}/media`, p);
      return { containerId: String(r.id) };
    },
    // status_code: IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
    statusContainer({ containerId, token }) {
      return chamar("GET", `/${containerId}`, { fields: "status_code,status", access_token: token });
    },
    async publicar({ igUserId, token, containerId }) {
      const r = await chamar("POST", `/${igUserId}/media_publish`, { creation_id: containerId, access_token: token }, { ambiguoSeFalhar: true });
      return { mediaId: String(r.id) };
    },
    midia({ mediaId, token }) {
      return chamar("GET", `/${mediaId}`, { fields: "id,permalink,timestamp,media_type,caption", access_token: token });
    },
    midiasRecentes({ igUserId, token, limite = 10 }) {
      return chamar("GET", `/${igUserId}/media`, { fields: "id,permalink,timestamp,caption", limit: String(limite), access_token: token });
    },
  };
}

// Simulador para testes e para a DEMONSTRAÇÃO. Tudo que ele devolve vem
// marcado `simulado: true` e a tela mostra isso. Nunca é usado em produção.
export function criarInstagramSimulado({ falhas = {}, agora = () => new Date().toISOString() } = {}) {
  let n = 1000; const containers = new Map(); const publicadas = [];
  const falhar = (op) => { const f = falhas[op]; if (f && f.length) { const e = f.shift(); if (e) throw e; } };
  return {
    simulado: true, publicadas, containers,
    config: { ...CONFIG_IG, simulado: true },
    urlAutorizacao: () => "about:blank#simulado",
    async trocarCodigo() { return { token: "simulado", expiraEm: "2099-01-01T00:00:00.000Z", igUserId: "17840000000000000", permissoes: CONFIG_IG.escopos }; },
    async renovarToken({ agoraMs }) { return { token: "simulado", expiraEm: new Date(agoraMs + 60 * 864e5).toISOString() }; },
    async perfil() { return { user_id: "17840000000000000", username: "conta_simulada", account_type: "BUSINESS" }; },
    async cota() { falhar("cota"); return { data: [{ quota_usage: publicadas.length, config: { quota_total: 50, quota_duration: 86400 } }] }; },
    async criarContainerReel({ legenda }) { falhar("criar"); const id = String(++n); containers.set(id, { status: "IN_PROGRESS", legenda, checagens: 0 }); return { containerId: id }; },
    async statusContainer({ containerId }) {
      falhar("status");
      const c = containers.get(containerId); if (!c) return { status_code: "EXPIRED" };
      if (c.status === "IN_PROGRESS" && ++c.checagens >= 1) c.status = "FINISHED";
      return { status_code: c.status };
    },
    async publicar({ containerId }) {
      const c = containers.get(containerId);
      if (c && c.status === "PUBLISHED") throw new ErroRede("permanente", "contêiner já publicado");
      const f = falhas.publicar && falhas.publicar.length ? falhas.publicar.shift() : null;
      const id = String(++n);
      if (f && f.depoisDePublicar) { c.status = "PUBLISHED"; publicadas.push({ id, containerId, legenda: c.legenda, timestamp: agora() }); throw f.erro; }
      if (f) throw f;
      c.status = "PUBLISHED"; publicadas.push({ id, containerId, legenda: c.legenda, timestamp: agora() });
      return { mediaId: id };
    },
    async midia({ mediaId }) { return { id: mediaId, permalink: `https://www.instagram.com/reel/SIMULADO${mediaId}/`, media_type: "VIDEO" }; },
    async midiasRecentes() { return { data: publicadas.slice().reverse().map((p) => ({ id: p.id, caption: p.legenda, timestamp: p.timestamp, permalink: `https://www.instagram.com/reel/SIMULADO${p.id}/` })) }; },
  };
}
