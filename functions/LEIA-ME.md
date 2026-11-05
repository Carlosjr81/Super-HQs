# Backend do acervo privado no Drive (`functions/`)

Permite que **usuários aprovados** leiam, pelo Super HQs, **somente** os
arquivos de uma pasta de acervo designada no Drive do dono — sem dar acesso ao
resto do Drive. É a **menor ampliação** da arquitetura (o `CLAUDE.md` diz "nada
de servidor próprio"): duas Cloud Functions, sem banco novo, reaproveitando os
contratos do app (`acervo/{sha256}` no Firestore, as mesmas regras de conta e
coleção).

## Estado

- **Núcleo escrito e testado** (`node functions/testes/teste-funcoes.js`, 31/31;
  também entra em `node testes/rodar.js`): `acesso.js` (autorização por conta,
  prazo, plano e coleção — espelha as regras) e `indexador.js` (classificar
  item, decidir direitos, montar ficha, deduplicar, relatório).
- **Fiação escrita, NÃO implantada nem testada contra o Drive/Firebase reais**
  (`index.js`): depende de coisas que só o dono liga.

## Para implantar (depende do dono)

1. **Plano Blaze** (Functions é pago pelo uso) com alerta de orçamento. Não foi
   ligado — pedido do dono pendente.
2. **Conta de serviço** com Drive API, com acesso de **leitura** só às pastas
   aprovadas: compartilhe as pastas com o e-mail da conta de serviço. Nunca o
   Drive inteiro. A chave JSON vai para o Secret Manager
   (`DRIVE_SERVICE_ACCOUNT`), **nunca** no repositório.
3. `DRIVE_PASTA_ACERVO` = id da pasta do acervo. IDs confirmados pelo dono
   (04/11/2026): `Super_HQs` `19ck3UTDNoB4EJ9u_BCL5hj4okPNDEmqc`;
   `Acervo_Organizado` `1NrPoBf734hH_haSV5H9AtNfwm97Uq5R6` (contém **atalhos e
   subpastas** — o indexador não conta atalho como edição nem o segue para fora
   da pasta).
4. `config/direitosAcervo` no Firestore: um mapa `pastaId -> {titular, licenca,
   origem}`. Sem registro de direitos, a edição fica **pendente** (não publica).
5. `firebase deploy --only functions` (com Blaze). Depois, testes de integração
   reais (indexar uma pasta de teste; baixar com token válido/ inválido,
   coleção liberada/ não liberada, conta bloqueada/ vencida, edição
   despublicada) antes de declarar pronto.

## Garantias (no servidor, não só na interface)

- O **entregador** (`baixarEdicao`) verifica o ID token do Firebase, lê a conta
  e a config, e aplica `acesso.podeBaixarEdicao`. O cliente manda só o **sha256
  da edição cadastrada**; o servidor resolve o arquivo no Drive — **nunca** um
  `fileId` arbitrário do cliente.
- O **indexador** só o dono dispara; valida tipo (PDF/CBZ; CBR não entra),
  SHA-256, páginas e direitos; não inventa titular/licença/origem.
- Revogar acesso impede novos downloads; **não apaga** o que já foi baixado no
  aparelho.
