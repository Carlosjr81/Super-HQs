# Mapeamento funcional (vivo)

Legenda da fonte: **O** observado (conector/execução), **D** documentação
pública, **I** inferido, **P** proposto. Consulta: 22/11/2026. "Teste" = suíte
em `testes/`. Nada aqui afirma acesso ao código interno do Metricool.

| Área | Prior. | Fonte | Implementação | Teste | Lacunas |
|---|---|---|---|---|---|
| Contas e marcas (organização, membros, fuso) | P0 | P | `organizacoes`, `membros`, papéis dono/admin/editor/aprovador/leitor | isolamento por ID conhecido (teste-api) | seletor de marca na tela (hoje 1 espaço por conta); convites |
| Planejamento: agenda em lista por dia, filtros, rascunhos | P0 | P | Agenda (lista diária, filtros por estado) | fluxo no navegador (teste-web) | calendário mensal opcional; filtro por conta; prévia de grade do perfil |
| Composição: vídeo, capa, legenda | P0 | D (limites 2200/30 #) | Novo Reel em 5 passos; contagem; zona 3:4 aproximada | teste-api/teste-web | validação de duração/proporção do Reel (regras da Meta a revalidar) |
| Agendamento: data/hora/fuso, frequência, pausa, reagendar | P0 | P | API + prévia obrigatória; sem teto comercial (técnico 48/dia) | teste-nucleo/teste-api | importação de lote |
| Publicação Instagram Reels (API com login do Instagram) | P0 | D (memória do Claude; site da Meta inacessível na sessão) | `instagram.js` + worker: contêiner, status, `media_publish`, permalink, cota | simulador (teste-worker) | **sem teste real**; capa via `cover_url` a confirmar; colaboradores, Trial Reels, música, enquete nativa: indisponíveis |
| Recibos verificáveis | P0 | P | `recibo` com confirmação em 3 níveis, contêiner, mídia, permalink, fonte | teste-api/teste-worker | — |
| Biblioteca (originais, hash, tags, busca) | P0 | P | mídias com SHA-256 (reaproveita repetido), miniatura, dimensões | teste-api | tags, busca, versões |
| API para Jarvis/ChatGPT | P0 | P | `/v1` + comandos em português | teste-api | OpenAPI completo, tokens de serviço com escopo, MCP |
| Rotina 40+ (fontes, não repetição) | P0 | O (registro v6 lido no ChatGPT, não aqui) | campo `fonte` (autor + link do vídeo-base) no post e no recibo | teste-api | cadastro de fontes; @vikingthales e @jacobpetry ainda não cadastrados nem analisados |
| Migração da fila do Metricool (inativa) | P0 (aceite 11) | O (conector, no ChatGPT) | — | — | não iniciado; conector Metricool não está nesta sessão |
| Analytics, relatórios, melhores horários | P1 | D | — | — | indisponível |
| Outros formatos e redes | P1–P2 | D | — | — | indisponível (sem botão que finja) |
| Inbox, SmartLinks, concorrentes, anúncios, white label | P2–P3 | D | — | — | indisponível |
