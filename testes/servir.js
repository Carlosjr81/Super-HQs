// Servidor estatico para testar o app de verdade.
//
//   node servir.js        ->  http://localhost:8765
//
// Por que nao abrir o index.html direto: em file:// o localStorage fica
// bloqueado e o service worker nao registra — ou seja, justo as duas coisas
// onde moram os dados e o modo offline. O registro do service worker aceita
// localhost alem de https, entao localhost e o ambiente mais parecido com o
// GitHub Pages que da para ter na maquina.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { caminhoDoApp } = require("./app");

const RAIZ = path.dirname(caminhoDoApp());
const PORTA = Number(process.env.PORTA) || 8765;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const arquivo = path.join(RAIZ, rel);
    // nada de subir de pasta por "../" na URL
    if (!path.resolve(arquivo).startsWith(path.resolve(RAIZ))) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(arquivo, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("nao encontrado: " + rel);
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream",
        // o app precisa ver a versao nova a cada recarga, senao testar
        // atualizacao vira adivinhacao
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  })
  .listen(PORTA, () => {
    console.log("servindo " + RAIZ);
    console.log("abra:    http://localhost:" + PORTA);
    console.log("(Ctrl+C para parar)");
  });
