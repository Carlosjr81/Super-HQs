// Roda as suítes e devolve um resumo (veio do Treino Livre).
//
//   node testes/rodar.js
//
// Os testes não abrem navegador: recortam as funções do próprio index.html e
// exercitam com dados escritos. Provam que a lógica não quebrou, não que a
// tela funciona: para isso, `node testes/servir.js` e abrir no navegador.
const { execFileSync } = require("child_process");
const path = require("path");
const { caminhoDoApp } = require("./app");

const SUITES = [
  ["teste-acesso", "login com aprovação, termos, cobrança e o painel do dono"],
  ["teste-estante", "a estante: tipo pelos bytes, páginas do CBZ, título, busca e leitura"],
];

console.log("app: " + caminhoDoApp() + "\n");

let totalOk = 0, totalMal = 0, quebrados = 0;
for (const [nome, oque] of SUITES) {
  let saida = "";
  try {
    saida = execFileSync(process.execPath, [path.join(__dirname, nome + ".js")], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    saida = (e.stdout || "") + (e.stderr || "");
  }
  // A ÚLTIMA ocorrência do placar: uma suíte que imprima um placar no meio
  // faria o total sair menor sem ninguém notar.
  const todas = saida.match(/(\d+) passou \/ (\d+) falhou/g);
  const m = todas && todas.length ? todas[todas.length - 1].match(/(\d+) passou \/ (\d+) falhou/) : null;
  if (!m) {
    quebrados++;
    console.log("  !!  " + nome.padEnd(22) + "nao rodou");
    console.log(saida.split("\n").slice(-6).map((l) => "        " + l).join("\n"));
    continue;
  }
  const ok = +m[1], mal = +m[2];
  totalOk += ok; totalMal += mal;
  console.log((mal ? "  X   " : "  ok  ") + nome.padEnd(22) + String(ok + "/" + (ok + mal)).padEnd(8) + oque);
  if (mal) console.log(saida.split("\n").filter((l) => /^\s+X/.test(l)).map((l) => "      " + l.trim()).join("\n"));
}

console.log("\n" + totalOk + " passou / " + totalMal + " falhou" +
  (quebrados ? "  (" + quebrados + " suite(s) nem rodaram)" : ""));
process.exit(totalMal || quebrados ? 1 : 0);
