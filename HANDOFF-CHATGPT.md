# Continuidade: pipeline do Drive

Origem: `conectores/config.json`, pasta Acervo_Organizado
`1NrPoBf734hH_haSV5H9AtNfwm97Uq5R6`. A integração do PR #19 é a base;
a revisão seguinte configura frontend e Functions, continuação automática
entre lotes e atualização da estante. Blaze ativo foi informado pelo dono.

Execute o roteiro completo de `functions/LEIA-ME.md` com a identidade já usada
no backend. O runtime empacota `functions/configuracao-drive.json`; os endpoints
são gerados por `conectores/configurar-drive.js`. Não use o segredo antigo de
raiz como fonte concorrente. Nenhuma credencial entra no código público.

Deploy e inventário real não foram executados nesta revisão. Não anunciar
quantidade publicada com base em atalhos ou somente nos testes simulados.
Preservar direitos, acesso por coleção, validade do arquivo e quarentena.
