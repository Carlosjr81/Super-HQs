// Acha o index.html do app, em qualquer computador.
//
// Antes cada teste trazia o caminho escrito à mão ("G:/Meu Drive/..."). Isso
// amarrava a suíte a uma máquina: letra de unidade, nome de usuário e idioma
// da pasta mudam de um computador para outro, e o teste morria na primeira
// linha sem dizer por quê.
//
// Aqui o caminho sai da posição deste arquivo. Esta pasta vive dentro do
// repositório, então a relação com o `index.html` é a única coisa que não muda:
// seja num clone do GitHub, seja na cópia do Google Drive.
const fs = require("fs");
const path = require("path");

// Se um dia as pastas forem separadas, esta variável resolve sem editar
// teste nenhum:  SUPERHQS_HTML="D:/outro/lugar/index.html" node rodar.js
const CANDIDATOS = [
  process.env.SUPERHQS_HTML,
  path.join(__dirname, "..", "index.html"),          // testes/ dentro do repositório
  path.join(__dirname, "index.html"),
].filter(Boolean);

function caminhoDoApp() {
  for (const c of CANDIDATOS) if (fs.existsSync(c)) return c;
  console.error(
    "Não achei o index.html do app. Procurei em:\n  " +
      CANDIDATOS.join("\n  ") +
      "\n\nSe a pasta do app estiver em outro lugar, rode assim:\n" +
      '  SUPERHQS_HTML="/caminho/para/index.html" node ' +
      path.basename(process.argv[1] || "rodar.js")
  );
  process.exit(1);
}

// Sempre LF, em qualquer sistema.
//
// O `index.html` é CRLF na cópia de trabalho do Windows e LF no Linux — o git
// converte na saída. As suítes recortam o código por marcadores de texto, e um
// marcador que termine em "\n}\n" nunca casa num arquivo CRLF: ali está
// "\r\n}\r\n". O resultado era o pior dos mundos — `teste-corrida` e
// `teste-intervalado` passavam no Linux do CI, que ficava verde, e **não
// rodavam** no computador de quem desenvolve, onde o hook de pre-push exige
// que rodem.
//
// Normalizar aqui, num lugar só, faz toda suíte ver os mesmos bytes em
// qualquer máquina. Nenhuma delas precisa do byte cru: todas já normalizavam
// por conta própria, umas antes de procurar e outras depois — e era essa
// diferença que decidia quem quebrava.
function lerApp() {
  return fs.readFileSync(caminhoDoApp(), "utf8").replace(/\r\n/g, "\n");
}

module.exports = { caminhoDoApp, lerApp };
