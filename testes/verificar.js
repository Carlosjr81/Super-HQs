// A conferida antes de publicar: as formas de o app parar de funcionar.
//
//   node testes/verificar.js
//
// Os 510 testes provam que a LÓGICA não quebrou. Isto prova que o app ainda
// ABRE — que é outra coisa, e é a que deixa todo mundo na mão. Cada checagem
// aqui corresponde a um jeito real de derrubar o app:
//
//   1. Erro de sintaxe no JSX  -> Babel não compila -> tela branca para todos.
//   2. Hash SRI errado         -> o navegador recusa o React -> nada carrega.
//   3. Versão não subida       -> o conserto nunca chega ao celular de ninguém.
//   4. URL do sw.js diferente  -> o cache guarda um endereço que ninguém pede.
//   5. Arquivo do cache ausente-> o modo offline instala quebrado.
//
// O que depende de rede (hash SRI e compilar com o Babel de verdade) vira
// AVISO quando não há rede, não erro: travar a publicação por falta de internet
// seria trocar um problema por outro. Com rede, é checagem de verdade.
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { caminhoDoApp } = require("./app");

const APP = caminhoDoApp();
const RAIZ = path.dirname(APP);
const html = fs.readFileSync(APP, "utf8");

let erros = 0, avisos = 0;
const ok = (m) => console.log("  ok    " + m);
const erro = (m) => { erros++; console.log("  ERRO  " + m); };
const aviso = (m) => { avisos++; console.log("  aviso " + m); };
const titulo = (m) => console.log("\n" + m);

// ------------------------------------------------------------ 1. as versões
titulo("1. As três versões");
// A regra existe porque um conserto ficou horas publicado sem chegar ao
// celular do dono, e o diagnóstico apontava para um defeito já corrigido.
const mApp = html.match(/VERSAO_APP\s*=\s*"([^"]+)"/);
const mSw = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8").match(/CACHE\s*=\s*"(superhqs-v\d+)"/);
let mJson = null;
try { mJson = JSON.parse(fs.readFileSync(path.join(RAIZ, "versao.json"), "utf8")).versao; } catch (e) {}

if (!mApp) erro("não achei VERSAO_APP no index.html");
if (!mSw) erro("não achei CACHE no sw.js");
if (!mJson) erro("não consegui ler versao.json");

if (mApp && mJson) {
  if (mApp[1] === mJson) ok("index.html e versao.json: " + mJson);
  else erro("index.html diz \"" + mApp[1] + "\" e versao.json diz \"" + mJson + "\" — o app nunca vai se achar desatualizado");
}
if (mSw) ok("cache do sw.js: " + mSw[1]);

// A parte que ninguém lembra: mudou o app e esqueceu de subir a versão.
// Só dá para saber comparando com o que já está publicado.
// Contra o que comparar. Na máquina é `origin/main`, o que está no ar. Na
// integração contínua o commit enviado JÁ é o origin/main, então ela passa o
// commit anterior em BASE_REF — senão a checagem comparava o arquivo consigo
// mesmo e nunca reprovava nada.
const BASE = process.env.BASE_REF || "origin/main";
let publicado = null;
try {
  if (!process.env.BASE_REF) {
    execFileSync("git", ["fetch", "--quiet"], { cwd: RAIZ, stdio: "ignore", timeout: 20000 });
  }
  publicado = {
    html: execFileSync("git", ["show", BASE + ":index.html"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 26 }),
    sw: execFileSync("git", ["show", BASE + ":sw.js"], { cwd: RAIZ, encoding: "utf8" }),
  };
} catch (e) { aviso("não consegui comparar com \"" + BASE + "\" (sem git, sem rede, ou referência inexistente)"); }

if (publicado && mApp && mSw) {
  const htmlMudou = publicado.html.replace(/\r\n/g, "\n") !== html.replace(/\r\n/g, "\n");
  const swMudou = publicado.sw.replace(/\r\n/g, "\n") !== fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8").replace(/\r\n/g, "\n");
  const vPub = (publicado.html.match(/VERSAO_APP\s*=\s*"([^"]+)"/) || [])[1];
  const cPub = (publicado.sw.match(/CACHE\s*=\s*"(superhqs-v\d+)"/) || [])[1];
  if (htmlMudou && vPub === mApp[1]) {
    erro("o index.html mudou mas VERSAO_APP continua \"" + mApp[1] + "\" — suba os três lugares");
  } else if (htmlMudou) {
    ok("index.html mudou e a versão subiu: " + vPub + " -> " + mApp[1]);
  } else {
    ok("index.html igual ao publicado (nada a subir)");
  }
  if ((htmlMudou || swMudou) && cPub === mSw[1]) {
    erro("o app mudou mas o cache do sw.js continua \"" + mSw[1] + "\" — o celular vai servir a cópia velha");
  }
}

// -------------------------------------------------------- 2. os dois scripts
titulo("2. Os dois blocos de script");
// O arquivo tem dois <script> de propósito: dados puros no primeiro, app no
// segundo. Ver "Dois scripts no index.html" no CLAUDE.md.
const blocos = [];
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) blocos.push({ attrs: m[1], src: m[2] });

if (blocos.length !== 2) {
  erro("esperava 2 blocos de script sem src, achei " + blocos.length);
} else {
  ok("dois blocos, como manda o projeto");
  // o primeiro é JavaScript comum: dá para conferir de verdade, aqui mesmo
  try {
    new vm.Script(blocos[0].src, { filename: "bloco-de-dados" });
    ok("bloco de dados: sintaxe válida (" + Math.round(blocos[0].src.length / 1024) + " KB)");
  } catch (e) {
    erro("bloco de dados NÃO compila: " + e.message);
  }
  if (!/type="text\/babel"/.test(blocos[1].attrs)) {
    erro("o segundo bloco deveria ser type=\"text/babel\"");
  }
}

// o argumento tem parênteses dentro (document.getElementById("root")), então
// nada de [^)]* aqui
if (/ReactDOM\.createRoot\([\s\S]{0,120}?\)\s*\.render\(/.test(html)) ok("o app é montado na tela (createRoot/render presente)");
else erro("não achei a chamada que monta o app — a tela ficaria vazia");

// --------------------------------------------------- 3. o JSX compila mesmo
titulo("3. O JSX compila? (o que o navegador vai tentar fazer)");
const BABEL_URL = (html.match(/src="(https:\/\/[^"]*babel-standalone[^"]*)"/) || [])[1];

// O Babel pelo npm, quando a CDN não está ao alcance.
//
// Sessão do Claude na nuvem — que é como se mexe neste projeto pelo celular —
// roda com a rede limitada a uma lista. `registry.npmjs.org` está nela por
// padrão; `cdnjs.cloudflare.com` NÃO está. Sem esta saída, a conferida mais
// importante (o JSX compila?) virava um aviso justamente no aparelho onde não
// dá para abrir o app e olhar.
//
// Qualquer Babel serve para saber se o JSX compila — não precisa ser o mesmo
// byte que o navegador baixa. Para o hash SRI é diferente, e por isso aquela
// checagem continua exigindo a CDN de verdade.
async function babelDoNpm(versao) {
  const r = await fetch(
    "https://registry.npmjs.org/@babel/standalone/-/standalone-" + versao + ".tgz",
    { signal: AbortSignal.timeout(90000) }
  );
  if (!r.ok) return null;
  const tar = require("zlib").gunzipSync(Buffer.from(await r.arrayBuffer()));
  // tar é simples: cabeçalho de 512 bytes, nome nos primeiros 100, tamanho em
  // octal no byte 124, e os dados logo depois, preenchidos até o múltiplo de 512
  let off = 0;
  while (off + 512 <= tar.length) {
    const nome = tar.toString("utf8", off, off + 100).replace(/\0.*$/, "");
    if (!nome) break; // blocos zerados marcam o fim
    const tam = parseInt(tar.toString("utf8", off + 124, off + 136).replace(/\0.*$/, "").trim(), 8) || 0;
    const dados = off + 512;
    if (nome === "package/babel.min.js") return tar.toString("utf8", dados, dados + tam);
    off = dados + Math.ceil(tam / 512) * 512;
  }
  return null;
}

async function compilarJSX() {
  if (blocos.length !== 2) return;
  const jsx = blocos[1].src;
  let fonteBabel = null;
  const versao = (BABEL_URL && BABEL_URL.match(/babel-standalone\/([\d.]+)\//) || [])[1];
  const cache = path.join(os.tmpdir(), "superhqs-babel-" + crypto.createHash("sha1").update(BABEL_URL || "x").digest("hex").slice(0, 12) + ".js");
  if (fs.existsSync(cache)) {
    fonteBabel = fs.readFileSync(cache, "utf8");
  } else {
    // SO_NPM existe para provar que a saída pelo npm funciona de verdade
    if (BABEL_URL && !process.env.SO_NPM) {
      try {
        const r = await fetch(BABEL_URL, { signal: AbortSignal.timeout(60000) });
        if (r.ok) fonteBabel = await r.text();
      } catch (e) {}
    }
    if (!fonteBabel && versao) {
      try {
        fonteBabel = await babelDoNpm(versao);
        if (fonteBabel) console.log("        (a CDN não respondeu; peguei o Babel no npm)");
      } catch (e) {}
    }
    if (fonteBabel) { try { fs.writeFileSync(cache, fonteBabel); } catch (e) {} }
  }
  if (!fonteBabel) {
    aviso("sem rede para baixar o Babel — conferindo só o equilíbrio dos delimitadores");
    // Checagem fraca, mas pega o estrago típico de edição por script: um
    // recorte que comeu uma chave e deixou o arquivo desbalanceado.
    let ch = 0, pa = 0, co = 0;
    for (const c of jsx) {
      if (c === "{") ch++; else if (c === "}") ch--;
      else if (c === "(") pa++; else if (c === ")") pa--;
      else if (c === "[") co++; else if (c === "]") co--;
    }
    if (ch || pa || co) erro("delimitadores desbalanceados no JSX: chaves " + ch + ", parênteses " + pa + ", colchetes " + co);
    else ok("delimitadores equilibrados (não substitui compilar)");
    return;
  }
  const ctx = { self: {}, window: {}, navigator: { userAgent: "node" }, console: { warn() {}, log() {}, error() {} } };
  ctx.globalThis = ctx;
  try {
    vm.createContext(ctx);
    new vm.Script(fonteBabel, { filename: "babel.min.js" }).runInContext(ctx);
  } catch (e) {
    aviso("não consegui carregar o Babel aqui (" + e.message + ") — pulei a compilação");
    return;
  }
  const Babel = ctx.Babel || (ctx.window && ctx.window.Babel);
  if (!Babel || !Babel.transform) { aviso("Babel carregou mas não expôs transform — pulei"); return; }
  try {
    const saida = Babel.transform(jsx, { presets: ["react"], filename: "app.jsx" });
    ok("o JSX compila (" + Math.round(jsx.length / 1024) + " KB -> " + Math.round(saida.code.length / 1024) + " KB)");
    try {
      new vm.Script(saida.code, { filename: "app-compilado" });
      ok("e o resultado é JavaScript válido");
    } catch (e) {
      erro("o JSX compila mas o resultado não é válido: " + e.message);
    }
  } catch (e) {
    erro("o JSX NÃO compila — seria tela branca para todo mundo:\n        " + String(e.message).split("\n")[0]);
  }
}

// ------------------------------------------------------- 4. os hashes (SRI)
titulo("4. Os hashes das bibliotecas (SRI)");
const tags = [];
const reTag = /<script\s+src="(https:\/\/[^"]+)"\s*\n?\s*integrity="([^"]+)"/g;
while ((m = reTag.exec(html)) !== null) tags.push({ url: m[1], sri: m[2] });

async function conferirSRI() {
  if (!tags.length) { erro("nenhum script de CDN com integrity — o projeto exige SRI"); return; }
  for (const t of tags) {
    const nome = t.url.split("/").slice(-1)[0].split("?")[0];
    let buf = null;
    try {
      const r = await fetch(t.url, { signal: AbortSignal.timeout(45000) });
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {}
    if (!buf) { aviso(nome + ": sem rede para conferir o hash"); continue; }
    const [alg, esperado] = t.sri.split("-");
    const real = crypto.createHash(alg === "sha384" ? "sha384" : alg).update(buf).digest("base64");
    if (real === esperado) ok(nome + ": hash confere");
    else erro(nome + ": HASH NÃO CONFERE — o navegador vai recusar o arquivo e o app não abre\n        no index.html: " + alg + "-" + esperado + "\n        de verdade:    " + alg + "-" + real);
  }
}

// ------------------------------------------------------------- 5. o sw.js
titulo("5. O que o service worker guarda");
const swSrc = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
const mArq = swSrc.match(/const ARQUIVOS = \[([\s\S]*?)\];/);
if (!mArq) {
  erro("não achei a lista ARQUIVOS no sw.js");
} else {
  // Os comentários da lista citam endereços entre aspas ("?v=3 precisa bater…"),
  // então as linhas de comentário saem antes de recolher as strings. Linha
  // inteira, e não `//` em qualquer lugar: o `//` de "https://" não é comentário.
  const semComentario = mArq[1]
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const lista = (semComentario.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
  let faltando = 0;
  for (const u of lista) {
    if (u.startsWith("http")) {
      // O "?v=N" precisa bater exatamente, senão o cache guarda um endereço
      // que o index.html nunca pede — e o modo offline vai à rede do mesmo jeito.
      if (html.indexOf(u) < 0) { erro("o sw.js guarda \"" + u + "\", mas o index.html não pede esse endereço"); faltando++; }
    } else if (u !== "./") {
      const f = path.join(RAIZ, u.replace(/^\.\//, ""));
      if (!fs.existsSync(f)) { erro("o sw.js guarda \"" + u + "\", que não existe na pasta"); faltando++; }
    }
  }
  if (!faltando) ok(lista.length + " itens na lista, todos existem e batem com o index.html");
  // e o contrário: biblioteca pedida pelo app que o cache não guarda
  for (const t of tags) {
    if (lista.indexOf(t.url) < 0) aviso("o index.html pede \"" + t.url.split("/").slice(-1)[0] + "\" que o sw.js não guarda — não funcionaria offline");
  }
}

// ---------------------------------------------------------------- fechamento
(async () => {
  await compilarJSX();
  await conferirSRI();

  console.log("\n" + "-".repeat(60));
  if (erros) {
    console.log(erros + " erro(s)" + (avisos ? " e " + avisos + " aviso(s)" : "") + ". NÃO PUBLIQUE assim.");
    process.exit(1);
  }
  console.log("tudo certo" + (avisos ? ", com " + avisos + " aviso(s) (veja acima)" : "") + ". Pode publicar.");
  process.exit(0);
})();
