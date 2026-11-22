// Todas as suítes do Jarvis Social:  node jarvis-social/testes/rodar.mjs
// (sem npm install: o projeto não tem dependências, de propósito)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const aqui = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  ["teste-nucleo", "fusos, frequência, comandos, estados, cifra"],
  ["teste-api", "agendamento, isolamento, idempotência, frequência, comandos, OAuth"],
  ["teste-worker", "publicação, reconciliação, falhas, lease, atraso"],
  ["teste-sql", "migração e fila no PostgreSQL real"],
  ["teste-web", "painel: sintaxe, PWA, demonstração rotulada"],
];
let ok = 0, mal = 0, quebrou = 0;
for (const [nome, oque] of SUITES) {
  let s = "";
  try { s = execFileSync(process.execPath, [path.join(aqui, nome + ".mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { s = (e.stdout || "") + (e.stderr || ""); }
  const m = [...s.matchAll(/(\d+) passou \/ (\d+) falhou/g)].pop();
  if (!m) { quebrou++; console.log("  !!  " + nome.padEnd(14) + "não rodou\n" + s.split("\n").slice(-8).join("\n")); continue; }
  ok += +m[1]; mal += +m[2];
  console.log((+m[2] ? "  X   " : "  ok  ") + nome.padEnd(14) + `${m[1]}/${+m[1] + +m[2]}`.padEnd(8) + oque);
  if (+m[2]) console.log(s.split("\n").filter((l) => /^\s+X/.test(l)).join("\n"));
}
console.log(`\n${ok} passou / ${mal} falhou` + (quebrou ? `  (${quebrou} suíte(s) não rodaram)` : ""));
process.exit(mal || quebrou ? 1 : 0);
