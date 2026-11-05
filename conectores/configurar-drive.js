// Propaga a origem primária para o pacote das Functions e o frontend.
// Não acessa o Drive, não publica arquivos e não lê credenciais.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const RAIZ = path.join(__dirname, "..");

function configuracao(config) {
  const d = config.drive;
  if (config.fontePrimaria !== "drive" || !d || d.projeto !== "super-hqs"
      || !/^[\w-]{10,}$/.test(d.pastaId || "") || !/^[a-z]+-[a-z]+\d$/.test(d.regiao || "")) {
    throw Error("Configuração da origem primária do Drive inválida.");
  }
  const base = "https://" + d.regiao + "-" + d.projeto + ".cloudfunctions.net/";
  return { pastaId: d.pastaId, projeto: d.projeto, regiao: d.regiao,
    endpoints: { baixar: base + "baixarEdicao", indexar: base + "indexarAcervo" } };
}

function preparar(raiz = RAIZ, conferir = false) {
  const d = configuracao(JSON.parse(fs.readFileSync(path.join(raiz, "conectores/config.json"), "utf8")));
  const arquivo = path.join(raiz, "functions/configuracao-drive.json");
  const json = JSON.stringify(d, null, 2) + "\n";
  const app = path.join(raiz, "index.html");
  const antes = fs.readFileSync(app, "utf8");
  if (!/const FIREBASE_DRIVE = [^;]+;/.test(antes)) throw Error("Configuração do frontend não encontrada.");
  const depois = antes.replace(/const FIREBASE_DRIVE = [^;]+;/, "const FIREBASE_DRIVE = " + JSON.stringify(d.endpoints) + ";");
  if (conferir) {
    if (!fs.existsSync(arquivo) || fs.readFileSync(arquivo, "utf8") !== json || antes !== depois) {
      throw Error("Origem divergente. Execute node conectores/configurar-drive.js e atualize as três versões do app.");
    }
  } else {
    fs.writeFileSync(arquivo, json);
    fs.writeFileSync(app, depois);
  }
  return d;
}
if (require.main === module) {
  try { preparar(RAIZ, process.argv.includes("--conferir")); console.log("Configuração do Drive conferida."); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { configuracao, preparar };
