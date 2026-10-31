// Super HQs - Service Worker (modo offline). Veio do Treino Livre.
const CACHE = "superhqs-v5";
// A vinheta de abertura num cache só dela, preservado entre versões: guardá-la
// no cache da versão a baixaria de novo a cada atualização do app.
const CACHE_MIDIA = "superhqs-midia";
// As edições do acervo baixadas para ler sem internet (Etapa 4). Fica fora do
// cache da versão: uma atualização do app não pode apagar a estante offline.
const CACHE_ACERVO = "superhqs-acervo";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./termos.html",
  "./privacidade.html",
  "./fontes/inter-latin.woff2",
  "./fontes/inter-latin-ext.woff2",
  // O "?v=3" precisa bater exatamente com o endereço usado no index.html,
  // senão o que é guardado aqui nunca é encontrado depois.
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js?v=3",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js?v=3",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js?v=3",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    // Um a um, e não addAll: uma URL que falhe não derruba o cache inteiro.
    // cache: "reload" passa por cima do cache HTTP do navegador (o GitHub Pages
    // manda max-age=600), senão uma versão nova guardaria os arquivos velhos.
    caches.open(CACHE).then((c) =>
      Promise.all(ARQUIVOS.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== CACHE_MIDIA && k !== CACHE_ACERVO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  // Contador de visitas: nunca interceptar (precisa chegar ao servidor para contar)
  if (url.hostname.indexOf("goatcounter") !== -1 || url.hostname === "gc.zgo.at") return;
  // O arquivo da versão existe para delatar que há versão nova: nunca do cache.
  if (url.pathname.indexOf("versao.json") >= 0) return;
  // As contas (login, chave e o status liberado/bloqueado) nunca vêm do cache:
  // um bloqueio guardado como "liberado" deixaria a pessoa entrando para sempre.
  if (url.hostname === "identitytoolkit.googleapis.com" || url.hostname === "securetoken.googleapis.com" || url.hostname === "firestore.googleapis.com") return;
  // O acervo (Firebase Storage) passa direto: quem guarda as edições para ler
  // offline é o app, que confere página por página antes de dizer "disponível".
  if (url.hostname === "firebasestorage.googleapis.com") return;
  // O catálogo do acervo: rede primeiro (é ele que traz as novidades da
  // sincronização), guardado numa chave só, para abrir offline com o último.
  if (url.pathname.endsWith("/catalogo/acervo.json")) {
    const chave = url.origin + url.pathname;
    e.respondWith(fetch(new Request(chave, { cache: "no-store" })).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE_ACERVO).then((c) => c.put(chave, cp)).catch(() => {}); }
      return res;
    }).catch(() => caches.open(CACHE_ACERVO).then((c) => c.match(chave)).then((r) => r || Response.error())));
    return;
  }
  // As páginas do acervo (Wikimedia Commons) passam direto: guardar todas
  // encheria o celular. Baixar uma edição para ler offline é a Etapa 4.
  if (url.hostname === "upload.wikimedia.org" || url.hostname === "thumb.wikimedia.org") return;
  // O login com o Google: sempre da rede
  if (url.hostname === "accounts.google.com" || url.hostname === "www.googleapis.com") return;
  // A vinheta: do cache próprio, e na falta, da rede inteira (sem o pedaço
  // que o vídeo pede), guardada para as próximas aberturas.
  if (/\/abertura-v\d+\.mp4$/.test(url.pathname)) {
    const chave = url.origin + url.pathname;
    e.respondWith(caches.open(CACHE_MIDIA).then((c) => c.match(chave).then((r) => r || fetch(chave).then((resp) => {
      if (resp.ok && resp.status === 200) c.put(chave, resp.clone()).catch(() => {});
      return resp;
    }))));
    return;
  }

  const ehApp = e.request.mode === "navigate" || url.pathname.endsWith("index.html");
  if (ehApp) {
    // App: rede primeiro (para receber atualizações), cache se estiver offline.
    // "no-store": sem isto o fetch daqui é servido pelo cache HTTP do próprio
    // navegador, e o "rede primeiro" devolve a cópia velha.
    e.respondWith(
      fetch(new Request(e.request.url, { cache: "no-store" }))
        .then((res) => {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
    );
  } else {
    // Bibliotecas e ícones: cache primeiro (rápido e funciona offline)
    e.respondWith(
      caches.match(e.request).then((r) => {
        if (r) return r;
        return fetch(e.request)
          .then((res) => {
            const cp = res.clone();
            if (res.ok || res.type === "opaque") caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
            return res;
          })
          .catch(() => Response.error());
      })
    );
  }
});
