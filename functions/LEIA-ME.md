# Integração privada do acervo do Drive

A origem primária está em `conectores/config.json`: pasta `Acervo_Organizado`
(`1NrPoBf734hH_haSV5H9AtNfwm97Uq5R6`), projeto `super-hqs`, região
`us-central1`. O dono informou que o Blaze está ativo. Esta revisão configura
o código; não comprova implantação nem inventário de produção.

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
  O painel oferece **Continuar indexação**. O painel continua automaticamente entre lotes; não há agendamento novo.
- `00_Controle`, `90_Quarentena` e `INCOMPLETO_NAO_IMPORTAR_*` são ignorados.
  Atalhos são relatados separadamente e não contam como revistas copiadas.
  CBR/RAR continua exigindo conversão; a mudança não declara esse formato
  legível nem cria revistas ausentes.
- O catálogo privado em cache é separado por UID; arquivos já baixados
  continuam no aparelho, conforme o comportamento offline existente.

## Deploy

Execute com Node 22 na raiz do repositório. Não é necessário inicializar outro
projeto Firebase nem ativar Storage para o acervo do Drive.

1. Compartilhe a pasta indicada com o e-mail da conta de serviço já utilizada
   pelo backend, como leitor, e habilite a Google Drive API no projeto dessa
   identidade. A chave fica no Secret Manager, nunca neste repositório.
2. Confira `config/direitosAcervo` no Firestore. Cada chave é o ID da pasta
   física que contém as edições e seu valor é `{titular, licenca, origem,
   colecao?}`, com informações reais. O registro não é herdado automaticamente
   de outras pastas. Sem ele, o item é relatado como pendente.
3. Confira a origem e instale as dependências fixadas:

```sh
node conectores/configurar-drive.js --conferir
npm ci --prefix functions --ignore-scripts
node testes/rodar.js
node testes/verificar.js
npx --yes firebase-tools@15.34.2 login
npx --yes firebase-tools@15.34.2 projects:list
```

4. Se `DRIVE_SERVICE_ACCOUNT` já está configurado, reutilize-o. Caso contrário,
   importe o JSON da identidade pelo terminal seguro (substitua o caminho):

```sh
npx --yes firebase-tools@15.34.2 functions:secrets:set DRIVE_SERVICE_ACCOUNT --data-file /caminho/seguro/conta-servico.json --project super-hqs
```

5. Publique somente as duas Functions desta codebase:

```sh
npx --yes firebase-tools@15.34.2 deploy --config firebase.drive.json --only functions:acervo-drive --project super-hqs
```

A trava `predeploy` recusa divergências entre `conectores/config.json`,
`functions/configuracao-drive.json` e `FIREBASE_DRIVE` no app. A pasta agora
viaja no pacote das Functions; o segredo antigo `DRIVE_PASTA_ACERVO` não é mais
lido, e não precisa ser apagado. Apenas `DRIVE_SERVICE_ACCOUNT` continua secreto.
Os endpoints alvo gerados são:

- `https://us-central1-super-hqs.cloudfunctions.net/indexarAcervo`
- `https://us-central1-super-hqs.cloudfunctions.net/baixarEdicao`

Compare esses endereços com a saída de deploy. Se o serviço existente usa outra
região, ajuste `drive.regiao` na origem central, execute
`node conectores/configurar-drive.js`, suba as três versões do app e republique.
Não altere regiões de um serviço existente sem planejar sua migração.

Se regras/índice de coleções ainda não foram publicados, aplique-os com:

```sh
npx --yes firebase-tools@15.34.2 deploy --config firebase.drive.json --only firestore:rules,firestore:indexes --project super-hqs
```

## Iniciar e conferir o processamento

Entre no app com a conta do dono, com e-mail confirmado. Em Perfil → Sua conta
→ Acervo do app, toque em **Atualizar acervo do Drive**. A tela solicita lotes
sucessivos até `completo:true`, renova o token e atualiza as fichas da estante
a cada lote. **Parar após este lote** interrompe a continuação; uma nova chamada
retoma o cursor salvo. A tela precisa permanecer aberta. Não foi criado um
agendamento no servidor. Após terminar, outra atualização inicia nova varredura.

`indexarAcervo` é callable: requisições REST usam POST com
`Authorization: Bearer <ID_TOKEN_FIREBASE>` e corpo
`{"data":{"continuar":true}}`. Nunca use o token do gcloud no lugar do token
do usuário. O servidor usa a raiz configurada e não aceita pasta do cliente.
`baixarEdicao` aceita GET com o mesmo cabeçalho, `?edicao=<sha256>` e intervalos
`Range: bytes=inicio-fim` de até 8 MiB. Não aceita ID arbitrário do Drive.

Confira o relatório final e `controleAcervo/indexacaoDrive`. Em seguida,
confira uma ficha `acervo/{sha256}`, baixe pelo app e valide o arquivo inteiro;
teste também usuário sem coleção, bloqueado e token inválido. Um relatório
completo pode conter pendências, erros e atalhos; não significa que todos os
itens foram publicados. Atalhos, quarentena, arquivos inválidos e formatos
incompatíveis não são promovidos a edições. Nenhuma licença é preenchida pelo
código. Arquivos são limitados a 150 MiB, sem remover o original.

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
