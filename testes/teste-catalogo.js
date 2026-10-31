// Contrato do índice, preservação da estante e validação antes de salvar.
const html = require("./app").lerApp();
const vm = require("vm");
const { webcrypto } = require("crypto");
function trecho(inicio, fim) { return html.slice(html.indexOf(inicio), html.indexOf(fim, html.indexOf(inicio))); }
const ctx = { URL, Set, Map, Blob, crypto: webcrypto, AbortController, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(trecho("// ---------------- ESTANTE: AS CONTAS", "// ---------------- FIM DAS CONTAS DA ESTANTE") +
  trecho("// ---------------- CATALOGO: AS CONTAS", "// ---------------- FIM DAS CONTAS DO CATALOGO") +
  "\nthis.funcoes = {normalizarCatalogo, urlDoCatalogo, mesclarEstantes};", ctx);
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
function recusa(mudar) { const d=doc(); mudar(d); try { F.normalizarCatalogo(d,url); return false; } catch(e) { return true; } }
const obra=F.normalizarCatalogo(doc(),url)[0];
teste("metadados e id do arquivo", [sha,"Minha coleção","manga",4,"zip"], [obra.id,obra.titulo,obra.categoria,obra.paginas,obra.tipo]);
teste("não presume download", undefined, obra.noAparelho);
teste("catálogo vazio válido", [], F.normalizarCatalogo({schema_version:1,items:[]},url));
teste("rejeita esquema desconhecido",true,recusa(d=>d.schema_version=2));
teste("rejeita hash ausente",true,recusa(d=>delete d.items[0].sha256));
teste("rejeita edição sem páginas",true,recusa(d=>d.items[0].page_count=0));
teste("rejeita tamanho negativo",true,recusa(d=>d.items[0].size_bytes=-1));
teste("rejeita ausência de registro de direitos",true,recusa(d=>delete d.rights));
teste("rejeita arquivo repetido",true,recusa(d=>d.items.push({...item})));
teste("rejeita javascript em arquivo",true,recusa(d=>d.items[0].file_url="javascript:alert(1)"));
teste("rejeita credencial na URL",true,recusa(d=>d.items[0].file_url="https://pessoa:senha@acervo.example/a.cbz"));
teste("rejeita pasta do Drive",true,recusa(d=>d.items[0].file_url="https://drive.google.com/drive/folders/pasta"));
teste("CBR não é anunciado como legível",true,recusa(d=>d.items[0].path="a.cbr"));
const relativo=doc(); delete relativo.items[0].file_url; relativo.files_base_url="../"; relativo.items[0].storage_path="objects/Minha Coleção/#01.cbz";
teste("caminho relativo preserva espaços e #", "https://acervo.example/objects/Minha%20Cole%C3%A7%C3%A3o/%2301.cbz",F.normalizarCatalogo(relativo,url)[0].online.url);
relativo.items[0].storage_path="../segredo.cbz";
teste("rejeita saída da raiz",true,(()=>{try{F.normalizarCatalogo(relativo,url);return false;}catch(e){return true;}})());
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
