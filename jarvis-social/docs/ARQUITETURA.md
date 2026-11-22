# Arquitetura do Jarvis Social

Escolha: a **menor arquitetura gratuita** que cumpre "funciona com a conversa
fechada e o computador desligado", com o mesmo fluxo de desenvolvimento do
Treino Livre/Super HQs (site estático no Pages, sem build, testes `node`,
publicação pela sessão do Claude no celular).

```
celular ──► GitHub Pages: painel PWA (index.html + app.js, sem build)
               │  HTTPS + token do login (Supabase Auth)
               ▼
           Supabase Edge Function `api`  (/v1, mesma regra dos testes)
               │ service role (só no servidor)
               ▼
           PostgreSQL (estado, jobs, eventos)   Storage privado `midias`
               ▲                                     │ URL assinada 6 h
   pg_cron (1 min) ─► Edge Function `worker` ────────┴──► Instagram Graph API
   Actions (15 min, reserva) ─┘
```

## Por que assim
- **Fonte única da regra**: `supabase/functions/_compartilhado/*.js` é JS puro
  (fetch/WebCrypto/Intl). O mesmo código roda no Node (74 testes), no Deno
  (servidor) e no navegador (DEMONSTRAÇÃO). Não há duas implementações para
  divergir.
- **PostgreSQL** (pedido no prompt): transações, `unique (org, chave)` para
  idempotência, `reivindicar_jobs` com `FOR UPDATE SKIP LOCKED` e lease.
  O Firestore do Super HQs não foi usado: o prompt pede banco relacional, e
  misturar projetos é proibido.
- **Sem transação entre chamadas REST**: a segurança vem da versão. Toda
  mudança de post é `PATCH ... where versao = X and estado = Y`; o worker
  publica só se a versão do job for a do post. Evento perdido num crash não
  desfaz nada.
- **Worker em passos curtos** (um passo por execução, estado gravado antes da
  chamada externa): cabe no limite de tempo das Edge Functions e sobrevive a
  reinício.
- **Relógio**: pg_cron a cada minuto (preciso). O cron do Actions pode atrasar
  ou ser descartado em pico (documentação do GitHub), por isso é só reserva.
- **Mídia**: bucket privado; o navegador envia por URL de upload assinada
  criada pela API depois de conferir a organização; a Meta busca o vídeo por
  URL assinada de 6 h criada na hora do envio. Tamanho conferido antes.
- **Tokens da Meta**: AES-256-GCM no banco; a API nunca devolve o token.
- **RLS ligada sem políticas**: o navegador não lê tabela nenhuma direto.

## Recursos e custo (22/11/2026)
| Recurso | Uso | Custo | Situação |
|---|---|---|---|
| GitHub Pages (repo público) | painel | R$ 0 | verificado (já usado pelo Super HQs) |
| GitHub Actions (repo público) | testes, implantação, relógio reserva | R$ 0 | verificado (repo público) |
| Supabase Free | Postgres 500 MB, Storage 1 GB, upload até 50 MB/arquivo, Edge Functions ~500 mil chamadas/mês, pg_cron | R$ 0 | **estimado** pela documentação pública; conferir em supabase.com/pricing |
| Instagram Graph API | publicação | R$ 0 | sujeito à cota oficial (consultada antes de cada envio) |

Contas pelo uso diário: worker a cada minuto ≈ 44 mil chamadas/mês (< 10% da
cota). **Storage de 1 GB ≈ 20–40 Reels**: falta a limpeza automática de vídeo
já publicado (pendência registrada no STATUS). Projetos Free podem ser pausados
por inatividade; as chamadas do relógio contam como atividade — **a confirmar**
na prática. Se o volume crescer, o próximo degrau é pago e só com autorização.

## Alternativas descartadas
- Actions como servidor/cron principal: não é hospedagem e atrasa.
- Firebase do Super HQs: projeto de outro produto; Functions exigem Blaze.
- Render/Fly/Koyeb grátis: hibernam ou pedem cartão; banco grátis expira.
- Túnel para o notebook: exige computador ligado (proibido pelo prompt).
