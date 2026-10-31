// Contrato do índice, preservação da estante e validação antes de salvar.
const html = require("./app").lerApp();
const vm = require("vm");
const { webcrypto } = require("crypto");
function trecho(inicio, fim) { return html.slice(html.indexOf(inicio), html.indexOf(fim, html.indexOf(inicio))); }
const ctx = { URL, Set, Map, Blob, crypto: webcrypto, AbortController, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(trecho("// ---------------- ESTANTE: AS CONTAS", "// ---------------- FIM DAS CONTAS DA ESTANTE") +
  trecho("// ---------------- CATALOGO: AS CONTAS", "// ---------------- FIM DAS CONTAS DO CATALOGO") +
  "\nthis.funcoes = {converterIndiceGenerico, urlDoCatalogo, mesclarEstantes, urlNaLargura, urlDoOriginal, caminhoNoArmazenamento, urlDoArmazenamento, direitosCompletos, colecaoDaTrilha, fichaDoAcervoApp, resumoDoEnvio};", ctx);
let ok = 0, mal = 0;
function teste(nome, esperado, obtido) {
  if (JSON.stringify(esperado) === JSON.stringify(obtido)) { ok++; console.log("  ok   " + nome); }
  else { mal++; console.log("  X    " + nome + ": " + JSON.stringify(obtido)); }
}
const F = ctx.funcoes;
const sha = "a".repeat(64);
const url = "https://acervo.example/catalog/catalog.json";
const item = {id:"edicao-1", source:"proprio", sha256:sha, path:"HQs/Minha Coleção/01.cbz", page_count:4, size_bytes:512, file_url:"https://arquivos.example/01.cbz", title:"Minha coleção", collection:"Coleção", category:"manga"};
const doc = () => ({schema_version:1, rights:{holder:"Autor de teste",license:"Autorização de teste",origin:"Fixture local"}, items:[{...item}]});
function recusa(mudar) { const d=doc(); mudar(d); try { F.converterIndiceGenerico(d,url); return false; } catch(e) { return true; } }
const obra=F.converterIndiceGenerico(doc(),url)[0];
teste("metadados e id do arquivo", [sha,"Minha coleção","manga",4,"zip"], [obra.id,obra.titulo,obra.categoria,obra.paginas,obra.tipo]);
teste("não presume download", undefined, obra.noAparelho);
teste("catálogo vazio válido", [], F.converterIndiceGenerico({schema_version:1,items:[]},url));
teste("rejeita esquema desconhecido",true,recusa(d=>d.schema_version=2));
teste("rejeita hash ausente",true,recusa(d=>delete d.items[0].sha256));
teste("rejeita edição sem páginas",true,recusa(d=>d.items[0].page_count=0));
teste("rejeita tamanho negativo",true,recusa(d=>d.items[0].size_bytes=-1));
teste("rejeita ausência de registro de direitos",true,recusa(d=>delete d.rights));
// ---- o acervo do app (Storage + Firestore)
const shaA = "b".repeat(64);
teste("arquivo no Storage com o nome do SHA-256", ["acervo/"+shaA+".cbz","acervo/"+shaA+".pdf"], [F.caminhoNoArmazenamento(shaA,"zip"), F.caminhoNoArmazenamento(shaA,"pdf")]);
teste("URL do Storage com o caminho codificado", "https://firebasestorage.googleapis.com/v0/b/super-hqs.firebasestorage.app/o/acervo%2F"+shaA+".cbz?alt=media", F.urlDoArmazenamento("super-hqs.firebasestorage.app","acervo/"+shaA+".cbz"));
teste("direitos: titular, licença e origem obrigatórios", [true,false,false], [F.direitosCompletos({titular:"A",licenca:"B",origem:"C"}), F.direitosCompletos({titular:"A",licenca:" ",origem:"C"}), F.direitosCompletos(null)]);
teste("a pasta vira a coleção", ["Turma", "", "Sub"], [F.colecaoDaTrilha("HQs/Turma/Edição 1.cbz"), F.colecaoDaTrilha("solta.cbz"), F.colecaoDaTrilha("A/B/Sub/x.pdf")]);
const fichaA = F.fichaDoAcervoApp({uid:shaA, sha256:shaA, titulo:"Edição 1", tipo:"zip", paginas:24, tamanho:999, caminho:"acervo/"+shaA+".cbz", categoria:"manga", capa:"data:image/jpeg;base64,AAAA", titular:"T", licenca:"L", origem:"O", status:"publicada"}, "balde");
teste("ficha do acervo vira edição da estante, privada e com direitos", [shaA, 24, "manga", true, "T", "data:image/jpeg;base64,AAAA"], [fichaA.id, fichaA.paginas, fichaA.categoria, fichaA.online.privado, fichaA.direitos.titular, fichaA.capaUrl]);
teste("capa que não é JPEG em base64 é descartada (nada de script na capa)", "", F.fichaDoAcervoApp({uid:shaA, tipo:"pdf", paginas:1, caminho:"x", capa:"javascript:alert(1)"}, "b").capaUrl);
teste("ficha sem caminho, sem páginas ou com tipo estranho não entra", [null,null,null], [F.fichaDoAcervoApp({uid:shaA,tipo:"zip",paginas:3},"b"), F.fichaDoAcervoApp({uid:shaA,tipo:"zip",paginas:0,caminho:"x"},"b"), F.fichaDoAcervoApp({uid:shaA,tipo:"rar",paginas:3,caminho:"x"},"b")]);
teste("relatório do envio separa cada situação", {encontrados:5,integros:4,enviados:2,repetidos:1,erro:1,direitos:1},
  F.resumoDoEnvio([{situacao:"enviado"},{situacao:"enviado"},{situacao:"repetido"},{situacao:"erro"},{situacao:"direitos"}]));
const fsR = require("fs"), pathR = require("path");
const regrasFs = fsR.readFileSync(pathR.join(__dirname,"..","firebase","firestore.rules"),"utf8");
const regrasSt = fsR.readFileSync(pathR.join(__dirname,"..","firebase","storage.rules"),"utf8");
teste("Firestore v6: acervo só o dono grava, com direitos e hora do servidor", true,
  /match \/acervo\/\{sha\}/.test(regrasFs) && /allow create: if dono\(\) && sha\.matches/.test(regrasFs) && /enviadoEm == request\.time/.test(regrasFs) && /allow delete: if dono\(\);\s*\}\s*\n\s*\/\/ a regra das contas novas/.test(regrasFs));
teste("Firestore v6: leitor só vê publicada e com conta liberada", true, /resource\.data\.status == 'publicada' && leitorLiberado\(\)/.test(regrasFs));
teste("Storage: só o dono envia/apaga, arquivo imutável, leitor liberado lê", true,
  /allow create: if dono\(\)/.test(regrasSt) && /allow update: if false;/.test(regrasSt) && /allow get: if dono\(\) \|\| \(request\.auth != null && leitorLiberado\(\)\)/.test(regrasSt) && /allow read, write: if false;/.test(regrasSt));
teste("as duas regras usam a mesma conta de plano", true, ["cortesiaAte","vitalicio","pagoAte","testeDias","cobrancaDesde"].every((k)=>regrasFs.includes(k)&&regrasSt.includes(k)));
teste("o catálogo nativo (versao/obras) não é aceito no lugar do índice", true, (()=>{try{F.converterIndiceGenerico({versao:1,obras:[]},url);return false;}catch(e){return /formato nativo/.test(e.message);}})());
const fb="https://firebasestorage.googleapis.com/v0/b/super-hqs.appspot.com/o/acervo%2Fp1.jpg?alt=media&token=abc";
teste("URL de outro provedor passa inteira (com os parâmetros)", [fb, fb], [F.urlNaLargura(fb,1280), F.urlDoOriginal(fb)]);
teste("miniatura do Wikimedia: host, largura e sem rastreio", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/330px-X.jpg",
  F.urlNaLargura("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg?utm_source=x",300));
teste("original do Wikimedia sem rastreio; http recusado", ["https://upload.wikimedia.org/a/X.jpg",""], [F.urlDoOriginal("https://upload.wikimedia.org/a/X.jpg?utm=1"), F.urlDoOriginal("http://x/y.jpg")]);
teste("rejeita arquivo repetido",true,recusa(d=>d.items.push({...item})));
teste("rejeita javascript em arquivo",true,recusa(d=>d.items[0].file_url="javascript:alert(1)"));
teste("rejeita credencial na URL",true,recusa(d=>d.items[0].file_url="https://pessoa:senha@acervo.example/a.cbz"));
teste("rejeita pasta do Drive",true,recusa(d=>d.items[0].file_url="https://drive.google.com/drive/folders/pasta"));
teste("CBR não é anunciado como legível",true,recusa(d=>d.items[0].path="a.cbr"));
const relativo=doc(); delete relativo.items[0].file_url; relativo.files_base_url="../"; relativo.items[0].storage_path="objects/Minha Coleção/#01.cbz";
teste("caminho relativo preserva espaços e #", "https://acervo.example/objects/Minha%20Cole%C3%A7%C3%A3o/%2301.cbz",F.converterIndiceGenerico(relativo,url)[0].online.url);
relativo.items[0].storage_path="../segredo.cbz";
teste("rejeita saída da raiz",true,(()=>{try{F.converterIndiceGenerico(relativo,url);return false;}catch(e){return true;}})());
const local={...obra,online:undefined,leitura:{pagina:2,em:20},capa:"miniatura",categoria:"hq"};
const mesclada=F.mesclarEstantes([local],[obra]);
teste("não duplica arquivo local e online",1,mesclada.length);
teste("preserva progresso e categoria pessoal",[2,"hq",true],[mesclada[0].leitura.pagina,mesclada[0].categoria,mesclada[0].noAparelho]);
teste("não altera a entrada",undefined,local.noAparelho);

// Exercita a função real de download com os limites do navegador simulados.
const baixador=trecho("async function baixarObraOnline(obra)","// ---------------- ESTANTE: ABRIR OS ARQUIVOS");
ctx.hexDe = b=>Buffer.from(b).toString("hex");
ctx.abrirArquivoDaEstante = async ()=>({paginas:4,imagem:async()=>new Blob(["capa"]),fechar(){}});
ctx.miniatura = async b=>b;
ctx.tipoDoArquivo = b=>b[0]===0x50?"zip":null;
let gravou=0;
ctx.estanteDb={arquivo:async()=>null,obra:async()=>null,guardar:async()=>{gravou++;}};
vm.runInContext(baixador+"\nthis.baixar = baixarObraOnline;",ctx);
(async()=>{
  const bytes=new Blob(["PK\x03\x04arquivo de teste"]);
  const hash=Buffer.from(await webcrypto.subtle.digest("SHA-256",await bytes.arrayBuffer())).toString("hex");
  ctx.fetch=async()=>({ok:true,blob:async()=>bytes});
  const real={...obra,id:hash,tamanho:bytes.size};
  const salva=await ctx.baixar(real);
  teste("download íntegro grava uma vez",[1,true],[gravou,salva.noAparelho]);
  let falhou=false;
  try{await ctx.baixar({...real,id:sha});}catch(e){falhou=true;}
  teste("hash divergente não grava",[true,1],[falhou,gravou]);
  ctx.fetch=async()=>({ok:true,blob:async()=>new Blob(["<html>login</html>"])});
  falhou=false;
  try{await ctx.baixar(real);}catch(e){falhou=true;}
  teste("HTML de login não vira edição",[true,1],[falhou,gravou]);
  ctx.estanteDb.arquivo=async()=>bytes;
  ctx.estanteDb.obra=async()=>({...real,leitura:{pagina:3,em:10}});
  ctx.fetch=async()=>{throw Error("não deveria baixar");};
  teste("arquivo local funciona sem rede",3,(await ctx.baixar(real)).leitura.pagina);
  console.log("\n"+ok+" passou / "+mal+" falhou");
  process.exit(mal?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
