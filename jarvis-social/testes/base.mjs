// Mini harness (mesmo placar do Treino Livre/Super HQs: "N passou / M falhou").
let ok = 0, mal = 0;
const fila = [];
export function teste(nome, fn) { fila.push([nome, fn]); }
export function igual(a, b, msg = "") {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} esperado ${B}, veio ${A}`);
}
export function verdade(v, msg = "condição falsa") { if (!v) throw new Error(msg); }
export async function rejeita(p, codigo) {
  try { await p; } catch (e) { if (codigo && e.codigo !== codigo) throw new Error(`erro ${e.codigo} ≠ ${codigo}`); return e; }
  throw new Error("deveria ter falhado" + (codigo ? ` (${codigo})` : ""));
}
export async function rodar(titulo) {
  console.log(titulo);
  for (const [nome, fn] of fila) {
    try { await fn(); ok++; console.log("  ok  " + nome); }
    catch (e) { mal++; console.log("  X   " + nome + "\n        " + (e && e.stack || e).toString().split("\n").slice(0, 3).join("\n        ")); }
  }
  console.log(`\n${ok} passou / ${mal} falhou`);
  process.exitCode = mal ? 1 : 0;
}
