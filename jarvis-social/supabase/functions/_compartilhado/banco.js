// Contrato do banco usado pela API e pelo worker. Duas implementações:
//  - BancoMemoria: testes e a DEMONSTRAÇÃO no navegador (localStorage);
//  - BancoPostgrest: produção (Supabase/PostgreSQL pela REST, chave de serviço).
// A garantia de concorrência NÃO depende de transação entre chamadas: toda
// mudança de post é condicionada à versão (`atualizar(..., { versao })`) e o
// worker só age se a versão do job for a do post. A reivindicação de jobs é
// uma função SQL com FOR UPDATE SKIP LOCKED (uma transação só).
export class ErroBanco extends Error { constructor(codigo, msg) { super(msg); this.codigo = codigo; } }

const UNICOS = {
  posts: [["org_id", "chave_idempotencia"]],
  membros: [["org_id", "usuario_id"]],
  conexoes: [["org_id", "ig_user_id"]],
};

function casa(obj, filtros) {
  for (const [k, cond] of Object.entries(filtros || {})) {
    const v = obj[k];
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      if ("gte" in cond && !(v != null && v >= cond.gte)) return false;
      if ("gt" in cond && !(v != null && v > cond.gt)) return false;
      if ("lte" in cond && !(v != null && v <= cond.lte)) return false;
      if ("lt" in cond && !(v != null && v < cond.lt)) return false;
      if ("in" in cond && !cond.in.includes(v)) return false;
      if ("neq" in cond && v === cond.neq) return false;
      if ("nulo" in cond && (cond.nulo ? v != null : v == null)) return false;
    } else if (v !== cond && !(v == null && cond == null)) return false;
  }
  return true;
}

const novoId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export class BancoMemoria {
  constructor(estado = null, aoMudar = null) {
    this.t = estado || {};
    this.aoMudar = aoMudar;
  }
  _tab(n) { return (this.t[n] ||= []); }
  _salvar() { if (this.aoMudar) this.aoMudar(this.t); }
  async obter(tabela, id) { const o = this._tab(tabela).find((x) => x.id === id); return o ? structuredClone(o) : null; }
  async listar(tabela, filtros = {}, { ordem, desc = false, limite } = {}) {
    let r = this._tab(tabela).filter((o) => casa(o, filtros));
    if (ordem) r.sort((a, b) => (String(a[ordem] ?? "") < String(b[ordem] ?? "") ? -1 : String(a[ordem] ?? "") > String(b[ordem] ?? "") ? 1 : 0) * (desc ? -1 : 1));
    if (limite) r = r.slice(0, limite);
    return structuredClone(r);
  }
  async inserir(tabela, obj) {
    const o = { id: novoId(), ...structuredClone(obj) };
    for (const campos of UNICOS[tabela] || []) {
      if (campos.some((c) => o[c] == null)) continue;
      if (this._tab(tabela).some((x) => campos.every((c) => x[c] === o[c]))) throw new ErroBanco("conflito_unico", `${tabela}: ${campos.join("+")} repetido`);
    }
    this._tab(tabela).push(o); this._salvar();
    return structuredClone(o);
  }
  async atualizar(tabela, id, mudancas, condicao = {}) {
    const o = this._tab(tabela).find((x) => x.id === id);
    if (!o || !casa(o, condicao)) return null;
    Object.assign(o, structuredClone(mudancas)); this._salvar();
    return structuredClone(o);
  }
  async reivindicarJobs({ agora, dono, leaseSeg = 300, limite = 5 }) {
    const pausadas = new Set(this._tab("organizacoes").filter((o) => o.fila_pausada).map((o) => o.id));
    const lease = new Date(Date.parse(agora) + leaseSeg * 1000).toISOString();
    const livres = this._tab("jobs")
      .filter((j) => !pausadas.has(j.org_id) && ((j.estado === "pendente" && j.executar_em <= agora) || (j.estado === "executando" && j.lease_ate < agora)))
      .sort((a, b) => a.executar_em.localeCompare(b.executar_em))
      .slice(0, limite);
    for (const j of livres) Object.assign(j, { estado: "executando", lease_ate: lease, dono, tentativas: (j.tentativas || 0) + 1 });
    if (livres.length) this._salvar();
    return structuredClone(livres);
  }
}

// O PostgreSQL devolve "2026-11-23T13:00:00+00:00"; o resto do código compara
// ISO em UTC com "Z". Converte na entrada para um formato só.
const RE_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
export function normalizarDatas(v) {
  if (Array.isArray(v)) return v.map(normalizarDatas);
  if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = normalizarDatas(v[k]); return v; }
  if (typeof v === "string" && RE_TS.test(v)) return new Date(v).toISOString();
  return v;
}

// PostgREST (Supabase). `url` = https://<ref>.supabase.co, `chave` = service role
// (só no servidor: ignora RLS, por isso a API confere org/membro em todo pedido).
export class BancoPostgrest {
  constructor({ url, chave, fetch: f = globalThis.fetch }) { this.url = url.replace(/\/$/, "") + "/rest/v1"; this.chave = chave; this.f = f; }
  _cab(extra = {}) { return { apikey: this.chave, Authorization: `Bearer ${this.chave}`, "Content-Type": "application/json", ...extra }; }
  _filtros(filtros) {
    const q = [];
    const val = (v) => (typeof v === "boolean" ? String(v) : encodeURIComponent(String(v)));
    for (const [k, c] of Object.entries(filtros || {})) {
      if (c === null) q.push(`${k}=is.null`);
      else if (typeof c === "object" && !Array.isArray(c)) {
        if ("gte" in c) q.push(`${k}=gte.${val(c.gte)}`);
        if ("gt" in c) q.push(`${k}=gt.${val(c.gt)}`);
        if ("lte" in c) q.push(`${k}=lte.${val(c.lte)}`);
        if ("lt" in c) q.push(`${k}=lt.${val(c.lt)}`);
        if ("neq" in c) q.push(`${k}=neq.${val(c.neq)}`);
        if ("in" in c) q.push(`${k}=in.(${c.in.map((x) => `"${String(x).replace(/"/g, "")}"`).map(encodeURIComponent).join(",")})`);
        if ("nulo" in c) q.push(`${k}=${c.nulo ? "is.null" : "not.is.null"}`);
      } else q.push(`${k}=eq.${val(c)}`);
    }
    return q;
  }
  async _req(metodo, caminho, corpo, cab) {
    const r = await this.f(this.url + caminho, { method: metodo, headers: this._cab(cab), body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const txt = await r.text();
    const json = txt ? normalizarDatas(JSON.parse(txt)) : null;
    if (!r.ok) {
      if (json && json.code === "23505") throw new ErroBanco("conflito_unico", json.message);
      throw new ErroBanco("erro_banco", `${metodo} ${caminho}: ${r.status} ${json && json.message}`);
    }
    return json;
  }
  async obter(tabela, id) { const r = await this._req("GET", `/${tabela}?id=eq.${encodeURIComponent(id)}&limit=1`); return r[0] || null; }
  async listar(tabela, filtros = {}, { ordem, desc = false, limite } = {}) {
    const q = this._filtros(filtros);
    if (ordem) q.push(`order=${ordem}.${desc ? "desc" : "asc"}`);
    if (limite) q.push(`limit=${limite}`);
    return this._req("GET", `/${tabela}?${q.join("&")}`);
  }
  async inserir(tabela, obj) { const r = await this._req("POST", `/${tabela}`, obj, { Prefer: "return=representation" }); return r[0]; }
  async atualizar(tabela, id, mudancas, condicao = {}) {
    const q = [`id=eq.${encodeURIComponent(id)}`, ...this._filtros(condicao)];
    const r = await this._req("PATCH", `/${tabela}?${q.join("&")}`, mudancas, { Prefer: "return=representation" });
    return r[0] || null;
  }
  async reivindicarJobs({ agora, dono, leaseSeg = 300, limite = 5 }) {
    return this._req("POST", "/rpc/reivindicar_jobs", { p_agora: agora, p_dono: dono, p_lease_seg: leaseSeg, p_limite: limite });
  }
}
