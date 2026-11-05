// Prova REAL das regras de acesso por coleção, no emulador do Firestore,
// carregando firebase/firestore.rules. Diferente do prova-regras-firebase.js
// (que usa o Firebase real), este usa o emulador e precisa de dependências:
//
//   npm i --no-save @firebase/rules-unit-testing firebase firebase-tools
//   npx firebase-tools emulators:exec --only firestore --project super-hqs \
//     "node testes/prova-regras-colecao.js firebase/firestore.rules"
//
// (ou rode com NODE_PATH apontando para onde essas libs foram instaladas).
// Prova o que o teste de função isolada não prova: que a CONSULTA do app é
// aceita pelas regras. A consulta filtra status==publicada E colecao IN [...],
// os mesmos campos que a regra confere — filtrar por outro campo é recusado.
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } = require("firebase/firestore");

const RULES = fs.readFileSync(process.argv[2] || "firebase/firestore.rules", "utf8");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const DONO = { email: "carlos.jr.81@hotmail.com", email_verified: true };
const sha = (c) => c.repeat(64);

let ok = 0, bad = 0;
async function prova(nome, p) {
  try { await p; console.log("  ok   " + nome); ok++; }
  catch (e) { console.log("  X    " + nome + "  -> " + ((e && e.message) || e)); bad++; }
}

(async () => {
  const env = await initializeTestEnvironment({ projectId: "super-hqs", firestore: { rules: RULES, host, port: Number(port) } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "config/acesso"), { cobranca: false });
    const ed = (id, colecao, status) => setDoc(doc(db, "acervo/" + id), {
      sha256: id, titulo: "Ed " + colecao, colecao, status, tipo: "zip", paginas: 3, tamanho: 10,
      titular: "T", licenca: "L", origem: "O", caminho: "acervo/" + id + ".cbz", enviadoEm: Date.now(),
    });
    await ed(sha("a"), "A", "publicada");
    await ed(sha("b"), "B", "publicada");
    await ed(sha("c"), "A", "pendente");
    const usr = (uid, extra) => setDoc(doc(db, "usuarios/" + uid), Object.assign({
      email: uid + "@x.com", nome: uid, status: "liberado", ate: 0, criadoEm: Date.now(),
    }, extra));
    await usr("uParcial", { acervoTudo: false, colecoes: ["A"] });
    await usr("uTudo", {});
    await usr("uPend", { status: "pendente" });
    await usr("uBloq", { status: "bloqueado" });
    await usr("uVenc", { ate: Date.now() - 86400000 });
  });

  const fs_ = (uid, tok) => env.authenticatedContext(uid, tok).firestore();
  const parcial = fs_("uParcial"), tudo = fs_("uTudo");

  await prova("parcial LÊ a edição da coleção liberada (A)", assertSucceeds(getDoc(doc(parcial, "acervo/" + sha("a")))));
  await prova("parcial é NEGADO na coleção B", assertFails(getDoc(doc(parcial, "acervo/" + sha("b")))));
  await prova("parcial é NEGADO numa edição pendente (coleção A)", assertFails(getDoc(doc(parcial, "acervo/" + sha("c")))));

  await prova("consulta do app (status==publicada E colecao IN [A]) é ACEITA p/ parcial",
    assertSucceeds(getDocs(query(collection(parcial, "acervo"), where("status", "==", "publicada"), where("colecao", "in", ["A"])))));
  await prova("consulta sem coleção (só status==publicada) é RECUSADA p/ parcial",
    assertFails(getDocs(query(collection(parcial, "acervo"), where("status", "==", "publicada")))));
  await prova("consulta por colecao sem status é RECUSADA p/ parcial",
    assertFails(getDocs(query(collection(parcial, "acervo"), where("colecao", "in", ["A"])))));
  await prova("acervo inteiro: status==publicada é ACEITO",
    assertSucceeds(getDocs(query(collection(tudo, "acervo"), where("status", "==", "publicada")))));

  await prova("pendente é NEGADO no acervo", assertFails(getDoc(doc(fs_("uPend"), "acervo/" + sha("a")))));
  await prova("bloqueado é NEGADO no acervo", assertFails(getDoc(doc(fs_("uBloq"), "acervo/" + sha("a")))));
  await prova("vencido é NEGADO no acervo", assertFails(getDoc(doc(fs_("uVenc"), "acervo/" + sha("a")))));

  await prova("parcial NÃO muda o próprio acervoTudo", assertFails(updateDoc(doc(parcial, "usuarios/uParcial"), { acervoTudo: true })));
  await prova("parcial NÃO muda as próprias colecoes", assertFails(updateDoc(doc(parcial, "usuarios/uParcial"), { colecoes: ["A", "B"] })));
  await prova("parcial NÃO se libera (status)", assertFails(updateDoc(doc(parcial, "usuarios/uParcial"), { status: "liberado", acervoTudo: true })));

  const dono = fs_("owner", DONO);
  await prova("dono CRIA edição publicada com direitos + hora do servidor", assertSucceeds(setDoc(doc(dono, "acervo/" + sha("d")), {
    sha256: sha("d"), titulo: "Nova", colecao: "A", status: "publicada", tipo: "zip", paginas: 2, tamanho: 9,
    titular: "T", licenca: "L", origem: "O", caminho: "acervo/" + sha("d") + ".cbz", enviadoEm: serverTimestamp(),
  })));
  await prova("dono NÃO cria edição sem registro de direitos", assertFails(setDoc(doc(dono, "acervo/" + sha("e")), {
    sha256: sha("e"), titulo: "Sem direitos", colecao: "A", status: "publicada", tipo: "zip", paginas: 2, tamanho: 9,
    caminho: "acervo/" + sha("e") + ".cbz", enviadoEm: serverTimestamp(),
  })));

  await env.cleanup();
  console.log("\n" + ok + " ok / " + bad + " falhou");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
