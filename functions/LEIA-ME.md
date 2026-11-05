# Integração privada do acervo do Drive

O dono informou nesta sessão que concluiu Firebase e backend pelo Claude.
Essa informação substitui a antiga lista de implantação pendente. Não é uma
instrução para recriar serviços, ativar faturamento ou sobrescrever o backend.
A versão `main` e o site consultados ainda estavam em `2026-11-05`, com
`FIREBASE_ARMAZENAMENTO` vazio e sem URL do entregador no frontend. É preciso
identificar o endpoint/commit efetivamente utilizado pelo deploy do Claude
antes de integrar esta revisão. Não confundir ausência na configuração do app
com ausência do serviço no Firebase.

## Correções desta revisão (sem deploy de Functions)

- O frontend aceita fichas `provedor: "drive"` sem exigir Storage, preserva
  titular/licença/origem e usa `Bearer` no entregador. O Storage continua com
  seu cabeçalho `Firebase`. As URLs reais do deploy entram em `FIREBASE_DRIVE`.
  Só são aceitas URLs HTTPS `REGIAO-super-hqs.cloudfunctions.net/NOME` das
  funções `baixarEdicao` e `indexarAcervo`. Uma implantação em outra URL precisa
  de adaptação explícita, sem enviar token a host arbitrário.
- O entregador responde a intervalos de até **8 MiB**. O app reúne as partes e
  valida tamanho, SHA-256, formato e páginas antes de gravar a edição. Isto
  evita o limite de 10 MB das respostas de streaming das Cloud Functions.
- A autorização é reavaliada em cada parte: token revogado, conta, prazo,
  plano, coleção e publicação. A localização atual é conferida no Drive;
  arquivo fora da raiz, na lixeira ou na quarentena não é entregue.
- O indexador mantém o nome da pasta como coleção (ou `direitos.colecao`),
  confere formato pelos bytes e tamanho real, publica uma ficha por SHA e
  preserva edições já cadastradas, inclusive as despublicadas pelo dono.
- A origem dos direitos permanece **texto**, conforme as regras existentes;
  a referência técnica fica em `arquivoDrive: {id, pasta}`. Usa hora do
  servidor e preenche `chaveAcesso` para compatibilidade com outros controles.
- Percurso com paginação e retomada em `controleAcervo/indexacaoDrive`. Cada
  chamada processa até 30 itens ou 180 segundos e salva o cursor por item.
  O painel oferece **Continuar indexação**. Não há agendamento novo.
- `00_Controle`, `90_Quarentena` e `INCOMPLETO_NAO_IMPORTAR_*` são ignorados.
  Atalhos são relatados separadamente e não contam como revistas copiadas.
  CBR/RAR continua exigindo conversão; a mudança não declara esse formato
  legível nem cria revistas ausentes.
- O catálogo privado em cache é separado por UID; arquivos já baixados
  continuam no aparelho, conforme o comportamento offline existente.

## Configuração a conferir no backend existente

Reutilizar as configurações já feitas pelo Claude, sem pedir segredos no chat:

- `DRIVE_PASTA_ACERVO`: raiz designada do acervo.
- `DRIVE_SERVICE_ACCOUNT`: identidade com leitura das pastas aprovadas,
  mantida no ambiente seguro, nunca no frontend/repositório.
- `config/direitosAcervo`: mapa `pastaId -> {titular, licenca, origem,
  colecao?}`. Sem registro, o arquivo fica pendente e não é publicado. Não
  inferir licença pelo fato de o arquivo estar no Drive.
- URLs reais de `baixarEdicao` e `indexarAcervo`: preencher `FIREBASE_DRIVE`
  no app e testar com a conta do dono e uma conta liberada por coleção.

`firebase.drive.json` é uma configuração **opcional** de implantação das
Functions, runtime Node 22; o `firebase.json` existente permanece intacto.
Somente se for necessário atualizar o serviço existente, depois de comparar
com o código implantado, o comando é:

```sh
npm ci --prefix functions --ignore-scripts
node testes/rodar.js
node testes/verificar.js
firebase deploy --config firebase.drive.json --only functions:acervo-drive --project super-hqs
```

O comando não foi executado nesta revisão. Nenhum plano foi alterado.

## Validação

`node testes/rodar.js` inclui autorização, percurso com mais de 500 edições,
retomada, falha de listagem, quarentena e o handler HTTP real com serviços
externos simulados (401/403/405/409/416/206). Os testes do cliente cobrem a
ficha do Drive sem Storage, origem, cabeçalhos e recusa de intervalo errado.
Isso não substitui um teste de produção do backend concluído pelo Claude.

Referências oficiais consultadas:
- https://github.com/googleapis/google-api-nodejs-client
- https://github.com/mozilla/pdf.js
- https://firebase.google.com/docs/functions/quotas
- https://firebase.google.com/docs/functions/manage-functions
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/shortcuts
