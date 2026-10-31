# A sincronização do acervo

O acervo que o Super HQs oferece a todos vem daqui. Um serviço agendado no
GitHub Actions (`.github/workflows/sincronizar.yml`) consulta as fontes
autorizadas, publica o que tem direito de republicação comprovado e manda o
resto para revisão. Roda no servidor do GitHub, sem computador ligado e sem
conversa aberta.

## O que entra e o que não entra

**Só fontes com direito de republicação.** Hoje: obras em domínio público no
Brasil (Lei 9.610/98, art. 41: autor morto há mais de 70 anos, contados de
1º de janeiro do ano seguinte), com as imagens no Wikimedia Commons.

**Não entram, e não há conector para eles:** o acervo do Ink e do Comixfy, nem
pelo login de assinante. Assinar ou comprar dá direito de ler, não de copiar
para outro sistema nem de republicar. Os dois não oferecem API, feed ou
exportação pública para isso, e a área de assinante não é coletada.

| Pergunta do dono | Ink / Comixfy | Domínio público (Commons) |
|---|---|---|
| Acesso à conta | não usado (o Claude não digita senhas; um robô com a senha do dono é risco) | não precisa: API pública |
| Reutilizar metadados | sem autorização | sim, com crédito |
| Copiar capas, páginas, arquivos | sem autorização | não copia: aponta para o arquivo no Commons |
| Republicar no Super HQs | sem licença dos titulares | sim, com a base legal registrada em cada obra |

Obra licenciada ao dono (editora, autor independente) entra como fonte nova,
com um conector para o formato que o licenciante entregar.

## Os arquivos

| Arquivo | Papel |
|---|---|
| `config.json` | As fontes: categoria do Commons, padrão de nome dos arquivos, título, coleção, autor, **ano de morte do autor**, categoria no app. `pausado` pausa tudo; `pausado` numa fonte pausa só ela. `intervaloHoras`: o mínimo entre duas coletas da mesma fonte |
| `aprovacoes.json` | Itens da revisão que o dono aprovou à mão (`"<obra>\|<arquivo>"`) |
| `nucleo.js` | As contas: direitos, montar a obra, comparar com o catálogo, revisão, tentativas com espera progressiva |
| `commons.js` | O conector do Wikimedia Commons (API documentada) |
| `rodar.js` | O orquestrador: roda as fontes, grava catálogo, estado e relatório |
| `estado.json` | Por fonte: última coleta, cursor de retomada, contagens e último erro |
| `relatorio.md` | A reconciliação da última execução: na fonte × publicadas × em revisão |
| `../catalogo/acervo.json` | O catálogo que o app lê (contrato versionado, `versao: 1`) |

## O modelo do catálogo (`catalogo/acervo.json`)

```js
{ versao: 1, geradoEm,
  obras: [{ id: "dp-<fonte>",            // interno e estável: o progresso de leitura se prende a ele
            fonte: "commons-categoria", origem: { id, url },   // procedência
            titulo, colecao, autor, ano, categoria, idioma,
            direitos: { situacao: "dominio-publico", base, autor, autorFalecidoEm },
            paginas: [{ id: <SHA-1 da fonte>, titulo, url, thumb, largura, altura, licenca, origemUrl }],
            versao,                       // hash da lista de SHA-1: mudou, a obra mudou
            status: "publicada" | "indisponivel",
            publicadaEm, atualizadaEm, editado? }],   // editado: o que o dono mudou, vence a fonte
  revisao: [{ obra, pagina, origemUrl, motivo }] }
```

## O que a sincronização garante (e o teste cobra)

`testes/teste-conectores.js`, 39 checagens com um Commons de mentira:

- **Paginação** pelo `continue` da API, 50 arquivos por consulta.
- **Checkpoint e retomada**: o cursor é gravado a cada consulta; interrompida,
  a próxima execução continua de onde parou.
- **Idempotente**: rodar de novo sem mudança na fonte não muda nada.
- **Sem duplicatas**: a mesma imagem (mesmo SHA-1) entra uma vez.
- **Novidades e alterações**: página nova ou arquivo trocado mudam a versão.
- **Falha da fonte não apaga nada**; obra que some da fonte vira "indisponível"
  e volta quando a fonte volta. O progresso de quem lia é preservado.
- **Tentativas limitadas** (3) com espera progressiva (1 s, 2 s, 4 s...).
- **Publicação só com direito comprovado**: autor sem ano de morte, morto há
  menos de 70 anos, licença não livre na fonte, arquivo que não é imagem ou
  que não respondeu na conferência → revisão, com o motivo.
- **As edições do dono** (campo `editado`) vencem a fonte.
- Sessão expirada não se aplica: a fonte de hoje é pública e não tem login.

## Controles

- **Executar agora**: GitHub › Actions › *Sincronizar o acervo* › *Run workflow*
  (pode informar só uma fonte). Na máquina: `node conectores/rodar.js`.
- **Pausar**: `"pausado": true` no `config.json` (tudo ou uma fonte), ou
  Actions › *Sincronizar o acervo* › ⋯ › *Disable workflow*.
- **Acompanhar**: `conectores/relatorio.md` (também no resumo de cada execução
  no Actions) e `conectores/estado.json`. Erro numa fonte não reprova a
  execução; erro em todas reprova, e o GitHub avisa por e-mail.
- **Revisar**: veja `revisao` em `catalogo/acervo.json`; para publicar um item
  depois de conferir os direitos, copie `"<obra>|<arquivo>"` para
  `aprovacoes.json`.
- **Acrescentar uma fonte**: uma entrada nova no `config.json`, com o ano de
  morte do autor conferido (sem ele, nada publica sozinho).

Nenhuma senha, cookie ou token está no código, nos logs ou no repositório. O
commit do catálogo usa o `GITHUB_TOKEN` do próprio Actions.
