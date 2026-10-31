// O leitor: onde a página aparece, o toque na imagem, toque x arraste, a
// decisão de virar a folha e o Toque para Ler achando o balão em páginas
// sintéticas (fundo de cor, balão branco com contorno e letras pretas, calhas
// brancas entre quadros, legenda creme).
const html = require("./app").lerApp();
function pedaco(de, ate) {
  const i = html.indexOf(de), f = html.indexOf(ate, i);
  if (i < 0 || f < 0) { console.error("nao achei: " + de); process.exit(1); }
  return html.slice(i, f);
}
eval(pedaco("// ---------------- LEITOR: AS CONTAS", "// ---------------- FIM DAS CONTAS DO LEITOR") +
  "\nglobalThis.L = { retanguloContido, telaParaImagem, classificarGesto, decidirVirada, acharBalao, acharBalaoPerto, caixaManual };");

let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log("  ok   " + nome.padEnd(64) + JSON.stringify(obtido)); }
  else { mal++; console.log("  X    " + nome.padEnd(64) + JSON.stringify(obtido) + ", esperava " + JSON.stringify(esperado)); }
}
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("--- onde a página aparece ---");
teste("página em pé numa tela em pé: faixas em cima e embaixo", { x: 0, y: 106, l: 400, a: 600 }, L.retanguloContido(400, 812, 800, 1200));
teste("página larga: faixas dos lados", { x: 50, y: 0, l: 300, a: 200 }, L.retanguloContido(400, 200, 1500, 1000));
const ret = L.retanguloContido(400, 812, 800, 1200);
teste("o centro da tela é o centro da imagem", { x: 400, y: 600 }, L.telaParaImagem(200, 406, ret, 800, 1200));
teste("o canto de cima da página (as quatro bordas)", [{ x: 0, y: 0 }, { x: 800, y: 1200 }], [L.telaParaImagem(0, 106, ret, 800, 1200), L.telaParaImagem(400, 706, ret, 800, 1200)]);
teste("toque na faixa preta não é na página", null, L.telaParaImagem(200, 50, ret, 800, 1200));

console.log("\n--- toque x arraste ---");
teste("parado e rápido: toque", "toque", L.classificarGesto(3, 2, 120));
teste("parado mas demorado (pressionar): não é toque", "nada", L.classificarGesto(2, 2, 900));
teste("anda na horizontal: arraste (vira a folha)", "arraste", L.classificarGesto(-80, 10, 200));
teste("anda na vertical: não vira a folha", "nada", L.classificarGesto(10, 90, 200));
teste("soltou a 40%: vira", true, L.decidirVirada(0.4, 0));
teste("soltou a 20% devagar: volta (cancelou)", false, L.decidirVirada(0.2, 0.3));
teste("puxão rápido a 15%: vira", true, L.decidirVirada(0.15, 2));
teste("um tremido de 5%: volta", false, L.decidirVirada(0.05, 3));

console.log("\n--- Toque para Ler: achar o balão ---");
// página sintética 300x400: fundo azul-escuro, quadros com calhas brancas
function pagina() {
  const l = 300, a = 400, d = new Uint8ClampedArray(l * a * 4);
  const pinta = (x0, y0, x1, y1, r, g, b) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * l + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } };
  pinta(0, 0, l, a, 255, 255, 255);                // papel (calhas brancas)
  pinta(10, 10, 290, 190, 40, 60, 120);            // quadro 1
  pinta(10, 200, 290, 390, 120, 70, 40);           // quadro 2
  // balão branco elíptico com contorno preto no quadro 1, centro (150, 80), raios 70x35
  for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) {
    const e = ((x - 150) / 70) ** 2 + ((y - 80) / 35) ** 2;
    if (e <= 1.08 && e > 0.9) pinta(x, y, x + 1, y + 1, 0, 0, 0);
    else if (e <= 0.9) pinta(x, y, x + 1, y + 1, 250, 250, 248);
  }
  pinta(110, 72, 190, 76, 0, 0, 0);                // "letras": duas linhas pretas
  pinta(115, 84, 185, 88, 0, 0, 0);
  pinta(30, 150, 120, 175, 235, 220, 180);         // legenda creme sem contorno, no quadro 1
  pinta(60, 160, 100, 163, 20, 20, 20);
  return { d, l, a };
}
const p = pagina();
const b1 = L.acharBalao(p.d, p.l, p.a, 150, 80);
teste("tocar no meio do balão acha o balão (caixa em volta da elipse)", true, !!b1 && !b1.motivo && perto(b1.x + b1.l / 2, 150, 4) && perto(b1.y + b1.a / 2, 80, 4) && b1.l > 120 && b1.l < 170 && b1.a > 55 && b1.a < 90);
const b2 = L.acharBalao(p.d, p.l, p.a, 150, 74);
teste("o dedo caiu numa letra: acha o mesmo balão", true, !!b2 && !b2.motivo && perto(b2.x, b1.x, 2) && perto(b2.l, b1.l, 2));
const b3 = L.acharBalao(p.d, p.l, p.a, 75, 168);
teste("legenda creme sem contorno também amplia", true, !!b3 && !b3.motivo && perto(b3.x + b3.l / 2, 75, 6) && b3.l > 85);
teste("tocar na arte escura: não inventa balão", "sem área clara perto do toque", L.acharBalao(p.d, p.l, p.a, 250, 300).motivo);
teste("tocar na calha branca entre os quadros: recusa", true, !!L.acharBalao(p.d, p.l, p.a, 150, 195).motivo);
teste("toque fora da imagem", "fora da página", L.acharBalao(p.d, p.l, p.a, -5, 10).motivo);
// balão encostado na borda de cima (texto junto à borda)
const q = pagina();
for (let y = 0; y < 30; y++) for (let x = 120; x < 200; x++) { const i = (y * q.l + x) * 4; q.d[i] = q.d[i + 1] = q.d[i + 2] = 250; }
teste("área clara ligada ao papel da borda: recusa (vai para a seleção manual)", true, !!L.acharBalao(q.d, q.l, q.a, 160, 15).motivo);

const b4 = L.acharBalaoPerto(p.d, p.l, p.a, 150, 122);
teste("o dedo caiu um pouco fora do balão: acha o balão mais perto", true, !!b4 && !b4.motivo && perto(b4.x, b1.x, 2) && perto(b4.l, b1.l, 2));
teste("longe de qualquer balão: continua recusando", true, !!L.acharBalaoPerto(p.d, p.l, p.a, 250, 300).motivo);

console.log("\n--- a seleção manual ---");
teste("caixa centrada no toque", { x: 200, y: 480, l: 400, a: 240 }, L.caixaManual(400, 600, 800, 1200));
teste("perto da borda, não sai da página", { x: 0, y: 960, l: 400, a: 240 }, L.caixaManual(10, 1190, 800, 1200));

console.log("\n" + ok + " passou / " + mal + " falhou");
process.exit(mal ? 1 : 0);
