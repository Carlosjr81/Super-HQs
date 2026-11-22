# Jarvis Social

Agendar e publicar Reels pelo celular, com servidor próprio (sem depender do
Metricool) e sem teto comercial de publicações.

- **Estado e próxima ação:** [`docs/STATUS_JARVIS_SOCIAL.md`](docs/STATUS_JARVIS_SOCIAL.md)
- **Colocar no ar pelo celular (R$ 0):** [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Usar (comandos, recibos, roteiro de aceite):** [`docs/OPERACAO.md`](docs/OPERACAO.md)
- **Por que assim:** [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · [`docs/MAPEAMENTO_FUNCIONAL.md`](docs/MAPEAMENTO_FUNCIONAL.md)
- **Contrato da API:** [`openapi.json`](openapi.json)

```
jarvis-social/
  index.html, app.js, sw.js, manifest.json, config.js   painel PWA (sem build)
  supabase/functions/_compartilhado/                    toda a regra (Node, Deno e navegador)
  supabase/functions/api, worker                        pontes HTTP do servidor
  supabase/migrations/                                  banco PostgreSQL
  testes/rodar.mjs                                      74 testes, zero dependências
```

Rodar localmente (opcional, só para desenvolvimento):
`node jarvis-social/testes/rodar.mjs` e, para ver o painel em demonstração,
`npx --yes http-server -p 8080 .` na raiz do repositório e abrir
`http://localhost:8080/jarvis-social/`.
