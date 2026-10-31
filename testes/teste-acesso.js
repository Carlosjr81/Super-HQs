// O login com aprovação: o formato do Firestore, quem entra sem rede, a ordem
// do painel e as mensagens de erro. A conversa de verdade com o Firebase é
// conferida no navegador, com um Firebase de mentira (ver o LEIA-ME).
const html = require("./app").lerApp();
function pedaco(de, ate) {
  const i = html.indexOf(de), f = html.indexOf(ate, i);
  if (i < 0 || f < 0) { console.error("nao achei: " + de); process.exit(1); }
  return html.slice(i, f);
}
const plural = (n, s, p) => (n === 1 ? s : p);
eval(pedaco("const semAcento = (s) =>", ";\n") + ";\nglobalThis.semAcento = semAcento;");
eval(pedaco("// ---------------- ACESSO: AS CONTAS", "// ---------------- FIM DAS CONTAS") +
  "\nglobalThis.A = { paraFirestore, deFirestore, aparelhoDe, liberadoSemRede, ordenarContas, resumoContas, filtrarContas, erroDeConta, ehEmailDono, sugerirEmail, FIREBASE_ACESSO, EMAIL_DONO, situacaoConta, prazoAte, recadoNovo, csvContas, filtroConta, csvAceites, ordenarAceites, lerCobranca, planoDaConta, acessoPago, pixCopiaECola, crc16Pix, txidPagamento, planosAtivos, planoPorId, resumoPagamentos, csvPagamentos, ordenarPagamentos, fimDoDia, textoPlanoConta, precoTexto };");

let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log("  ok   " + nome.padEnd(62) + JSON.stringify(obtido)); }
  else { mal++; console.log("  X    " + nome.padEnd(62) + JSON.stringify(obtido) + ", esperava " + JSON.stringify(esperado)); }
}

console.log("--- o porteiro só liga com o projeto configurado ---");
teste("o login está ligado no projeto do Super HQs", ["super-hqs", true], [A.FIREBASE_ACESSO.projectId, /^AIza/.test(A.FIREBASE_ACESSO.apiKey)]);
teste("o dono é o e-mail do Carlos", "carlos.jr.81@hotmail.com", A.EMAIL_DONO);
teste("maiúscula e espaço não mudam quem é o dono", true, A.ehEmailDono("  Carlos.Jr.81@Hotmail.com "));
teste("outro e-mail não é dono", false, A.ehEmailDono("carlos.jr.81@hotmail.com.br"));

console.log("\n--- o formato do Firestore ---");
const doc = A.paraFirestore({ email: "a@b.com", acessos: 3, status: "pendente", nada: null });
teste("número inteiro vai como integerValue (texto)", { integerValue: "3" }, doc.fields.acessos);
teste("ida e volta", { email: "a@b.com", acessos: 3, status: "pendente", nada: null, uid: "u1" },
  A.deFirestore(Object.assign({ name: "projects/p/databases/(default)/documents/usuarios/u1" }, doc)));
teste("documento vazio não é conta", null, A.deFirestore({}));

console.log("\n--- sem internet ---");
const agora = Date.parse("2026-10-28T12:00:00Z");
teste("liberado conferido ontem: entra", true, A.liberadoSemRede({ status: "liberado", conferidoEm: agora - 864e5 }, agora));
teste("liberado conferido há 8 dias: precisa conferir", false, A.liberadoSemRede({ status: "liberado", conferidoEm: agora - 8 * 864e5 }, agora));
teste("aguardando nunca entra sem conferir", false, A.liberadoSemRede({ status: "pendente", conferidoEm: agora }, agora));
teste("bloqueado nunca entra", false, A.liberadoSemRede({ status: "bloqueado", conferidoEm: agora }, agora));
teste("sem nada guardado, não entra", false, A.liberadoSemRede(null, agora));

console.log("\n--- o painel ---");
const contas = [
  { uid: "a", nome: "Ana", email: "ana@x.com", status: "liberado", ultimoAcesso: agora - 3600000, criadoEm: agora - 9e8 },
  { uid: "b", nome: "Bia", email: "bia@x.com", status: "pendente", criadoEm: agora - 1000 },
  { uid: "c", nome: "Caio", email: "caio@x.com", status: "bloqueado", ultimoAcesso: agora - 100 },
  { uid: "d", nome: "Duda", email: "duda@x.com", status: "liberado", ultimoAcesso: agora - 60000, criadoEm: agora - 9e8 },
  { uid: "e", nome: "Edu", email: "edu@x.com", status: "pendente", criadoEm: agora - 5000 },
];
teste("quem espera em cima (o mais novo primeiro), bloqueados no fim", ["b", "e", "d", "a", "c"], A.ordenarContas(contas).map((c) => c.uid));
const r = A.resumoContas(contas, agora);
teste("as contas do topo do painel", [5, 2, 2, 1], [r.total, r.pendente, r.liberado, r.bloqueado]);
teste("filtro: só quem espera", ["b", "e"], A.filtrarContas(contas, "pendente", "").map((c) => c.uid));
teste("busca por nome ou e-mail, sem caixa", ["d"], A.filtrarContas(contas, "todos", "DUDA").map((c) => c.uid));

console.log("\n--- o aparelho e os erros ---");
teste("Android pelo app", "Android · app", A.aparelhoDe("Mozilla/5.0 (Linux; Android 14)", true));
teste("iPhone pelo navegador", "iPhone · navegador", A.aparelhoDe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", false));
teste("computador", "Computador · navegador", A.aparelhoDe("Mozilla/5.0 (Windows NT 10.0)", false));
teste("e-mail já cadastrado", "Já existe uma conta com este e-mail. Toque em Entrar.", A.erroDeConta("EMAIL_EXISTS"));
teste("senha fraca (o Firebase manda com explicação)", "A senha precisa de pelo menos 6 caracteres.", A.erroDeConta("WEAK_PASSWORD : Password should be at least 6 characters"));
teste("erro desconhecido diz o código", true, /XPTO/.test(A.erroDeConta("XPTO")));

console.log("\n--- o e-mail digitado errado ---");
teste("gmial vira gmail", "ana@gmail.com", A.sugerirEmail("ana@gmial.com"));
teste("hotmal.com vira hotmail.com", "ana@hotmail.com", A.sugerirEmail("Ana@Hotmal.com"));
teste("gmail.co vira gmail.com", "ana@gmail.com", A.sugerirEmail("ana@gmail.co"));
teste("e-mail certo: nada a sugerir", null, A.sugerirEmail("ana@gmail.com"));
teste("domínio da empresa: não inventa", null, A.sugerirEmail("ana@globalpack.com.br"));
teste("ainda digitando: não sugere", null, A.sugerirEmail("ana@gm"));

console.log("\n--- prazo, recado, filtros e a planilha ---");
{
  const ag = Date.parse("2026-10-28T12:00:00");
  teste("liberado sem prazo é liberado", "liberado", A.situacaoConta({ status: "liberado" }, ag));
  teste("liberado com prazo vencido é vencido", "vencido", A.situacaoConta({ status: "liberado", ate: ag - 1 }, ag));
  teste("bloqueado continua bloqueado mesmo com prazo", "bloqueado", A.situacaoConta({ status: "bloqueado", ate: ag + 864e5 }, ag));
  teste("sem prazo: zero", 0, A.prazoAte(0, ag));
  teste("30 dias vale até o fim do dia", "27/11/2026 23:59", new Date(A.prazoAte(30, ag)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
  teste("sem rede: liberado com prazo vencido não entra", false, A.liberadoSemRede({ status: "liberado", conferidoEm: ag, ate: ag - 1 }, ag));
  teste("recado novo aparece", true, A.recadoNovo({ aviso: "Oi", avisoEm: 10, avisoVisto: 5 }));
  teste("recado visto não volta", false, A.recadoNovo({ aviso: "Oi", avisoEm: 10, avisoVisto: 10 }));
  const cs = [
    { uid: "on", status: "liberado", ultimoAcesso: ag - 60000 },
    { uid: "sumido", status: "liberado", ultimoAcesso: ag - 40 * 864e5 },
    { uid: "nunca", status: "liberado" },
    { uid: "vence", status: "liberado", ultimoAcesso: ag - 864e5, ate: ag + 3 * 864e5 },
    { uid: "venceu", status: "liberado", ultimoAcesso: ag - 864e5, ate: ag - 864e5 },
  ];
  teste("online: abriu o app nos últimos 15 min", ["on"], cs.filter((c) => A.filtroConta(c, "online", ag)).map((c) => c.uid));
  teste("sumidos: 30 dias sem abrir, ou nunca abriu", ["sumido", "nunca"], cs.filter((c) => A.filtroConta(c, "sumidos", ag)).map((c) => c.uid));
  teste("prazo: vence em 7 dias ou já venceu", ["vence", "venceu"], cs.filter((c) => A.filtroConta(c, "vencendo", ag)).map((c) => c.uid));
  teste("o vencido sobe na lista, logo depois de quem espera", ["venceu"], A.ordenarContas(cs, ag).slice(0, 1).map((c) => c.uid));
  const csv = A.csvContas([{ nome: "Ana; Souza", email: "ana@x.com", status: "liberado", criadoEm: ag, acessos: 3, nota: 'diz "oi"' }], ag);
  teste("planilha: cabeçalho com ponto e vírgula", true, csv.indexOf("Nome;E-mail;Situação") >= 0);
  teste("planilha: texto com ; e aspas não quebra a coluna", true, csv.indexOf('"Ana; Souza";ana@x.com;Liberado;28/10/2026') >= 0 && csv.indexOf('"diz ""oi"""') >= 0);
}

console.log("\n--- os termos de uso ---");
{
  eval(pedaco("const AVISO_CONTEUDO = {", "\n// ---------------- FIM DOS DADOS") + "\nglobalThis.T = TERMOS_USO; globalThis.AVISO_CONTEUDO = AVISO_CONTEUDO;");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pagina = require("fs").readFileSync(require("path").join(__dirname, "..", "termos.html"), "utf8");
  const paragrafos = [].concat.apply([], T.secoes.map((s) => s[1]));
  const faltam = paragrafos.concat(T.secoes.map((s) => s[0]), T.resumo.map((r) => r[2])).filter((p) => pagina.indexOf(esc(p)) < 0);
  teste("o termos.html tem o mesmo texto do app", [], faltam.map((p) => p.slice(0, 40)));
  const [a, m, d] = T.versao.split("-");
  teste("o termos.html diz a versão de agora", true, pagina.indexOf("Versão de " + d + "/" + m + "/" + a) >= 0);
  teste("o conteúdo dos termos é o aviso de conteúdo do app", true, AVISO_CONTEUDO.completo.every((p) => paragrafos.indexOf(p) >= 0));
  teste("duas caixas de aceite: termos e conteúdo autorizado", [true, true], [/Termos de Uso/.test(T.caixas[0]) && /18 anos/.test(T.caixas[0]), /autorização/.test(T.caixas[1])]);
  teste("o cadastro só cria a conta com as duas caixas marcadas", true, /!\(marcas\[0\] && marcas\[1\]\)/.test(html));
  teste("o app não abre sem o aceite", true, html.indexOf('if (fase === "dentro" && !aceito)') >= 0);
  teste("as regras deixam a pessoa gravar o aceite", true, /'termos', 'termosEm'/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "firebase", "firestore.rules"), "utf8")));
  teste("nada nos termos sobrou do app de treino", [], paragrafos.filter((p) => /treino|médico|academia/i.test(p)));

  // a cópia exata da versão de agora: mudou o texto, tem de subir a versão
  const arq = require("path").join(__dirname, "..", "termos-versoes", T.versao + ".txt");
  const guardado = require("fs").existsSync(arq) ? require("fs").readFileSync(arq, "utf8") : "";
  teste("o texto de agora é o guardado em termos-versoes/<versão>.txt (mudou? suba a versão)", true, guardado === JSON.stringify(T));
}

console.log("\n--- o histórico de aceites (só o dono) ---");
{
  const regras = require("fs").readFileSync(require("path").join(__dirname, "..", "firebase", "firestore.rules"), "utf8");
  const bloco = regras.slice(regras.indexOf("match /aceites/{id}"), regras.indexOf("// qualquer outra coisa"));
  teste("só o dono lê o histórico", true, /allow get, list: if dono\(\);/.test(bloco));
  teste("ninguém altera nem apaga um aceite", true, /allow update, delete: if false;/.test(bloco));
  teste("a pessoa só registra o próprio aceite, com a hora do servidor", true,
    /conta == request\.auth\.uid/.test(bloco) && /email == request\.auth\.token\.email/.test(bloco) && /servidorEm == request\.time/.test(bloco));
  teste("o app manda a hora do servidor (REQUEST_TIME)", true, /setToServerValue: "REQUEST_TIME"/.test(html));
  const l = [
    { nome: "Ana", email: "ana@x.com", conta: "u1", termos: "2026-10-29", em: Date.parse("2026-10-29T10:00:00"), servidorEm: Date.parse("2026-10-29T10:00:02"), de: "cadastro", caixas: "a | b", hash: "abc" },
    { nome: "Bia; Souza", email: "bia@x.com", conta: "u2", termos: "2026-10-29", em: Date.parse("2026-10-29T11:00:00"), de: "novos" },
  ];
  teste("o mais novo primeiro", ["bia@x.com", "ana@x.com"], A.ordenarAceites(l).map((a) => a.email));
  const csv = A.csvAceites(l);
  teste("planilha: cabeçalho com a hora do servidor e a impressão digital", true, csv.indexOf("Registrado pelo servidor em") > 0 && csv.indexOf("SHA-256") > 0);
  teste("planilha: onde aceitou em palavras, e o ; não quebra a coluna", true, csv.indexOf('"Bia; Souza";bia@x.com;u2') > 0 && csv.indexOf("No cadastro") > 0 && csv.indexOf("Na tela de aceite (termos novos)") > 0);
}

console.log("\n--- a cobrança (o app pago) ---");
{
  const ag = Date.parse("2026-10-30T12:00:00");
  const dia = 864e5;
  const desl = A.lerCobranca({ planos: "lixo" });
  teste("sem configuração: cobrança desligada, 4 planos, 7 dias de teste", [false, 4, 7], [desl.ligada, desl.planos.length, desl.testeDias]);
  teste("planos guardados como texto voltam (preço e dias)", [9.9, 30], (() => { const c = A.lerCobranca({ planos: JSON.stringify([{ id: "mensal", preco: 9.9, dias: 30, ativo: true }]) }); return [c.planos[0].preco, c.planos[0].dias]; })());
  teste("o vitalício nunca tem dias", 0, A.lerCobranca({ planos: JSON.stringify([{ id: "vitalicio", dias: 99 }]) }).planos[3].dias);
  teste("link de pagamento só https", ["", "https://mpago.la/x"], (() => { const c = A.lerCobranca({ planos: JSON.stringify([{ id: "mensal", link: "javascript:alert(1)" }, { id: "anual", link: "https://mpago.la/x" }]) }); return [c.planos[0].link, c.planos[1].link]; })());
  const conta = { status: "liberado", email: "ana@x.com", criadoEm: ag - 400 * dia };
  // a chave desligada: nada muda para ninguém (o pedido do dono: hoje ninguém é afetado)
  teste("desligada: quem está liberado continua liberado", "liberado", A.situacaoConta(conta, ag, desl));
  teste("desligada: igual a não passar a cobrança", A.situacaoConta(conta, ag), A.situacaoConta(conta, ag, desl));
  const lig = Object.assign({}, desl, { ligada: true, desde: ag, testeDias: 7 });
  teste("ligada hoje: quem já usava ganha 7 dias de teste a partir de hoje", ["liberado", "teste"], [A.situacaoConta(conta, ag, lig), A.planoDaConta(conta, ag, lig).tipo]);
  teste("passado o teste, precisa pagar", "pagar", A.situacaoConta(conta, ag + 8 * dia, lig));
  teste("o teste vale até o fim do dia", "liberado", A.situacaoConta(conta, A.fimDoDia(ag + 7 * dia) - 1, lig));
  teste("cadastro novo depois de ligar: o teste conta do cadastro", "teste", A.planoDaConta(Object.assign({}, conta, { criadoEm: ag + 20 * dia }), ag + 25 * dia, lig).tipo);
  teste("pago até depois de hoje: entra", "liberado", A.situacaoConta(Object.assign({}, conta, { pagoAte: ag + 40 * dia }), ag + 30 * dia, lig));
  teste("pagamento vencido: precisa pagar", "pagar", A.situacaoConta(Object.assign({}, conta, { pagoAte: ag + 10 * dia }), ag + 30 * dia, lig));
  teste("vitalício: entra sempre", "liberado", A.situacaoConta(Object.assign({}, conta, { vitalicio: true }), ag + 900 * dia, lig));
  teste("cortesia sem prazo: entra", "liberado", A.situacaoConta(Object.assign({}, conta, { cortesia: true }), ag + 900 * dia, lig));
  teste("cortesia vencida: precisa pagar", "pagar", A.situacaoConta(Object.assign({}, conta, { cortesia: true, cortesiaAte: ag + 20 * dia }), ag + 30 * dia, lig));
  teste("o dono nunca paga", ["liberado", "dono"], [A.situacaoConta({ status: "liberado", email: "carlos.jr.81@hotmail.com", criadoEm: 1 }, ag + 99 * dia, lig), A.planoDaConta({ email: "carlos.jr.81@hotmail.com" }, ag, lig).tipo]);
  teste("bloqueado continua bloqueado (não vira 'pagar')", "bloqueado", A.situacaoConta(Object.assign({}, conta, { status: "bloqueado" }), ag + 30 * dia, lig));
  teste("aguardando aprovação continua aguardando", "pendente", A.situacaoConta(Object.assign({}, conta, { status: "pendente" }), ag + 30 * dia, lig));
  // sem rede: o plano que venceu também barra
  const cache = { status: "liberado", conferidoEm: ag + 9 * dia, cob: lig, conta: Object.assign({}, conta, { pagoAte: ag + 10 * dia }) };
  teste("sem rede: com plano valendo, entra", true, A.liberadoSemRede(cache, ag + 9.5 * dia));
  teste("sem rede: o plano venceu, não entra", false, A.liberadoSemRede(cache, ag + 11 * dia));
  teste("sem rede: com a cobrança desligada, como antes", true, A.liberadoSemRede(Object.assign({}, cache, { cob: desl }), ag + 11 * dia));
  // pagar e renovar
  const mensal = A.planoPorId(desl, "mensal");
  const p1 = A.acessoPago({ pagoAte: 0 }, mensal, ag);
  teste("mensal: 30 dias a partir da confirmação, até o fim do dia", A.fimDoDia(ag + 30 * dia), p1.pagoAte);
  teste("renovar antes de vencer soma os dias que faltavam", A.fimDoDia(p1.pagoAte + 30 * dia), A.acessoPago(p1, mensal, ag + 20 * dia).pagoAte);
  teste("renovar depois de vencido conta de hoje", A.fimDoDia(ag + 60 * dia + 30 * dia), A.acessoPago(p1, mensal, ag + 60 * dia).pagoAte);
  teste("vitalício grava vitalicio, não data", { vitalicio: true, plano: "vitalicio" }, A.acessoPago({}, A.planoPorId(desl, "vitalicio"), ag));
  teste("plano desativado e de preço zero saem da tela", ["unico", "vitalicio"], A.planosAtivos(A.lerCobranca({ planos: JSON.stringify([{ id: "mensal", ativo: false }, { id: "anual", preco: 0 }]) })).map((p) => p.id));
  // o Pix copia e cola (o exemplo do manual do Banco Central)
  teste("CRC do Pix bate com o exemplo do Banco Central", "1D3D", A.crc16Pix("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304"));
  const pix = A.pixCopiaECola({ chave: "carlos@exemplo.com", nome: "Carlos Jr Ávila", cidade: "São Paulo", valor: 19.9, txid: "TLABC123" });
  teste("Pix: começa pelo formato e tem a chave", true, pix.indexOf("000201") === 0 && pix.indexOf("0014br.gov.bcb.pix0118carlos@exemplo.com") > 0);
  teste("Pix: valor com ponto e duas casas", true, pix.indexOf("540519.90") > 0);
  teste("Pix: nome e cidade sem acento, em maiúsculas", true, pix.indexOf("5915CARLOS JR AVILA") > 0 && pix.indexOf("6009SAO PAULO") > 0);
  teste("Pix: o código do pagamento vai dentro", true, pix.indexOf("62120508TLABC123") > 0);
  teste("Pix: termina com o CRC certo", A.crc16Pix(pix.slice(0, -4)), pix.slice(-4));
  const tx = A.txidPagamento("u-1_abcDEF9999xyz", ag);
  teste("código do pagamento: só letras e números, até 25", true, /^[A-Z0-9]{1,25}$/.test(tx));
  // o livro-caixa
  const pags = [
    { uid: "a", status: "confirmado", valor: 19.9, confirmadoEm: ag, em: ag, nome: "Ana; S" },
    { uid: "b", status: "confirmado", valor: 149.9, confirmadoEm: ag - 400 * dia, em: ag - 400 * dia },
    { uid: "c", status: "informado", valor: 19.9, em: ag },
    { uid: "d", status: "recusado", valor: 19.9, em: ag },
  ];
  const rp = A.resumoPagamentos(pags, ag);
  teste("recebido no mês e a confirmar", [19.9, 1, 2, 169.8], [rp.mes, rp.aConfirmar, rp.confirmados, rp.total]);
  teste("os que esperam confirmação vêm primeiro", "c", A.ordenarPagamentos(pags)[0].uid);
  const csv = A.csvPagamentos(pags);
  teste("planilha de pagamentos: cabeçalho, vírgula no valor e ; protegido", true, csv.indexOf("Código do Pix (txid)") > 0 && csv.indexOf("19,90") > 0 && csv.indexOf('"Ana; S"') > 0);
  teste("painel: 'precisa pagar' filtra e conta", [1, 1], (() => {
    const l = [conta, Object.assign({}, conta, { email: "b@x.com", vitalicio: true })];
    return [A.resumoContas(l, ag + 30 * dia, lig).pagar, A.resumoContas(l, ag + 30 * dia, lig).pagantes];
  })());
  teste("texto do plano para o painel", "💳 Mensal até " + new Date(p1.pagoAte).toLocaleDateString("pt-BR"), A.textoPlanoConta({ tipo: "pago", ate: p1.pagoAte, plano: "mensal" }, desl));
  const regras = require("fs").readFileSync(require("path").join(__dirname, "..", "firebase", "firestore.rules"), "utf8");
  const bloco = regras.slice(regras.indexOf("match /pagamentos/{id}"), regras.indexOf("// qualquer outra coisa"));
  teste("regras: a pessoa só avisa (informado), com a hora do servidor; só o dono confirma", true,
    /status == 'informado'/.test(bloco) && /servidorEm == request\.time/.test(bloco) && /allow update: if dono\(\);/.test(bloco) && /allow delete: if false;/.test(bloco));
  teste("regras: a pessoa não grava o próprio acesso pago", false, /pagoAte|vitalicio|cortesia/.test(regras.slice(regras.indexOf("allow update: if dono() || (eu(uid)"), regras.indexOf("allow delete: if dono() || eu(uid)"))));
}

console.log("\n" + ok + " passou / " + mal + " falhou");
process.exit(mal ? 1 : 0);
