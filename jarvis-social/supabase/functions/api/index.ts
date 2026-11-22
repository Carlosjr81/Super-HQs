// Edge Function `api` (Deno, Supabase). Só faz a ponte HTTP: autenticação,
// CORS e JSON. Toda a regra mora em ../_compartilhado/api.js (testada no Node).
import { criarApi } from "../_compartilhado/api.js";
import { BancoPostgrest } from "../_compartilhado/banco.js";
import { ArmazenamentoSupabase } from "../_compartilhado/armazenamento.js";
import { criarInstagram, CONFIG_IG } from "../_compartilhado/instagram.js";

const env = (k: string) => Deno.env.get(k) || "";
const URL_SB = env("SUPABASE_URL");
const CHAVE = env("SUPABASE_SERVICE_ROLE_KEY");
const ORIGENS = env("JS_ORIGENS_PERMITIDAS").split(",").map((s) => s.trim()).filter(Boolean);

const api = criarApi({
  banco: new BancoPostgrest({ url: URL_SB, chave: CHAVE }),
  armazenamento: new ArmazenamentoSupabase({ url: URL_SB, chave: CHAVE }),
  instagram: criarInstagram({ config: { ...CONFIG_IG, versao: env("JS_META_VERSAO") || CONFIG_IG.versao } }),
  segredos: {
    appId: env("JS_META_APP_ID"), appSecret: env("JS_META_APP_SECRET"),
    redirectUri: `${URL_SB}/functions/v1/api/v1/instagram/retorno`,
    chaveCifra: env("JS_CHAVE_CIFRA"), urlPainel: env("JS_URL_PAINEL"),
    emailsPermitidos: env("JS_EMAILS_PERMITIDOS").split(",").map((s) => s.trim()).filter(Boolean),
  },
  limites: { videoBytes: Number(env("JS_LIMITE_VIDEO_MB") || 50) * 1048576 },
});

function cors(origem: string | null) {
  const ok = origem && (ORIGENS.includes(origem) || ORIGENS.includes("*"));
  return {
    "Access-Control-Allow-Origin": ok ? origem! : (ORIGENS[0] || ""),
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
    "Vary": "Origin",
  };
}

async function usuarioDoToken(auth: string | null) {
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: CHAVE, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

Deno.serve(async (req) => {
  const c = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
  let corpo = {};
  if (!["GET", "HEAD"].includes(req.method)) {
    const txt = await req.text();
    if (txt.length > 200_000) return new Response(JSON.stringify({ erro: "grande", mensagem: "Pedido grande demais." }), { status: 413, headers: { ...c, "Content-Type": "application/json" } });
    try { corpo = txt ? JSON.parse(txt) : {}; } catch { return new Response(JSON.stringify({ erro: "json", mensagem: "JSON inválido." }), { status: 400, headers: { ...c, "Content-Type": "application/json" } }); }
  }
  const usuario = await usuarioDoToken(req.headers.get("authorization"));
  const r = await api.tratar({ metodo: req.method, caminho, consulta: Object.fromEntries(url.searchParams), corpo, usuario });
  if (r.excecao) console.error("api:", r.excecao);
  if (r.redirecionar) return new Response(null, { status: 302, headers: { ...c, Location: r.redirecionar } });
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { ...c, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
});
