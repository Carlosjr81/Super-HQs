// Edge Function `worker`: chamada a cada minuto pelo pg_cron (e, de reserva,
// pelo GitHub Actions). Exige o cabeçalho x-jarvis-worker = JS_SEGREDO_WORKER.
import { criarWorker } from "../_compartilhado/worker.js";
import { BancoPostgrest } from "../_compartilhado/banco.js";
import { ArmazenamentoSupabase } from "../_compartilhado/armazenamento.js";
import { criarInstagram, CONFIG_IG } from "../_compartilhado/instagram.js";
import { iguaisTempoConstante } from "../_compartilhado/cifra.js";

const env = (k: string) => Deno.env.get(k) || "";
const URL_SB = env("SUPABASE_URL");
const CHAVE = env("SUPABASE_SERVICE_ROLE_KEY");
const SEGREDO = env("JS_SEGREDO_WORKER");

Deno.serve(async (req) => {
  const dado = req.headers.get("x-jarvis-worker") || "";
  if (!SEGREDO || SEGREDO.length < 24 || !iguaisTempoConstante(dado, SEGREDO)) return new Response("negado", { status: 401 });
  const worker = criarWorker({
    banco: new BancoPostgrest({ url: URL_SB, chave: CHAVE }),
    armazenamento: new ArmazenamentoSupabase({ url: URL_SB, chave: CHAVE }),
    instagram: criarInstagram({ config: { ...CONFIG_IG, versao: env("JS_META_VERSAO") || CONFIG_IG.versao } }),
    segredos: { chaveCifra: env("JS_CHAVE_CIFRA") },
    dono: "worker-" + crypto.randomUUID(),
    registrar: (...a: unknown[]) => console.error(...a),
  });
  const r = await worker.rodar();
  return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
});
