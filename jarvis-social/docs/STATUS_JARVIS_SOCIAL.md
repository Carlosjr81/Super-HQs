# Status do Jarvis Social (continuidade entre sessões)

> Ao ouvir "continue": leia este arquivo, confira o último run do workflow
> **Jarvis Social** no Actions e a saúde da API (se implantada) antes de mexer.
> Nunca grave token ou senha aqui.

| Campo | Valor |
|---|---|
| Repositório / pasta | `Carlosjr81/Super-HQs` › `jarvis-social/` (público) |
| Branch de trabalho | `ccr-272ef392-6vuh6i` (ainda **não** está na `main`); commit da fundação `a8cace1` |
| Actions | o workflow *Jarvis Social* só passa a existir para o GitHub depois do merge na `main` (dispatch exige o arquivo na branch padrão) |
| Etapa | A concluída (fundação) + B em parte (agendamento e adaptador Meta escritos e testados com simulador) |
| Testes | `node jarvis-social/testes/rodar.mjs` → 74 passou / 0 falhou (22/11/2026, sessão na nuvem) |
| Painel publicado | **Ainda não.** Depois do merge na `main`: https://carlosjr81.github.io/Super-HQs/jarvis-social/ (abre em DEMONSTRAÇÃO até o servidor existir) |
| Servidor (Supabase) | **Não criado.** Depende do passo 1 do dono em `docs/DEPLOY.md` |
| Instagram real | **Não conectado / nenhuma publicação real feita.** Depende do app da Meta (passo 2 do `DEPLOY.md`) |

## O que funciona hoje (provado por teste)
- Núcleo: fusos IANA (horário de verão incluso), frequência sem teto comercial
  com prévia de remarcação, máquina de estados com eventos, comandos em português.
- API `/v1` completa para o P0 (mídias, posts, agenda, editar/pausar/retomar/
  cancelar, frequência com prévia obrigatória, fila pausável, comandos, OAuth Instagram).
- Worker: contêiner → processamento → publicação → permalink; reconciliação de
  resposta ambígua sem duplicar; limite/Retry-After; 5 tentativas; token
  expirado → reconectar; lease vencido retomado; atraso → pausa e espera decisão.
- PostgreSQL real: migração, unicidade da idempotência, `reivindicar_jobs` com
  SKIP LOCKED provado com duas sessões simultâneas, RLS em todas as tabelas.
- Painel (Chromium 360×740, fuso da máquina Tóquio para provar que não vaza):
  Novo Reel com vídeo+capa+legenda+data → recibo com fuso → recarregar mantém →
  editar, pausar, cancelar → comando "Altere para dois vídeos por dia" com prévia.
  **Teste de viewport, não do aparelho real.**

## Bloqueios (só o dono resolve)
1. Criar o projeto grátis no Supabase e 3 segredos no GitHub (`docs/DEPLOY.md`, passo 1).
2. Criar o app da Meta e 2 segredos (`docs/DEPLOY.md`, passo 2).
3. Autorizar o merge desta branch na `main` (publica a pasta no GitHub Pages;
   o app Super HQs não muda).

## Próxima ação
- Com o merge feito e os segredos do passo 1: disparar o workflow
  **Jarvis Social** (`implantar: true`), conferir a prova de vida, entrar no
  painel pelo celular e rodar o roteiro de aceite de `docs/OPERACAO.md`.
- Com o passo 2: conectar @carlos.jr.81 e fazer UMA publicação real autorizada
  (registrar ID/permalink aqui). Até lá o adaptador Meta não tem selo
  "produção validada".
- Depois: limpeza de mídia já publicada (cota de 1 GB do Storage), retomada de
  upload por partes (TUS), importação inativa da fila do Metricool, cadastro de
  fontes (@vikingthales, @jacobpetry), conector MCP/ChatGPT.

## A confirmar na primeira implantação (escrito sem acesso às páginas oficiais)
- Supabase: rota da Management API `database/query`, `config/auth`, `api-keys`;
  `functions deploy --use-api`; tamanho do objeto por HEAD em `object/authenticated`.
- Meta: versão `v23.0`, hosts `graph.instagram.com`/`api.instagram.com`, nomes das
  permissões, `cover_url` para Reels, limites de vídeo (duração/tamanho/proporção).
Qualquer divergência: corrigir, rodar a trava e registrar aqui com a data.
