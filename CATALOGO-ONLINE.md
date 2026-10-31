# Acervo online no Super HQs

A tela vazia oferecia somente o seletor de arquivos do aparelho. Esta versão
acrescenta **Conectar acervo** no Início e na Biblioteca. Ao conectar, o app
carrega as fichas de um índice JSON e mostra as edições junto da estante local.
Cada arquivo é baixado ao escolher ler, conferido e salvo no IndexedDB para
leitura offline. Conectar o índice não baixa todas as revistas para o celular.

O índice é atualizado ao abrir o app, ao voltar a conexão e ao tocar em
**Atualizar catálogo**. O app não coleta novas publicações nos sites de origem:
um importador no servidor precisa produzir e atualizar esse índice.

## Onde ficam os dados

- GitHub: código, documentação e testes. Nenhuma revista de terceiros entra
  neste repositório público.
- Catálogo: índice leve servido por HTTPS, com permissão de leitura pelo app.
- Arquivos: Firebase Storage ou URLs diretas autorizadas já disponibilizadas
  pelo armazenamento. Links de tela/pasta do Google Drive não são arquivos.
- Aparelho: última lista válida e edições baixadas; favoritos e progresso
  pessoais não são substituídos ao atualizar a lista.

Não houve ativação de Firebase, criação de plano pago nem cópia integral das
fontes nesta alteração. `FIREBASE_ACESSO` continua vazio. Um arquivo no Drive
não passa a ter leitura direta no navegador apenas por estar listado no JSON.
O servidor precisa entregar os bytes com as permissões e o CORS adequados.

## Teste com conteúdo próprio

Sirva o projeto com `node testes/servir.js`. Abra o app e conecte
`http://localhost:8765/testes/amostras/catalogo.json`.

O índice aponta para as duas amostras próprias já existentes no repositório:
um CBZ de seis páginas e um PDF de quatro. Elas são **amostras de teste**,
não o catálogo Comixfy/Ink. Escolha uma, toque em Ler, feche o leitor e confira
a retomada. Depois desative a rede e leia a cópia local.

Após a publicação, a mesma amostra fica em
`https://carlosjr81.github.io/Super-HQs/testes/amostras/catalogo.json`.
Esse caminho só terá a nova funcionalidade depois que a alteração for integrada.

## Definir o catálogo para todos os leitores

Defina `CATALOGO_PADRAO`, no bloco de dados do `index.html`, com a URL do índice
real. Assim cada novo aparelho recebe a lista ao abrir o app. A conexão manual
é útil para testar um índice ou usar um acervo pessoal diferente. O endereço
escolhido manualmente fica somente nesse aparelho.

Se o catálogo real exigir autenticação privada, implemente o contrato no backend
Firebase antes de configurar esse endereço. O conector atual usa requisições
sem cookies de terceiros; não guarda credenciais Google nem entra em serviços
externos. Não coloque tokens de serviço, cookies ou links privados das fontes
em `CATALOGO_PADRAO` ou no código público.

## Contrato do índice

```json
{
  "schema_version": 1,
  "rights": {
    "holder": "Titular real",
    "license": "Referência da autorização/licença real",
    "origin": "Origem documentada"
  },
  "items": [
    {
      "source": "minha-fonte",
      "id": "id-estavel-na-origem",
      "revision": "versao-real-do-arquivo",
      "sha256": "HASH_SHA256_REAL_DE_64_CARACTERES",
      "path": "HQs/Colecao/Edicao.cbz",
      "type": "zip",
      "title": "Título real",
      "collection": "Coleção real",
      "category": "hq",
      "page_count": 32,
      "size_bytes": 12345678,
      "file_url": "https://armazenamento.example/arquivo.cbz",
      "cover_url": "https://armazenamento.example/capa.jpg"
    }
  ]
}
```

O exemplo é um modelo, não é executável nem um registro real. Os campos de
autoria/licença podem estar em cada item (`rights`) ou na raiz para todos.
`type` aceita `zip` (CBZ) ou `pdf`. CBR que contém ZIP é aceito se `type` for
`zip`; CBR em RAR de verdade precisa ser convertido antes da publicação.

Categorias: `hq`, `manga`, `manhwa`, `livro`. Datas opcionais `added_at` usam
ISO 8601. Sem uma data real o app não inventa um selo de novidade. URLs
relativas são resolvidas a partir do endereço do catálogo. Não coloque senha
na URL. Os textos são renderizados como texto pelo React.

Como alternativa a `file_url`, use `files_base_url` na raiz e `storage_path`
relativo em cada item. O caminho é codificado segmento por segmento. Um índice
gerado pelo rclone/runner precisa ser enriquecido com URLs alcançáveis,
contagem real de páginas e registro de direitos antes de ser conectado.

## Garantias e limites

- A migração IndexedDB da versão 1 para 2 preserva `obras` e `arquivos` e
  acrescenta `catalogos`.
- A atualização só substitui o índice armazenado após validar o documento
  inteiro. Uma falha mantém a última lista válida e as cópias pessoais.
- A união usa o SHA-256: o mesmo arquivo local e online aparece uma vez, com
  progresso e categoria pessoais preservados.
- O download confere tamanho quando informado, SHA-256, tipo pelos bytes e
  quantidade de páginas antes de gravar. HTML de login não vira revista.
- Não remove arquivos pessoais quando uma edição sai do índice online.
- Mostra no máximo 60 cartões por vez, com Mostrar mais; não cria milhares de
  cartões de uma vez no celular.
- URLs expiradas precisam ser renovadas pelo produtor do catálogo. O app não
  obtém credenciais de outro site nem ignora um bloqueio de acesso.
- O índice admite até 50 mil itens e 32 MiB de texto; catálogos maiores precisam
  de paginação no contrato de backend.

## Estado da validação

Os testes automatizados exercitam o contrato, a preservação dos dados e os
limites do download, com rede e armazenamento simulados. A compilação JSX e
os hashes das bibliotecas são conferidos por `testes/verificar.js`.
Isso não comprova importação completa de Ink/Comixfy nem upload Firebase real.
Antes de preencher o catálogo de produção, execute um piloto com uma edição
de cada origem, abrindo todas as páginas e verificando a leitura offline.
