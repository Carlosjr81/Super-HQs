// Jarvis Social: service worker próprio (escopo só desta pasta).
// Guarda a casca do painel para abrir sem rede. NUNCA guarda a API:
// agendamento só vale depois de chegar ao servidor.
const CACHE = "jarvis-social-v1";
const CASCA = ["./", "./index.html", "./app.js", "./config.js", "./manifest.json", "./icone.svg",
  "./supabase/functions/_compartilhado/api.js", "./supabase/functions/_compartilhado/tempo.js",
  "./supabase/functions/_compartilhado/frequencia.js", "./supabase/functions/_compartilhado/estados.js",
  "./supabase/functions/_compartilhado/comandos.js", "./supabase/functions/_compartilhado/banco.js",
  "./supabase/functions/_compartilhado/cifra.js", "./supabase/functions/_compartilhado/armazenamento.js",
  "./supabase/functions/_compartilhado/instagram.js", "./supabase/functions/_compartilhado/worker.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CASCA.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("jarvis-social-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.includes("/jarvis-social/")) return;
  // Rede primeiro (versão nova chega logo); cache só sem rede.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
});
