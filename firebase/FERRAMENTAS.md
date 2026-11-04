# Firebase sem depender do botão de instalação

O projeto deste repositório é `super-hqs`. Authentication e Firestore foram
confirmados no console em 04/11/2026, no plano Spark. Isso não confirma a
publicação do backend de acesso ao Drive, que não está nesta branch.

O botão de instalar a integração do ChatGPT é separado dos serviços do app.
Não é necessário instalar essa integração para usar a CLI oficial ou o console.

## Ferramentas oficiais

Com Node.js 22 ou superior e npm, execute na raiz do repositório:

```sh
npx --yes firebase-tools@15.34.2 --version
npx --yes firebase-tools@15.34.2 login
npx --yes firebase-tools@15.34.2 projects:list
```

O login da CLI é separado do login no navegador. Cada ambiente precisa de sua
própria autenticação; não copie tokens ou senhas para arquivos do projeto.

`firebase.json` aponta para as regras existentes; `.firebaserc` seleciona
`super-hqs`. Não há configuração de Storage ou Functions para evitar sugerir
que esses serviços ou o backend do Drive já foram implantados.

Depois de conferir as regras e executar as verificações do projeto, a publicação
somente das regras do Firestore usa:

```sh
node testes/rodar.js
node testes/verificar.js
npx --yes firebase-tools@15.34.2 deploy --only firestore:rules --project super-hqs
```

Esse comando altera as regras do projeto real. A instalação das ferramentas
não executa uma publicação nem ativa faturamento.

## Claude Code

O `.mcp.json` configura o servidor MCP oficial, iniciado pelo npm com versão
fixa e limitado aos grupos Authentication e Firestore. O Claude pode solicitar
confiança no servidor ao abrir o repositório; o arquivo não contém credenciais
e não autentica automaticamente. Não use junto com uma segunda configuração
MCP Firebase equivalente para evitar ferramentas duplicadas.

Documentação oficial:
- https://firebase.google.com/docs/cli
- https://firebase.google.com/docs/ai-assistance/mcp-server

## Pendências verificadas em 04/11/2026

- A integração Firebase do ChatGPT ainda constava como não instalada.
- O acesso ao console foi restabelecido e o projeto existente foi confirmado.
- O backend de acesso ao Drive e a configuração de sua identidade de serviço
  ainda precisam ser implementados e publicados; os arquivos acima não fazem isso.
