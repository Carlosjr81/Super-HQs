// Prova a migração num PostgreSQL de verdade (cluster temporário). Sem os
// binários do PostgreSQL na máquina, a suíte avisa e passa sem rodar.
import { teste, igual, verdade, rodar } from "./base.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

const BIN = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/15/bin"].find((d) => fs.existsSync(d + "/initdb"));
const MIGRACAO = new URL("../supabase/migrations/20261122000000_inicial.sql", import.meta.url).pathname;

if (!BIN) { console.log("aviso: PostgreSQL ausente; suíte SQL não rodou (roda no Actions)"); console.log("\n0 passou / 0 falhou"); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsql-"));
const raiz = process.getuid && process.getuid() === 0;
const comoPg = (cmd, args, opts = {}) => raiz ? execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { encoding: "utf8", ...opts }) : execFileSync(cmd, args, { encoding: "utf8", ...opts });
if (raiz) execFileSync("chown", ["postgres", dir]);
const porta = String(55000 + Math.floor(Math.random() * 1000));
comoPg(BIN + "/initdb", ["-D", dir + "/d", "-U", "postgres", "-A", "trust"], { stdio: "ignore" });
comoPg(BIN + "/pg_ctl", ["-D", dir + "/d", "-o", `-p ${porta} -k ${dir} -c listen_addresses=''`, "-l", dir + "/log", "-w", "start"], { stdio: "ignore" });
const psql = (sql) => comoPg("psql", ["-h", dir, "-p", porta, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql]).trim();
process.on("exit", () => { try { comoPg(BIN + "/pg_ctl", ["-D", dir + "/d", "-m", "immediate", "stop"], { stdio: "ignore" }); } catch {} });

teste("a migração aplica sem erro", () => {
  comoPg("psql", ["-h", dir, "-p", porta, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", MIGRACAO]);
  verdade(psql("select count(*) from posts") === "0");
});
teste("idempotência no banco: (org, chave) única", () => {
  psql(`insert into organizacoes(id,nome) values ('00000000-0000-0000-0000-000000000001','A'),('00000000-0000-0000-0000-000000000002','B')`);
  psql(`insert into posts(org_id,estado,chave_idempotencia,hash_pedido) values ('00000000-0000-0000-0000-000000000001','draft','k','h')`);
  const r = spawnSync(raiz ? "runuser" : "psql", [...(raiz ? ["-u", "postgres", "--", "psql"] : []), "-h", dir, "-p", porta, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `insert into posts(org_id,estado,chave_idempotencia,hash_pedido) values ('00000000-0000-0000-0000-000000000001','draft','k','h')`], { encoding: "utf8" });
  verdade(r.status !== 0 && /23505|duplicate/.test(r.stderr), r.stderr);
  psql(`insert into posts(org_id,estado,chave_idempotencia,hash_pedido) values ('00000000-0000-0000-0000-000000000002','draft','k','h')`);
});
teste("estado inválido recusado pelo banco", () => {
  const r = spawnSync(raiz ? "runuser" : "psql", [...(raiz ? ["-u", "postgres", "--", "psql"] : []), "-h", dir, "-p", porta, "-U", "postgres", "-c", `insert into posts(org_id,estado,chave_idempotencia,hash_pedido) values ('00000000-0000-0000-0000-000000000001','publicado_talvez','z','h')`], { encoding: "utf8" });
  verdade(r.status !== 0 || /violates check/.test(r.stderr), r.stderr);
});
teste("reivindicar_jobs: vencidos, lease, fila pausada e sem pegar duas vezes", () => {
  const p = psql(`select id from posts where org_id='00000000-0000-0000-0000-000000000001' limit 1`);
  const p2 = psql(`select id from posts where org_id='00000000-0000-0000-0000-000000000002' limit 1`);
  psql(`insert into jobs(org_id,post_id,versao_post,estado,executar_em) select '00000000-0000-0000-0000-000000000001','${p}',1,'pendente', '2026-11-23T13:00:00Z'::timestamptz + (g || ' min')::interval from generate_series(0,9) g`);
  psql(`insert into jobs(org_id,post_id,versao_post,estado,executar_em) values ('00000000-0000-0000-0000-000000000002','${p2}',1,'pendente','2026-11-23T12:00:00Z')`);
  psql(`update organizacoes set fila_pausada=true where id='00000000-0000-0000-0000-000000000002'`);
  const a = psql(`select count(*) from reivindicar_jobs('2026-11-23T13:04:30Z','w1',300,3)`);
  const b = psql(`select count(*) from reivindicar_jobs('2026-11-23T13:04:30Z','w2',300,10)`);
  igual([a, b], ["3", "2"], "5 vencidos, nenhum repetido, pausada fora");
  igual(psql(`select count(*) from jobs where estado='executando' and org_id='00000000-0000-0000-0000-000000000002'`), "0");
  const c = psql(`select count(*) from reivindicar_jobs('2026-11-23T13:09:00Z','w3',300,10)`);
  igual(c, "5", "sem lease vencido: só os 5 novos vencidos");
  const d = psql(`select count(*) from reivindicar_jobs('2026-11-23T13:20:00Z','w4',300,20)`);
  igual(d, "10", "leases vencidos voltam");
});
teste("concorrência real: duas sessões simultâneas nunca dividem um job", async () => {
  psql(`update jobs set estado='pendente', lease_ate=null, dono=null`);
  psql(`insert into jobs(org_id,post_id,versao_post,estado,executar_em) select org_id,post_id,1,'pendente','2026-11-23T13:00:00Z' from jobs limit 1`);
  const { spawn } = await import("node:child_process");
  const roda = (dono) => new Promise((res) => {
    const args = ["-h", dir, "-p", porta, "-U", "postgres", "-qAt", "-c", `select id from reivindicar_jobs('2026-11-24T00:00:00Z','${dono}',300,100)`];
    const pr = raiz ? spawn("runuser", ["-u", "postgres", "--", "psql", ...args]) : spawn("psql", args);
    let s = ""; pr.stdout.on("data", (d) => (s += d)); pr.on("close", () => res(s.trim().split("\n").filter(Boolean)));
  });
  const [x, y] = await Promise.all([roda("x"), roda("y")]);
  const todos = [...x, ...y];
  igual(new Set(todos).size, todos.length); igual(todos.length, Number(psql(`select count(*) from jobs where org_id='00000000-0000-0000-0000-000000000001'`)));
});
teste("RLS ligada em todas as tabelas", () => igual(psql(`select count(*) from pg_tables where schemaname='public' and not rowsecurity`), "0"));

rodar("SQL: migração, unicidade, reivindicação de jobs e RLS (PostgreSQL real)");
