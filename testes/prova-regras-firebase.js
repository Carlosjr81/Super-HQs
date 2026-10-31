// Prova as regras (firebase/firestore.rules, versão 5) no Firebase DE VERDADE,
// com uma conta descartável que é apagada no fim. Veio do Treino Livre.
// Rode depois de publicar regras novas:
//   node testes/prova-regras-firebase.js
// Deixa um registro "Teste regras" no histórico de aceites e um aviso de
// pagamento de teste (ninguém apaga pelo app: são as regras do livro-caixa).
// A chave vem do próprio index.html: um lugar só para mudar.
const html = require("./app").lerApp();
const m = html.match(/const FIREBASE_ACESSO = \{ apiKey: "([^"]*)", projectId: "([^"]*)" \}/);
if (!m || !m[1]) { console.log("FIREBASE_ACESSO vazio no index.html: não há o que provar."); process.exit(1); }
const KEY = m[1], P = m[2];
const DOCS = "https://firestore.googleapis.com/v1/projects/" + P + "/databases/(default)/documents";
const j = async (url, op) => { const r = await fetch(url, op); let b = null; try { b = await r.json(); } catch (e) {} return { s: r.status, b }; };
const auth = (fn, corpo) => j("https://identitytoolkit.googleapis.com/v1/accounts:" + fn + "?key=" + KEY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const campos = (o) => { const f = {}; for (const k in o) f[k] = typeof o[k] === "number" ? { integerValue: String(o[k]) } : { stringValue: o[k] }; return f; };
(async () => {
  const email = "teste-regras-" + Date.now() + "@exemplo-superhqs.com";
  const c = await auth("signUp", { email, password: "Teste12345!", returnSecureToken: true });
  if (c.s !== 200) { console.log("criar conta falhou", c.s, JSON.stringify(c.b)); process.exit(1); }
  const tok = c.b.idToken, uid = c.b.localId, H = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
  const res = [];
  let falhas = 0;
  const prova = (nome, esperado, s) => { const ok = esperado === (s === 200); if (!ok) falhas++; res.push((ok ? "OK  " : "FALHOU ") + nome + " (HTTP " + s + ")"); };
  const commit = (colecao, nomeDoc, dados, transf) => j(DOCS + ":commit", { method: "POST", headers: H, body: JSON.stringify({ writes: [Object.assign({
    update: { name: "projects/" + P + "/databases/(default)/documents/" + colecao + "/" + nomeDoc, fields: campos(dados) }, currentDocument: { exists: false } },
    transf === false ? {} : { updateTransforms: [{ fieldPath: "servidorEm", setToServerValue: "REQUEST_TIME" }] })] }) });
  try {
    const em = Date.now();
    // a conta (usuarios/)
    prova("sem login, ninguém lê nada", false, (await j(DOCS + "/usuarios/" + uid)).s);
    prova("cadastro como pendente, com o próprio e-mail", true, (await j(DOCS + "/usuarios/" + uid + "?currentDocument.exists=false", { method: "PATCH", headers: H, body: JSON.stringify({ fields: campos({ email, nome: "Teste regras", status: "pendente", criadoEm: em, ultimoAcesso: em, acessos: 1, aparelho: "teste", versao: "teste" }) }) })).s);
    prova("a pessoa lê a própria conta", true, (await j(DOCS + "/usuarios/" + uid, { headers: H })).s);
    prova("a pessoa NÃO lista os usuários (só o dono)", false, (await j(DOCS + "/usuarios", { headers: H })).s);
    prova("a pessoa NÃO se libera sozinha", false, (await j(DOCS + "/usuarios/" + uid + "?updateMask.fieldPaths=status", { method: "PATCH", headers: H, body: JSON.stringify({ fields: campos({ status: "liberado" }) }) })).s);
    prova("a pessoa NÃO se dá acesso pago", false, (await j(DOCS + "/usuarios/" + uid + "?updateMask.fieldPaths=pagoAte", { method: "PATCH", headers: H, body: JSON.stringify({ fields: campos({ pagoAte: em + 9e9 }) }) })).s);
    prova("a conta grava termos e termosEm", true, (await j(DOCS + "/usuarios/" + uid + "?updateMask.fieldPaths=termos&updateMask.fieldPaths=termosEm", { method: "PATCH", headers: H, body: JSON.stringify({ fields: campos({ termos: "2026-10-31", termosEm: em }) }) })).s);
    // a configuração (aprovação automática e cobrança): todos leem, só o dono grava
    prova("a pessoa NÃO liga a aprovação automática nem a cobrança", false, (await j(DOCS + "/config/acesso", { method: "PATCH", headers: H, body: JSON.stringify({ fields: { auto: { booleanValue: true } } }) })).s);
    // o histórico de aceites
    const reg = { conta: uid, email, nome: "Teste regras", termos: "2026-10-31", em, de: "tela", caixas: "a | b", hash: "x", aparelho: "teste", versaoApp: "teste", navegador: "teste" };
    prova("registra o próprio aceite com a hora do servidor", true, (await commit("aceites", uid + "_" + em, reg)).s);
    prova("aceite sem a hora do servidor é recusado", false, (await commit("aceites", uid + "_" + (em + 1), Object.assign({}, reg, { em: em + 1 }), false)).s);
    prova("aceite em nome de outra conta é recusado", false, (await commit("aceites", "outro_" + em, Object.assign({}, reg, { conta: "outro" }))).s);
    prova("a pessoa NÃO lê o histórico de aceites", false, (await j(DOCS + "/aceites/" + uid + "_" + em, { headers: H })).s);
    // os pagamentos
    const pag = { conta: uid, email, nome: "Teste regras", plano: "mensal", planoNome: "Mensal", valor: 1, dias: 30, metodo: "pix", txid: "SHTESTE", nota: "teste das regras", condicoes: "2026-10-31", status: "informado", em, aparelho: "teste", versaoApp: "teste" };
    prova("avisa que pagou (informado, hora do servidor)", true, (await commit("pagamentos", uid + "_" + em, pag)).s);
    prova("NÃO cria pagamento já confirmado", false, (await commit("pagamentos", uid + "_" + (em + 2), Object.assign({}, pag, { em: em + 2, status: "confirmado" }))).s);
    prova("NÃO confirma o próprio pagamento", false, (await j(DOCS + "/pagamentos/" + uid + "_" + em + "?updateMask.fieldPaths=status", { method: "PATCH", headers: H, body: JSON.stringify({ fields: campos({ status: "confirmado" }) }) })).s);
    prova("NÃO apaga pagamento (livro-caixa)", false, (await j(DOCS + "/pagamentos/" + uid + "_" + em, { method: "DELETE", headers: H })).s);
    prova("NÃO lista os pagamentos de todos", false, (await j(DOCS + "/pagamentos", { headers: H })).s);
  } finally {
    await j(DOCS + "/usuarios/" + uid, { method: "DELETE", headers: H });
    const d = await auth("delete", { idToken: tok });
    res.push("conta descartável apagada: " + (d.s === 200 ? "sim" : "NÃO (" + d.s + ")"));
    console.log(res.join("\n"));
    console.log("\n" + (falhas ? falhas + " prova(s) falharam" : "todas as provas passaram"));
    process.exit(falhas ? 1 : 0);
  }
})();
