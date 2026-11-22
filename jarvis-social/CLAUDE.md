# Jarvis Social — regras para o Claude (vale dentro de `jarvis-social/`)

SaaS próprio de agendamento/publicação (começa por Reels do @carlos.jr.81).
Especificação: `PROMPT_CLAUDE_JARVIS_SOCIAL.md` do dono (22/11/2026).
**Estado atual e próxima ação: `docs/STATUS_JARVIS_SOCIAL.md` — leia primeiro
quando o dono disser "continue".**

## Onde mora e por quê
- Pasta isolada no repositório **público** `Carlosjr81/Super-HQs`, a pedido do
  dono ("crie um novo local no repositório"). Não mexe no app Super HQs: nada
  fora de `jarvis-social/` e dos dois workflows `jarvis-social*.yml`.
- Público ⇒ **nunca** entram voz, vídeos pessoais, tokens, senhas, `.env`.
  A voz e os motores ficam no `Jarvis-Claude` (privado). Mudar para um
  repositório privado `Jarvis-Social` é trivial (pasta autocontida).

## Trava antes de todo push
```bash
node jarvis-social/testes/rodar.mjs      # Jarvis Social (73+ testes)
node testes/rodar.js && node testes/verificar.js   # Super HQs continua inteiro
```
Sem `npm install`: zero dependências. A suíte SQL sobe um PostgreSQL
temporário; a do painel usa o Chromium da sessão (Playwright).

## Arquitetura em uma linha
Painel PWA estático (GitHub Pages) → API `/v1` (Supabase Edge Function) →
PostgreSQL + Storage privado; worker chamado pelo pg_cron a cada minuto
(reserva: Actions a cada 15 min). Toda regra está em
`supabase/functions/_compartilhado/*.js`, que roda igual no Node (testes),
no Deno (servidor) e no navegador (DEMONSTRAÇÃO).

## Regras que não podem quebrar
- Demonstração, "agendamento confirmado no Jarvis" e "publicação concluída"
  são três coisas diferentes (campo `recibo.confirmacao`). Publicado só com
  ID da mídia + permalink lidos da rede. Simulador nunca vira "concluída".
- O Instagram não tem fila nativa pela API: quem agenda é o Jarvis.
- Toda mudança de post é condicionada à versão; o worker só age se a versão
  do job for a do post; resposta ambígua ao publicar = conferir, nunca reenviar.
- Tenant vem da sessão (membros), nunca de campo do cliente.
- Sem teto comercial de publicações; só o limite técnico de 48/dia e a cota da rede.
- Fuso padrão America/Sao_Paulo; banco em UTC; nunca o fuso da máquina.
- Nada pago sem autorização do dono.
