// Jarvis Social — painel para celular (sem etapa de build).
// Dois modos, sempre rotulados na tela:
//  - SERVIDOR: config.js preenchido; tudo vai para a API no Supabase.
//  - DEMONSTRAÇÃO: a MESMA API roda dentro do navegador, com banco local e
//    Instagram simulado. Nada sai do aparelho e nada é publicado.
import { CONFIG } from "./config.js";
import { criarApi } from "./supabase/functions/_compartilhado/api.js";
import { BancoMemoria } from "./supabase/functions/_compartilhado/banco.js";
import { ArmazenamentoMemoria } from "./supabase/functions/_compartilhado/armazenamento.js";
import { criarInstagramSimulado } from "./supabase/functions/_compartilhado/instagram.js";
import { criarWorker } from "./supabase/functions/_compartilhado/worker.js";
import { ESTADOS } from "./supabase/functions/_compartilhado/estados.js";
import { formatarLocal, partesLocais, somarDias, NOMES_DIA_LONGO, FUSO_PADRAO } from "./supabase/functions/_compartilhado/tempo.js";
import { AJUDA } from "./supabase/functions/_compartilhado/comandos.js";

export const VERSAO_PAINEL = "2026-11-22a";
const CH = { sessao: "jarvis-social:sessao", demo: "jarvis-social:demo", modo: "jarvis-social:modo", rascunho: "jarvis-social:rascunho" };
const ls = {
  ler(k, padrao = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento local */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch {} },
};
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const novaChave = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

// ------------------------------------------------------------------ cliente
const servidorConfigurado = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnon);
let modo = servidorConfigurado && ls.ler(CH.modo) !== "demonstracao" ? "servidor" : "demonstracao";

function clienteDemonstracao() {
  const banco = new BancoMemoria(ls.ler(CH.demo, {}), (t) => ls.gravar(CH.demo, t));
  const arm = new ArmazenamentoMemoria();
  for (const m of banco._tab("midias")) arm.receber(m.caminho, m.tamanho, m.mime);
  const ig = criarInstagramSimulado();
  const api = criarApi({ banco, armazenamento: arm, instagram: ig, modo: "demonstracao", segredos: { urlPainel: location.href.split("#")[0] } });
  const usuario = { id: "demo", email: "demonstracao@local" };
  return {
    modo: "demonstracao", usuario: () => usuario,
    async chamar(metodo, caminho, corpo, consulta) {
      const r = await api.tratar({ metodo, caminho, corpo: corpo || {}, consulta: consulta || {}, usuario });
      if (r.excecao) console.error(r.excecao);
      if (r.status >= 400) throw Object.assign(new Error(r.corpo.mensagem), r.corpo, { status: r.status });
      return r.corpo;
    },
    async enviarArquivo(upload, arquivo, aoProgredir, midia) {
      for (let p = 0; p <= 100; p += 25) { aoProgredir(p / 100); await new Promise((r) => setTimeout(r, 60)); }
      arm.receber(midia.caminho, arquivo.size, arquivo.type);
    },
    async rodarWorker() { return criarWorker({ banco, armazenamento: arm, instagram: ig, dono: "demo-" + Date.now() }).rodar(); },
    sair() { ls.apagar(CH.demo); },
  };
}

function clienteServidor() {
  const base = CONFIG.supabaseUrl.replace(/\/$/, "");
  let sessao = ls.ler(CH.sessao);
  async function auth(caminho, corpo) {
    const r = await fetch(`${base}/auth/v1/${caminho}`, { method: "POST", headers: { apikey: CONFIG.supabaseAnon, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "Não deu para entrar.");
    return j;
  }
  function guardar(j) { sessao = { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email }; ls.gravar(CH.sessao, sessao); }
  async function token() {
    if (!sessao) return null;
    if (Date.now() > sessao.expira - 60e3) {
      try { guardar(await auth("token?grant_type=refresh_token", { refresh_token: sessao.refresh_token })); }
      catch { sessao = null; ls.apagar(CH.sessao); return null; }
    }
    return sessao.access_token;
  }
  return {
    modo: "servidor",
    usuario: () => sessao && { email: sessao.email },
    async entrar(email, senha) { guardar(await auth("token?grant_type=password", { email, password: senha })); },
    async cadastrar(email, senha) { const j = await auth("signup", { email, password: senha }); if (j.access_token) guardar(j); return j; },
    async chamar(metodo, caminho, corpo, consulta) {
      const t = await token();
      const q = consulta ? "?" + new URLSearchParams(Object.entries(consulta).filter(([, v]) => v != null)).toString() : "";
      let r;
      try {
        r = await fetch(`${base}/functions/v1/api${caminho}${q}`, { method: metodo, headers: { apikey: CONFIG.supabaseAnon, "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: corpo && metodo !== "GET" ? JSON.stringify(corpo) : undefined, cache: "no-store" });
      } catch { throw Object.assign(new Error("Sem conexão com o servidor. Nada foi confirmado; tente de novo."), { erro: "rede" }); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.mensagem || `Erro ${r.status}`), j, { status: r.status });
      return j;
    },
    enviarArquivo(upload, arquivo, aoProgredir) {
      return new Promise((ok, falha) => {
        const x = new XMLHttpRequest();
        x.open(upload.metodo || "PUT", upload.url);
        x.setRequestHeader("Content-Type", arquivo.type);
        x.setRequestHeader("x-upsert", "true");
        x.upload.onprogress = (e) => e.lengthComputable && aoProgredir(e.loaded / e.total);
        x.onload = () => (x.status < 300 ? ok() : falha(new Error(`Envio recusado (${x.status}).`)));
        x.onerror = () => falha(new Error("A conexão caiu durante o envio."));
        x.send(arquivo);
      });
    },
    sair() { sessao = null; ls.apagar(CH.sessao); },
  };
}

let cli = modo === "servidor" ? clienteServidor() : clienteDemonstracao();
let eu = null;

// ------------------------------------------------------------------ rascunho (texto no localStorage, arquivos no IndexedDB)
const idb = {
  abrir: () => new Promise((ok, falha) => { const r = indexedDB.open("jarvis-social", 1); r.onupgradeneeded = () => r.result.createObjectStore("arquivos"); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); }),
  async gravar(k, v) { try { const db = await idb.abrir(); await new Promise((ok) => { const t = db.transaction("arquivos", "readwrite"); t.objectStore("arquivos").put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch {} },
  async ler(k) { try { const db = await idb.abrir(); return await new Promise((ok) => { const r = db.transaction("arquivos").objectStore("arquivos").get(k); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch { return null; } },
  async apagar(k) { try { const db = await idb.abrir(); db.transaction("arquivos", "readwrite").objectStore("arquivos").delete(k); } catch {} },
};
function rascunhoNovo() { return { chave: novaChave(), passo: 0, legenda: "", data: "", hora: "", proximoLivre: false, videoMidia: null, capaMidia: null, enviando: false, postId: null, fonte: { autor: "", url: "" } }; }
let R = ls.ler(CH.rascunho) || rascunhoNovo();
let arquivos = { video: null, capa: null };
const salvarR = () => ls.gravar(CH.rascunho, R);

// ------------------------------------------------------------------ utilidades de tela
const fuso = () => (eu && eu.org && eu.org.fuso) || FUSO_PADRAO;
function faixaModo() {
  return cli.modo === "demonstracao"
    ? `<div class="faixa demo" role="status">DEMONSTRAÇÃO — tudo fica neste aparelho; nada é enviado ao Instagram. ${servidorConfigurado ? "" : "O servidor ainda não foi configurado."}</div>`
    : "";
}
function selo(p) { return `<span class="selo ${esc(p.estado)}">${esc(ESTADOS[p.estado] || p.estado)}</span>`; }
function confirmacaoTexto(rc) {
  return { demonstracao: "Demonstração (simulado)", agendamento_confirmado_no_jarvis: "Agendamento confirmado no servidor do Jarvis", publicacao_concluida: "Publicação concluída no Instagram", nao_confirmado: "Ainda não confirmado" }[rc.confirmacao] || rc.confirmacao;
}
function mensagemErro(e) { return esc(e && e.message ? e.message : String(e)); }
function abrirFolha(html) { $("#folha-conteudo").innerHTML = html; $("#folha").classList.remove("oculto"); const f = $("#folha-conteudo input, #folha-conteudo textarea, #folha-conteudo button"); f && f.focus(); }
function fecharFolha() { $("#folha").classList.add("oculto"); $("#folha-conteudo").innerHTML = ""; }
$("#folha").addEventListener("click", (e) => { if (e.target.id === "folha") fecharFolha(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolha(); });

function cartaoPost(p, { acoes = true } = {}) {
  const hora = p.agendado_utc ? formatarLocal(p.agendado_utc, p.fuso || fuso(), { comFuso: false }) : "sem data";
  const pode = (lista) => lista.includes(p.estado);
  return `<div class="cartao item" data-post="${esc(p.id)}">
    ${p._mini ? `<img class="miniatura" alt="" src="${esc(p._mini)}">` : `<div class="miniatura" aria-hidden="true"></div>`}
    <div class="texto">
      <p><strong>${esc(hora)}</strong> ${selo(p)}</p>
      <p>${esc((p.legenda || "(sem legenda)").slice(0, 120))}</p>
      ${p.permalink ? `<p><a href="${esc(p.permalink)}" target="_blank" rel="noopener">Ver no Instagram</a></p>` : ""}
      ${p.ultimo_erro ? `<p class="fraco">Motivo: ${esc(p.ultimo_erro)}</p>` : ""}
      ${acoes ? `<div class="linha">
        <button data-acao="detalhe">Detalhes</button>
        ${pode(["draft", "scheduled", "paused", "failed", "retry_wait", "awaiting_approval"]) ? `<button data-acao="editar">Editar</button>` : ""}
        ${pode(["scheduled", "retry_wait", "processing", "preparing"]) ? `<button data-acao="pausar">Pausar</button>` : ""}
        ${pode(["paused"]) ? `<button data-acao="retomar">Retomar</button>` : ""}
        ${pode(["draft", "scheduled", "paused", "failed", "retry_wait", "awaiting_approval", "processing", "preparing", "needs_reconciliation"]) ? `<button class="perigo" data-acao="cancelar">Cancelar</button>` : ""}
      </div>` : ""}
    </div></div>`;
}

async function comMiniaturas(posts) {
  let midias = [];
  try { midias = (await cli.chamar("GET", "/v1/midias")).midias; } catch {}
  const mapa = new Map(midias.map((m) => [m.id, m.miniatura]));
  return posts.map((p) => ({ ...p, _mini: mapa.get(p.capa_id) || mapa.get(p.video_id) || null }));
}

// ------------------------------------------------------------------ ações nos posts (delegação)
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-acao]");
  if (!b) return;
  const card = b.closest("[data-post]");
  const id = card && card.dataset.post;
  const acao = b.dataset.acao;
  try {
    if (acao === "detalhe") { location.hash = "#post/" + id; return; }
    if (!id) return;
    const { post } = await cli.chamar("GET", `/v1/posts/${id}`);
    if (acao === "editar") return editarPost(post);
    if (acao === "cancelar" && !confirm("Cancelar esta publicação? Ela não será enviada.")) return;
    b.disabled = true;
    await cli.chamar("POST", `/v1/posts/${id}/${acao}`, { versao: post.versao });
    await mostrar();
  } catch (err) {
    if (err.erro === "horario_passado" && acao === "retomar") { const { post } = await cli.chamar("GET", `/v1/posts/${id}`); return editarPost(post, "O horário original já passou: escolha um novo."); }
    alert(err.message);
    b.disabled = false;
  }
});

function editarPost(post, aviso = "") {
  const l = post.agendado_utc ? partesLocais(post.agendado_utc, post.fuso || fuso()) : null;
  abrirFolha(`<h2>Editar publicação</h2>${aviso ? `<div class="faixa erro">${esc(aviso)}</div>` : ""}
    <label for="ed-leg">Legenda</label><textarea id="ed-leg" maxlength="2200">${esc(post.legenda)}</textarea>
    <div class="linha"><div style="flex:1"><label for="ed-data">Data</label><input id="ed-data" type="date" value="${l ? l.data : ""}"></div>
    <div style="flex:1"><label for="ed-hora">Horário</label><input id="ed-hora" type="time" value="${l ? l.horaTexto : ""}"></div></div>
    <p class="fraco">Fuso: ${esc(post.fuso || fuso())}</p>
    <div id="ed-msg"></div>
    <div class="linha"><button id="ed-cancelar">Fechar</button><button class="primario" id="ed-salvar">Salvar</button></div>`);
  $("#ed-cancelar").onclick = fecharFolha;
  $("#ed-salvar").onclick = async () => {
    const corpo = { versao: post.versao, legenda: $("#ed-leg").value };
    const d = $("#ed-data").value, h = $("#ed-hora").value;
    if (d && h && (!l || d !== l.data || h !== l.horaTexto || post.estado === "paused")) { corpo.data = d; corpo.hora = h; }
    try {
      $("#ed-salvar").disabled = true;
      let r = await cli.chamar("PATCH", `/v1/posts/${post.id}`, corpo);
      if (r.post.estado === "paused" && corpo.data) r = await cli.chamar("POST", `/v1/posts/${post.id}/retomar`, { versao: r.post.versao });
      fecharFolha(); await mostrar();
    } catch (err) { $("#ed-msg").innerHTML = `<div class="faixa erro">${mensagemErro(err)}</div>`; $("#ed-salvar").disabled = false; }
  };
}

// ------------------------------------------------------------------ telas
const telas = {};

telas.entrar = async (el) => {
  el.innerHTML = `<h1>Jarvis Social</h1>
    <div class="cartao"><form id="f-entrar">
      <label for="email">E-mail</label><input id="email" type="email" autocomplete="email" inputmode="email" required>
      <label for="senha">Senha</label><input id="senha" type="password" autocomplete="current-password" minlength="8" required>
      <div id="msg"></div>
      <div class="linha" style="margin-top:12px"><button class="primario" type="submit">Entrar</button><button type="button" id="b-cadastrar">Criar conta</button></div>
    </form></div>
    <div class="cartao"><p>Quer só conhecer as telas?</p><button id="b-demo">Abrir demonstração (nada é publicado)</button></div>`;
  const msg = (t, tipo = "erro") => ($("#msg").innerHTML = `<div class="faixa ${tipo}">${esc(t)}</div>`);
  $("#f-entrar").onsubmit = async (e) => { e.preventDefault(); try { await cli.entrar($("#email").value, $("#senha").value); await iniciar(); } catch (err) { msg(err.message); } };
  $("#b-cadastrar").onclick = async () => {
    try { const j = await cli.cadastrar($("#email").value, $("#senha").value); if (j.access_token) await iniciar(); else msg("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.", "ok"); }
    catch (err) { msg(err.message); }
  };
  $("#b-demo").onclick = () => { ls.gravar(CH.modo, "demonstracao"); location.reload(); };
};

telas.novoEspaco = async (el) => {
  el.innerHTML = `<h1>Seu espaço</h1><div class="cartao"><form id="f-org">
    <label for="nome">Nome do espaço</label><input id="nome" value="carlos.jr.81" required>
    <label for="fz">Fuso</label><input id="fz" value="${FUSO_PADRAO}" required>
    <div id="msg"></div><button class="primario grande" style="margin-top:12px">Criar espaço</button></form></div>`;
  $("#f-org").onsubmit = async (e) => { e.preventDefault(); try { await cli.chamar("POST", "/v1/organizacoes", { nome: $("#nome").value, fuso: $("#fz").value }); await iniciar(); } catch (err) { $("#msg").innerHTML = `<div class="faixa erro">${mensagemErro(err)}</div>`; } };
};

telas.inicio = async (el) => {
  const hoje = partesLocais(new Date(), fuso()).data;
  const { posts } = await cli.chamar("GET", "/v1/posts", null, { de: hoje, ate: somarDias(hoje, 6) });
  const proximos = await comMiniaturas(posts.filter((p) => !["cancelled"].includes(p.estado)).slice(0, 5));
  el.innerHTML = `${faixaModo()}<h1>Início</h1>
    ${eu.alertas.map((a) => `<div class="faixa ${a.tipo === "pausa" ? "" : "erro"}">${esc(a.texto)} ${a.post_id ? `<a href="#post/${esc(a.post_id)}">ver</a>` : a.acao === "ajustes" ? `<a href="#ajustes">resolver</a>` : a.acao === "retomar" ? `<button data-fila="retomar">Retomar</button>` : ""}</div>`).join("")}
    <a class="botao primario grande" href="#criar" style="display:flex;align-items:center;justify-content:center;text-decoration:none">＋ Novo Reel</a>
    <div class="cartao"><form id="f-cmd"><label for="cmd">Diga o que fazer</label>
      <input id="cmd" placeholder="Ex.: Mostre minha agenda da semana" autocomplete="off" enterkeyhint="send">
      <button class="primario" style="margin-top:8px;width:100%">Enviar</button></form>
      <div id="cmd-resp"></div>
      <details><summary class="fraco">Exemplos</summary><ul>${AJUDA.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details></div>
    <h2>Próximos 7 dias</h2>
    ${proximos.length ? proximos.map((p) => cartaoPost(p)).join("") : `<p class="fraco">Nada programado. Toque em Novo Reel.</p>`}`;
  el.querySelectorAll("[data-fila]").forEach((b) => (b.onclick = async () => { await cli.chamar("POST", "/v1/fila/retomar"); await iniciar(); }));
  $("#f-cmd").onsubmit = (e) => { e.preventDefault(); executarComando($("#cmd").value, {}); };
};

async function executarComando(texto, extra) {
  const alvo = $("#cmd-resp");
  try {
    const r = await cli.chamar("POST", "/v1/comandos", { texto, ...extra });
    alvo.innerHTML = `<div class="faixa ${r.pergunta ? "" : "ok"}"><pre class="resposta">${esc(r.resposta)}</pre>
      ${r.confirmar ? `<div class="linha"><button class="primario" id="cmd-sim">Confirmar</button><button id="cmd-nao">Não</button></div>` : ""}</div>`;
    if (r.confirmar) {
      $("#cmd-sim").onclick = () => executarComando(texto, { confirmar: true, hash_previa: r.previa.hash_previa });
      $("#cmd-nao").onclick = () => (alvo.innerHTML = "");
    }
    if (!r.pergunta && !r.confirmar && r.interpretacao.acao !== "listar_agenda") { eu = await cli.chamar("GET", "/v1/eu"); }
  } catch (err) { alvo.innerHTML = `<div class="faixa erro">${mensagemErro(err)}</div>`; }
}

// --- Criar (Novo Reel): vídeo → capa → legenda → data/hora → revisar → programar
const PASSOS = ["Vídeo", "Capa", "Legenda", "Data e hora", "Revisar"];
telas.criar = async (el) => {
  if (!arquivos.video && R.videoNome) arquivos.video = await idb.ler("video");
  if (!arquivos.capa && R.capaNome) arquivos.capa = await idb.ler("capa");
  const p = R.passo;
  const url = (f) => (f ? URL.createObjectURL(f) : "");
  let corpo = "";
  if (p === 0) corpo = `<label for="in-video">Escolha o vídeo (MP4 ou MOV)</label>
      <input id="in-video" type="file" accept="video/mp4,video/quicktime,video/*">
      ${arquivos.video ? `<div class="previa"><video src="${url(arquivos.video)}" controls playsinline muted></video></div><p class="fraco">${esc(arquivos.video.name)} — ${(arquivos.video.size / 1048576).toFixed(1)} MB</p>` : R.videoMidia ? `<p>Vídeo já enviado: ${esc(R.videoNome || "")}</p>` : ""}`;
  if (p === 1) corpo = `<label for="in-capa">Capa (JPG ou PNG) — opcional</label>
      <input id="in-capa" type="file" accept="image/jpeg,image/png">
      ${arquivos.capa ? `<div class="previa"><img alt="Prévia da capa" src="${url(arquivos.capa)}"><div class="grade" aria-hidden="true"></div></div>
      <p class="fraco">O tracejado marca a zona aproximada do recorte da grade do perfil (3:4). Confira no app do Instagram: a Meta muda essas regras.</p>` : `<p class="fraco">Sem capa, o Instagram escolhe um quadro do vídeo.</p>`}
      ${arquivos.capa ? `<button id="tirar-capa">Remover capa</button>` : ""}`;
  if (p === 2) corpo = `<label for="in-leg">Legenda</label><textarea id="in-leg" maxlength="2200" placeholder="Escreva a legenda…">${esc(R.legenda)}</textarea>
      <p class="fraco" id="contagem"></p>
      <details><summary>Fonte do conteúdo (opcional)</summary>
      <label for="in-autor">Autor da fonte</label><input id="in-autor" value="${esc(R.fonte.autor)}" placeholder="@vikingthales">
      <label for="in-url">Link do vídeo-base</label><input id="in-url" type="url" inputmode="url" value="${esc(R.fonte.url)}"></details>`;
  if (p === 3) {
    const hoje = partesLocais(new Date(), fuso()).data;
    corpo = `<label><input type="checkbox" id="in-fila" ${R.proximoLivre ? "checked" : ""}> Usar o próximo horário livre da frequência</label>
      <div id="manual" class="${R.proximoLivre ? "oculto" : ""}"><div class="linha"><div style="flex:1"><label for="in-data">Data</label><input id="in-data" type="date" min="${hoje}" value="${esc(R.data)}"></div>
      <div style="flex:1"><label for="in-hora">Horário</label><input id="in-hora" type="time" value="${esc(R.hora)}"></div></div></div>
      <p class="fraco">Fuso: ${esc(fuso())}</p>`;
  }
  if (p === 4) corpo = `<dl class="recibo"><dt>Vídeo</dt><dd>${esc(R.videoNome || "—")}</dd><dt>Capa</dt><dd>${esc(R.capaNome || "automática")}</dd>
      <dt>Quando</dt><dd>${R.proximoLivre ? "próximo horário livre" : esc(R.data && R.hora ? `${R.data.split("-").reverse().join("/")} às ${R.hora}` : "—")} (${esc(fuso())})</dd>
      <dt>Conta</dt><dd>${esc((eu.conexoes.find((c) => c.estado === "ativa") || {}).usuario_rede ? "@" + eu.conexoes.find((c) => c.estado === "ativa").usuario_rede : "Instagram não conectado")}</dd>
      <dt>Legenda</dt><dd>${esc(R.legenda || "(vazia)")}</dd></dl>
      <div id="progresso"></div><div id="msg"></div>
      <button class="primario grande" id="programar">Programar</button>
      <button class="grande" id="salvar-rascunho" style="margin-top:8px">Salvar como rascunho</button>`;
  el.innerHTML = `${faixaModo()}<h1>Novo Reel</h1>
    <div class="passos" aria-hidden="true">${PASSOS.map((_, i) => `<span class="${i <= p ? "feito" : ""}"></span>`).join("")}</div>
    <h2>${p + 1}. ${PASSOS[p]}</h2>
    <div class="cartao">${corpo}</div>
    <div class="linha">${p > 0 ? `<button id="voltar">Voltar</button>` : ""}${p < 4 ? `<button class="primario" id="avancar">Avançar</button>` : ""}</div>
    <p><button id="descartar" class="perigo" style="margin-top:16px">Descartar rascunho</button></p>`;

  const ir = (n) => { R.passo = n; salvarR(); mostrar(); };
  $("#voltar") && ($("#voltar").onclick = () => ir(p - 1));
  $("#descartar").onclick = async () => { if (!confirm("Descartar este rascunho?")) return; R = rascunhoNovo(); arquivos = { video: null, capa: null }; salvarR(); await idb.apagar("video"); await idb.apagar("capa"); mostrar(); };
  if (p === 0) {
    $("#in-video").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; arquivos.video = f; R.videoNome = f.name; R.videoMidia = null; salvarR(); await idb.gravar("video", f); mostrar(); };
    $("#avancar").onclick = () => (arquivos.video || R.videoMidia ? ir(1) : alert("Escolha o vídeo."));
  }
  if (p === 1) {
    $("#in-capa").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; arquivos.capa = f; R.capaNome = f.name; R.capaMidia = null; salvarR(); await idb.gravar("capa", f); mostrar(); };
    $("#tirar-capa") && ($("#tirar-capa").onclick = async () => { arquivos.capa = null; R.capaNome = null; R.capaMidia = null; salvarR(); await idb.apagar("capa"); mostrar(); });
    $("#avancar").onclick = () => ir(2);
  }
  if (p === 2) {
    const conta = () => { const v = $("#in-leg").value; const tags = (v.match(/(^|\s)#[^\s#]+/g) || []).length; $("#contagem").textContent = `${[...v].length}/2200 caracteres · ${tags}/30 hashtags`; };
    conta();
    $("#in-leg").oninput = () => { R.legenda = $("#in-leg").value; salvarR(); conta(); };
    ["in-autor", "in-url"].forEach((i) => ($("#" + i).oninput = () => { R.fonte = { autor: $("#in-autor").value, url: $("#in-url").value }; salvarR(); }));
    $("#avancar").onclick = () => ir(3);
  }
  if (p === 3) {
    $("#in-fila").onchange = (e) => { R.proximoLivre = e.target.checked; salvarR(); $("#manual").classList.toggle("oculto", R.proximoLivre); };
    $("#in-data").oninput = (e) => { R.data = e.target.value; salvarR(); };
    $("#in-hora").oninput = (e) => { R.hora = e.target.value; salvarR(); };
    $("#avancar").onclick = () => (R.proximoLivre || (R.data && R.hora) ? ir(4) : alert("Escolha data e horário, ou o próximo horário livre."));
  }
  if (p === 4) {
    $("#programar").onclick = () => enviarRascunho(true);
    $("#salvar-rascunho").onclick = () => enviarRascunho(false);
  }
};

async function sha256(arquivo) {
  const h = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function miniaturaDe(arquivo) {
  return new Promise((ok) => {
    const ehVideo = arquivo.type.startsWith("video/");
    const el = document.createElement(ehVideo ? "video" : "img");
    const u = URL.createObjectURL(arquivo);
    const desenhar = () => {
      try {
        const w = ehVideo ? el.videoWidth : el.naturalWidth, h = ehVideo ? el.videoHeight : el.naturalHeight;
        const c = document.createElement("canvas"); const esc_ = 180 / Math.max(w, h); c.width = Math.round(w * esc_); c.height = Math.round(h * esc_);
        c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
        ok({ miniatura: c.toDataURL("image/jpeg", 0.7), largura: w, altura: h, duracao_seg: ehVideo ? Math.round(el.duration * 10) / 10 : null });
      } catch { ok({}); } finally { URL.revokeObjectURL(u); }
    };
    if (ehVideo) { el.muted = true; el.preload = "auto"; el.onloadeddata = () => { el.currentTime = Math.min(1, (el.duration || 1) / 2); }; el.onseeked = desenhar; }
    else el.onload = desenhar;
    el.onerror = () => ok({});
    setTimeout(() => ok({}), 8000);
    el.src = u;
  });
}

async function enviarMidia(tipo, arquivo, barra) {
  const meta = await miniaturaDe(arquivo);
  const { midia, upload } = await cli.chamar("POST", "/v1/midias", { tipo, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size, sha256: await sha256(arquivo), ...meta });
  if (upload) {
    await cli.enviarArquivo(upload, arquivo, (f) => (barra.style.width = Math.round(f * 100) + "%"), midia);
    return (await cli.chamar("POST", `/v1/midias/${midia.id}/finalizar`)).midia;
  }
  barra.style.width = "100%";
  return midia;
}

async function enviarRascunho(agendar) {
  const prog = $("#progresso"), msg = $("#msg");
  const botoes = [$("#programar"), $("#salvar-rascunho")];
  botoes.forEach((b) => (b.disabled = true));
  msg.innerHTML = "";
  try {
    R.enviando = true; salvarR();
    if (!R.videoMidia) {
      prog.innerHTML = `<p>Enviando o vídeo…</p><div class="barra-prog"><div id="bv"></div></div>`;
      if (!arquivos.video) throw new Error("O arquivo do vídeo não está mais neste aparelho. Volte ao passo 1 e escolha de novo.");
      R.videoMidia = (await enviarMidia("video", arquivos.video, $("#bv"))).id; salvarR();
    }
    if (arquivos.capa && !R.capaMidia) {
      prog.insertAdjacentHTML("beforeend", `<p>Enviando a capa…</p><div class="barra-prog"><div id="bc"></div></div>`);
      R.capaMidia = (await enviarMidia("capa", arquivos.capa, $("#bc"))).id; salvarR();
    }
    // A chave do rascunho torna o pedido idempotente: repetir (rede caiu, app
    // voltou do segundo plano) devolve o mesmo post em vez de duplicar.
    const fonte = R.fonte.autor || R.fonte.url ? R.fonte : undefined;
    const pedido = { video_id: R.videoMidia, capa_id: R.capaMidia || undefined, legenda: R.legenda, agendar, chave_idempotencia: R.chave + (agendar ? ":a" : ":r"), fonte,
      ...(agendar ? (R.proximoLivre ? { proximo_livre: true } : { data: R.data, hora: R.hora }) : {}) };
    const { post } = await cli.chamar("POST", "/v1/posts", pedido);
    // Só confirma depois de LER de volta o que ficou gravado no servidor.
    const lido = (await cli.chamar("GET", `/v1/posts/${post.id}`)).post;
    R = rascunhoNovo(); arquivos = { video: null, capa: null }; salvarR(); await idb.apagar("video"); await idb.apagar("capa");
    location.hash = "#post/" + lido.id;
  } catch (err) {
    R.enviando = false; salvarR();
    msg.innerHTML = `<div class="faixa erro">${mensagemErro(err)}<br>Nada foi confirmado. O rascunho continua salvo: toque em Programar de novo.</div>`;
    botoes.forEach((b) => (b.disabled = false));
  }
}

telas.agenda = async (el, filtro = ls.ler("jarvis-social:filtro", "ativos")) => {
  const hoje = partesLocais(new Date(), fuso()).data;
  const { posts } = await cli.chamar("GET", "/v1/posts", null, { de: somarDias(hoje, -7), ate: somarDias(hoje, 60), incluir_rascunhos: "1" });
  const F = { ativos: (p) => !["cancelled"].includes(p.estado), agendados: (p) => p.estado === "scheduled", pausados: (p) => p.estado === "paused", falhas: (p) => ["failed", "needs_reconciliation", "retry_wait"].includes(p.estado), publicados: (p) => p.estado === "published", rascunhos: (p) => p.estado === "draft", cancelados: (p) => p.estado === "cancelled" };
  const lista = await comMiniaturas(posts.filter(F[filtro] || F.ativos));
  const grupos = new Map();
  for (const p of lista) { const d = p.agendado_utc ? partesLocais(p.agendado_utc, fuso()).data : "sem data"; if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(p); }
  const titulo = (d) => d === "sem data" ? "Sem data (rascunhos)" : d === hoje ? "Hoje" : d === somarDias(hoje, 1) ? "Amanhã" : `${NOMES_DIA_LONGO[partesLocais(d + "T12:00:00Z", "UTC").diaSemana]}, ${d.split("-").reverse().join("/")}`;
  el.innerHTML = `${faixaModo()}<h1>Agenda</h1><p class="fraco">Horários em ${esc(fuso())}. Esta é a fila do Jarvis; ela não aparece na tela "programados" do app do Instagram.</p>
    <div class="chips" role="group" aria-label="Filtro">${Object.keys(F).map((k) => `<button class="chip ${k === filtro ? "ativo" : ""}" data-filtro="${k}" aria-pressed="${k === filtro}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
    ${eu.org.fila_pausada ? `<div class="faixa">Fila pausada. <button data-fila="retomar">Retomar</button></div>` : `<button data-fila="pausar" style="width:100%">Pausar todas as próximas publicações</button>`}
    ${lista.length ? [...grupos].map(([d, ps]) => `<div class="dia">${esc(titulo(d))}</div>${ps.map((p) => cartaoPost(p)).join("")}`).join("") : `<p class="fraco">Nada aqui.</p>`}`;
  el.querySelectorAll("[data-filtro]").forEach((b) => (b.onclick = () => { ls.gravar("jarvis-social:filtro", b.dataset.filtro); telas.agenda(el, b.dataset.filtro); }));
  el.querySelectorAll("[data-fila]").forEach((b) => (b.onclick = async () => { await cli.chamar("POST", `/v1/fila/${b.dataset.fila}`); eu = await cli.chamar("GET", "/v1/eu"); telas.agenda(el, filtro); }));
};

telas.post = async (el, id) => {
  const { post, eventos } = await cli.chamar("GET", `/v1/posts/${id}`);
  const rc = post.recibo;
  const [comMini] = await comMiniaturas([post]);
  el.innerHTML = `${faixaModo()}<h1>Publicação</h1>
    <div class="faixa ${rc.confirmacao === "publicacao_concluida" ? "ok" : rc.confirmacao === "demonstracao" ? "demo" : ""}"><strong>${esc(confirmacaoTexto(rc))}</strong>${rc.aviso ? `<br>${esc(rc.aviso)}` : ""}</div>
    ${cartaoPost(comMini)}
    <div class="cartao"><h3>Recibo</h3><dl class="recibo">
      <dt>Estado</dt><dd>${esc(rc.estado_texto)} (versão ${rc.versao})</dd>
      <dt>Quando</dt><dd>${esc(rc.agendado_local || "sem data")}</dd>
      <dt>Destino</dt><dd>Instagram ${esc(rc.perfil || "(conta não conectada)")}</dd>
      ${rc.fonte ? `<dt>Fonte</dt><dd>${esc(rc.fonte.autor || "")} ${rc.fonte.url ? `<a href="${esc(rc.fonte.url)}" target="_blank" rel="noopener">vídeo-base</a>` : ""}</dd>` : ""}
      <dt>Contêiner</dt><dd>${esc(rc.container_id || "—")}</dd>
      <dt>ID da mídia</dt><dd>${esc(rc.media_id || "—")}</dd>
      <dt>Permalink</dt><dd>${rc.permalink ? `<a href="${esc(rc.permalink)}" target="_blank" rel="noopener">${esc(rc.permalink)}</a>` : "—"}</dd>
      <dt>Código</dt><dd><small>${esc(post.id)}</small></dd></dl></div>
    <div class="cartao"><h3>Histórico</h3>${eventos.map((ev) => `<p><small>${esc(formatarLocal(ev.criado_em, fuso(), { comFuso: false }))}</small><br>${esc(ESTADOS[ev.para] || ev.para)} — ${esc(ev.motivo || "")}</p>`).join("")}</div>`;
};

telas.biblioteca = async (el) => {
  const { midias } = await cli.chamar("GET", "/v1/midias");
  el.innerHTML = `${faixaModo()}<h1>Biblioteca</h1>
    ${midias.length ? midias.map((m) => `<div class="cartao item">${m.miniatura ? `<img class="miniatura" alt="" src="${esc(m.miniatura)}">` : `<div class="miniatura"></div>`}
      <div class="texto"><p><strong>${esc(m.nome)}</strong></p><p class="fraco">${m.tipo === "video" ? "Vídeo" : "Capa"} · ${(m.tamanho / 1048576).toFixed(1)} MB${m.duracao_seg ? ` · ${m.duracao_seg}s` : ""}${m.largura ? ` · ${m.largura}×${m.altura}` : ""} · ${m.estado === "pronta" ? "pronto" : "envio incompleto"}</p>
      <p class="fraco">${esc(formatarLocal(m.criado_em, fuso(), { comFuso: false }))}</p></div></div>`).join("") : `<p class="fraco">Nenhum arquivo ainda.</p>`}`;
};

telas.ajustes = async (el) => {
  const pol = eu.org.politica;
  const status = new URLSearchParams(location.hash.split("?")[1] || "").get("instagram");
  const ativa = eu.conexoes.find((c) => c.estado === "ativa");
  el.innerHTML = `${faixaModo()}<h1>Ajustes</h1>
    ${status ? `<div class="faixa ${status === "conectado" ? "ok" : "erro"}">Instagram: ${esc({ conectado: "conectado", recusado: "autorização recusada", expirado: "o link expirou, tente de novo", erro: "não deu para concluir a conexão" }[status] || status)}</div>` : ""}
    <div class="cartao"><h2>Instagram</h2>
      ${eu.conexoes.map((c) => `<p>@${esc(c.usuario_rede)} — ${esc({ ativa: "conectada", reconectar: "precisa reconectar", revogada: "desconectada" }[c.estado])}${c.simulado ? " (simulada)" : ""}
        ${c.estado !== "revogada" ? `<button data-desconectar="${esc(c.id)}">Desconectar</button>` : ""}</p>`).join("")}
      ${eu.instagram_configurado ? `<button class="primario" id="conectar">${ativa ? "Conectar outra conta / reconectar" : "Conectar Instagram"}</button>` : `<div class="faixa">O app da Meta ainda não foi configurado no servidor. Passo a passo: docs/DEPLOY.md.</div>`}
      <p class="fraco">Conta profissional (criador ou empresa). A autorização é feita no próprio Instagram; o Jarvis nunca vê sua senha.</p></div>
    <div class="cartao"><h2>Frequência</h2>
      <p class="fraco">Sem limite do Jarvis: quantos horários quiser por dia. A cota oficial do Instagram é consultada antes de cada envio.</p>
      <label>Horários</label><div class="chips" id="horarios">${pol.horarios.map((h) => `<button class="chip ativo" data-tirar="${h}" aria-label="Remover ${h}">${h} ✕</button>`).join("")}</div>
      <div class="linha"><input id="nova-hora" type="time" style="flex:1"><button id="add-hora">Adicionar</button></div>
      <label>Dias</label><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" data-dia="${d}" ${pol.dias.includes(d) ? "checked" : ""}>${NOMES_DIA_LONGO[d].slice(0, 3)}</label>`).join("")}</div>
      <label for="pausa">Pausar a frequência até (opcional)</label><input id="pausa" type="date" value="${esc(pol.pausadaAte || "")}">
      <div id="prev"></div>
      <button class="primario" id="ver-previa" style="width:100%;margin-top:8px">Ver prévia e aplicar</button></div>
    <div class="cartao"><h2>Horário perdido</h2>
      <label for="atraso">Se o servidor ficar fora e passar do horário</label>
      <select id="atraso"><option value="aguardar">Pausar e esperar minha decisão</option><option value="publicar">Publicar assim mesmo</option><option value="reagendar">Mover para o próximo horário livre</option></select>
      <label for="tol">Tolerância (minutos)</label><input id="tol" type="number" inputmode="numeric" min="0" max="1440" value="${eu.org.tolerancia_atraso_min}">
      <label for="fuso">Fuso do espaço</label><input id="fuso" value="${esc(eu.org.fuso)}">
      <button id="salvar-org" style="width:100%;margin-top:8px">Salvar</button></div>
    <div class="cartao"><h2>Conta</h2><p>${esc((cli.usuario() || {}).email || "")}</p>
      ${cli.modo === "demonstracao" ? `<button id="rodar-worker">Simular o worker agora</button> <button class="perigo" id="zerar-demo">Apagar dados da demonstração</button>${servidorConfigurado ? ` <button id="ir-servidor">Usar o servidor</button>` : ""}` : `<button id="sair">Sair</button> <button id="ir-demo">Abrir demonstração</button>`}
      <p class="fraco">Painel ${VERSAO_PAINEL} · API ${esc(eu.versao_api)}</p></div>`;
  $("#atraso").value = eu.org.politica_atraso;
  const horarios = new Set(pol.horarios);
  el.querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => { horarios.delete(b.dataset.tirar); b.remove(); }));
  $("#add-hora").onclick = () => { const v = $("#nova-hora").value; if (!v || horarios.has(v)) return; horarios.add(v); $("#horarios").insertAdjacentHTML("beforeend", `<button class="chip ativo" data-tirar="${v}">${v} ✕</button>`); $("#horarios").lastElementChild.onclick = (e) => { horarios.delete(v); e.target.remove(); }; };
  const politica = () => ({ horarios: [...horarios].sort(), dias: [...el.querySelectorAll("[data-dia]:checked")].map((c) => +c.dataset.dia), pausadaAte: $("#pausa").value || null, fuso: eu.org.fuso });
  $("#ver-previa").onclick = async () => {
    try {
      const pv = await cli.chamar("POST", "/v1/frequencia/previa", { politica: politica() });
      $("#prev").innerHTML = `<div class="faixa">${pv.politica.horarios.length} por dia: ${pv.politica.horarios.join(", ")}.<br>${pv.mudancas.length ? `Remarca ${pv.mudancas.length} publicação(ões) da fila automática:<ul>${pv.mudancas.map((m) => `<li>${esc(m.de_local)} → ${esc(m.para_local || "sem horário")}</li>`).join("")}</ul>` : "Nenhuma publicação já programada muda."} Horários escolhidos à mão não mudam.</div>
        <button class="primario" id="aplicar" style="width:100%">Aplicar</button>`;
      $("#aplicar").onclick = async () => { await cli.chamar("PUT", "/v1/frequencia", { politica: pv.politica, hash_previa: pv.hash_previa }); eu = await cli.chamar("GET", "/v1/eu"); $("#prev").innerHTML = `<div class="faixa ok">Frequência aplicada.</div>`; };
    } catch (err) { $("#prev").innerHTML = `<div class="faixa erro">${mensagemErro(err)}</div>`; }
  };
  $("#salvar-org").onclick = async () => { try { await cli.chamar("PUT", "/v1/organizacao", { politica_atraso: $("#atraso").value, tolerancia_atraso_min: +$("#tol").value, fuso: $("#fuso").value }); eu = await cli.chamar("GET", "/v1/eu"); alert("Salvo."); } catch (err) { alert(err.message); } };
  $("#conectar") && ($("#conectar").onclick = async () => { try { const r = await cli.chamar("POST", "/v1/instagram/conectar"); if (r.url) location.href = r.url; else { eu = await cli.chamar("GET", "/v1/eu"); mostrar(); } } catch (err) { alert(err.message); } });
  el.querySelectorAll("[data-desconectar]").forEach((b) => (b.onclick = async () => { if (!confirm("Desconectar esta conta? As publicações agendadas não serão enviadas.")) return; await cli.chamar("POST", `/v1/instagram/${b.dataset.desconectar}/desconectar`); eu = await cli.chamar("GET", "/v1/eu"); mostrar(); }));
  $("#rodar-worker") && ($("#rodar-worker").onclick = async () => { const r = await cli.rodarWorker(); alert(`Worker simulado: ${r.reivindicados} tarefa(s). ${r.resultados.map((x) => x.resultado).join(", ")}`); eu = await cli.chamar("GET", "/v1/eu"); });
  $("#zerar-demo") && ($("#zerar-demo").onclick = () => { if (confirm("Apagar os dados da demonstração?")) { cli.sair(); location.reload(); } });
  $("#ir-servidor") && ($("#ir-servidor").onclick = () => { ls.apagar(CH.modo); location.reload(); });
  $("#ir-demo") && ($("#ir-demo").onclick = () => { ls.gravar(CH.modo, "demonstracao"); location.reload(); });
  $("#sair") && ($("#sair").onclick = () => { cli.sair(); location.hash = "#inicio"; location.reload(); });
};

// ------------------------------------------------------------------ roteamento
async function mostrar() {
  const el = $("#tela");
  const [rota, arg] = location.hash.replace(/^#/, "").split("?")[0].split("/");
  const aba = ["inicio", "criar", "agenda", "biblioteca", "ajustes"].includes(rota) ? rota : rota === "post" ? "agenda" : "inicio";
  document.querySelectorAll("nav.barra a").forEach((a) => { const at = a.dataset.aba === aba; a.classList.toggle("ativo", at); at ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
  try {
    if (rota === "post" && arg) await telas.post(el, arg);
    else await telas[aba](el);
  } catch (err) {
    el.innerHTML = `${faixaModo()}<div class="faixa erro">${mensagemErro(err)}</div><button id="tentar">Tentar de novo</button>`;
    $("#tentar").onclick = () => iniciar();
  }
}

async function iniciar() {
  const el = $("#tela");
  if (cli.modo === "servidor" && !cli.usuario()) { document.querySelector("nav.barra").classList.add("oculto"); return telas.entrar(el); }
  try { eu = await cli.chamar("GET", "/v1/eu"); }
  catch (err) {
    if (err.erro === "sem_organizacao") {
      if (cli.modo === "demonstracao") { await cli.chamar("POST", "/v1/organizacoes", { nome: "Demonstração" }); await cli.chamar("POST", "/v1/instagram/conectar"); return iniciar(); }
      document.querySelector("nav.barra").classList.add("oculto"); return telas.novoEspaco(el);
    }
    if (err.status === 401) { cli.sair(); return iniciar(); }
    el.innerHTML = `<div class="faixa erro">${mensagemErro(err)}</div><button onclick="location.reload()">Tentar de novo</button>`;
    return;
  }
  document.querySelector("nav.barra").classList.remove("oculto");
  await mostrar();
}

window.addEventListener("hashchange", mostrar);
// Voltou do segundo plano: relê o estado do servidor antes de qualquer reenvio.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !eu) return;
  try { eu = await cli.chamar("GET", "/v1/eu"); if (!location.hash.startsWith("#criar")) mostrar(); } catch {}
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
iniciar();
