// Armazenamento de mídia. Produção: Supabase Storage, bucket PRIVADO
// "midias", caminho sempre "<org_id>/<midia_id>.<ext>". O navegador envia por
// URL de upload assinada (criada pela API depois de conferir a organização) e
// a Meta busca o vídeo por URL assinada temporária, criada na hora do envio.
export const BUCKET = "midias";

export class ArmazenamentoSupabase {
  constructor({ url, chave, fetch: f = globalThis.fetch }) { this.base = url.replace(/\/$/, "") + "/storage/v1"; this.publico = url.replace(/\/$/, ""); this.chave = chave; this.f = f; }
  _cab(extra = {}) { return { apikey: this.chave, Authorization: `Bearer ${this.chave}`, ...extra }; }
  async criarUploadAssinado(caminho) {
    const r = await this.f(`${this.base}/object/upload/sign/${BUCKET}/${caminho}`, { method: "POST", headers: this._cab({ "Content-Type": "application/json", "x-upsert": "true" }), body: "{}" });
    const j = await r.json();
    if (!r.ok) throw new Error("Storage: não criou o upload assinado: " + (j.message || r.status));
    return { url: `${this.base}${j.url.startsWith("/object") ? "" : "/object"}${j.url.replace(/^\/storage\/v1/, "")}`, metodo: "PUT" };
  }
  // Tamanho real do objeto. HEAD no objeto autenticado (Content-Length) é o
  // caminho mais estável da API do Storage; a rota /info fica de reserva.
  async info(caminho) {
    const h = await this.f(`${this.base}/object/authenticated/${BUCKET}/${caminho}`, { method: "HEAD", headers: this._cab() });
    if (h.ok && h.headers.get("content-length")) return { tamanho: Number(h.headers.get("content-length")), mime: h.headers.get("content-type") };
    const r = await this.f(`${this.base}/object/info/${BUCKET}/${caminho}`, { headers: this._cab() });
    if (r.status === 404 || r.status === 400) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Storage: " + (j.message || r.status));
    return { tamanho: Number(j.size ?? (j.metadata && j.metadata.size)), mime: j.content_type || (j.metadata && j.metadata.mimetype) };
  }
  async urlAssinada(caminho, segundos) {
    const r = await this.f(`${this.base}/object/sign/${BUCKET}/${caminho}`, { method: "POST", headers: this._cab({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: segundos }) });
    const j = await r.json();
    if (!r.ok) throw new Error("Storage: não assinou a URL: " + (j.message || r.status));
    return `${this.base}${j.signedURL.replace(/^\/storage\/v1/, "")}`;
  }
}

// Memória (testes e demonstração): guarda só o tamanho e o tipo.
export class ArmazenamentoMemoria {
  constructor() { this.objetos = new Map(); }
  async criarUploadAssinado(caminho) { return { url: `memoria://${caminho}`, metodo: "PUT" }; }
  receber(caminho, tamanho, mime) { this.objetos.set(caminho, { tamanho, mime }); }
  async info(caminho) { return this.objetos.get(caminho) || null; }
  async urlAssinada(caminho, segundos) { return `memoria://${caminho}?expira=${segundos}`; }
}
