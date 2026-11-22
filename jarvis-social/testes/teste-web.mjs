// O painel: sintaxe dos módulos, PWA e, se houver Chromium/Playwright, o
// fluxo real no navegador em tela de celular (360×740) no modo DEMONSTRAÇÃO.
// Isto é teste de viewport estreito, NÃO é teste no aparelho do dono.
import { teste, igual, verdade, rodar } from "./base.mjs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);

teste("app.js e sw.js sem erro de sintaxe", () => { execFileSync(process.execPath, ["--check", path.join(RAIZ, "app.js")]); execFileSync(process.execPath, ["--check", path.join(RAIZ, "sw.js")]); });
teste("config.js não traz segredo (só URL e chave anon)", () => {
  const c = fs.readFileSync(path.join(RAIZ, "config.js"), "utf8");
  verdade(!/service_role|SERVICE_ROLE|secret|sb_secret_/i.test(c.replace(/\/\/.*$/gm, "")), "config.js com segredo");
});
teste("manifest e ícone existem; SW com escopo da pasta", () => {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
  igual([m.scope, m.display, m.lang], ["./", "standalone", "pt-BR"]); verdade(fs.existsSync(path.join(RAIZ, "icone.svg")));
  verdade(fs.readFileSync(path.join(RAIZ, "app.js"), "utf8").includes(`register("./sw.js", { scope: "./" })`));
});
teste("todo arquivo da casca do SW existe", () => {
  const sw = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
  const lista = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  for (const f of lista) verdade(fs.existsSync(path.join(RAIZ, f)), "falta " + f);
});

let pw = null; try { pw = req("playwright"); } catch { /* sem navegador: só as checagens acima */ }
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".jpg": "image/jpeg" };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/jarvis-social/, "");
      const f = path.join(RAIZ, u.endsWith("/") ? u + "index.html" : u);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

if (pw) {
  teste("fluxo no navegador (360 px): demonstração → Novo Reel → programar → recarregar → editar → pausar → cancelar → comando", async () => {
    const srv = await servir(); const porta = srv.address().port;
    const nav = await pw.chromium.launch();
    try {
      const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR", timezoneId: "Asia/Tokyo" });
      const pg = await ctx.newPage();
      const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
      pg.on("dialog", (d) => d.accept());
      await pg.goto(`http://127.0.0.1:${porta}/jarvis-social/#inicio`);
      await pg.getByText("DEMONSTRAÇÃO").first().waitFor();
      await pg.getByRole("link", { name: "＋ Novo Reel" }).click();
      await pg.setInputFiles("#in-video", path.join(RAIZ, "testes/amostras/video-teste.mp4"));
      await pg.locator(".previa video").waitFor();
      await pg.click("#avancar");
      await pg.setInputFiles("#in-capa", path.join(RAIZ, "testes/amostras/capa-teste.jpg"));
      await pg.locator(".previa .grade").waitFor();
      await pg.click("#avancar");
      await pg.fill("#in-leg", "Treino depois dos 40 #foco");
      await pg.click("#avancar");
      const alvo = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
      await pg.fill("#in-data", alvo); await pg.fill("#in-hora", "10:00");
      await pg.click("#avancar");
      await pg.click("#programar");
      await pg.getByText("Demonstração (simulado)").waitFor({ timeout: 15000 });
      const recibo = await pg.locator("dl.recibo").innerText();
      verdade(recibo.includes(`${alvo.split("-").reverse().join("/")} às 10:00 (America/Sao_Paulo)`), "fuso errado no recibo: " + recibo);
      // fechar e reabrir
      await pg.reload(); await pg.goto(`http://127.0.0.1:${porta}/jarvis-social/#agenda`);
      await pg.getByText("Treino depois dos 40").first().waitFor();
      igual(await pg.locator("[data-post]").count(), 1, "um agendamento só");
      // largura: sem rolagem horizontal
      igual(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "rolagem horizontal");
      // editar
      await pg.click("[data-acao=editar]"); await pg.fill("#ed-hora", "11:30"); await pg.click("#ed-salvar");
      await pg.getByText("às 11:30").first().waitFor().catch(() => {});
      verdade((await pg.locator("[data-post]").first().innerText()).includes("11:30"), "edição não apareceu");
      // pausar e cancelar
      await pg.click("[data-acao=pausar]"); await pg.locator(".selo.paused").waitFor();
      await pg.click("[data-acao=cancelar]");
      await pg.click("[data-filtro=cancelados]"); await pg.locator(".selo.cancelled").waitFor();
      // comando
      await pg.goto(`http://127.0.0.1:${porta}/jarvis-social/#inicio`);
      await pg.fill("#cmd", "Altere para dois vídeos por dia"); await pg.click("#f-cmd button");
      await pg.getByText("Nova frequência: 2 por dia").waitFor();
      await pg.click("#cmd-sim"); await pg.getByText("Frequência alterada").waitFor();
      fs.mkdirSync(path.join(RAIZ, "testes/saida"), { recursive: true });
      await pg.screenshot({ path: path.join(RAIZ, "testes/saida/inicio-360.png"), fullPage: true });
      igual(erros, [], "erros de JavaScript na página");
    } finally { await nav.close(); srv.close(); }
  });
} else console.log("aviso: Playwright ausente; fluxo no navegador não rodou");

rodar("painel: sintaxe, PWA e fluxo no navegador (viewport de celular)");
