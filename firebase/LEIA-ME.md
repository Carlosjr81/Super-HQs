# Login, aprovação, cobrança e painel de usuários (Firebase)

O Super HQs tem o mesmo controle de acesso do Treino Livre: quem se cadastra fica
**aguardando** até o dono liberar, e só o dono (`carlos.jr.81@hotmail.com`, com o
e-mail confirmado) vê o **👥 Painel de usuários** em Ajustes, com Liberar,
Bloquear, prazos, cortesia, recados e a chave **💰 Cobrança**.

É um **projeto do Firebase separado** do `treino-livre` (decisão do dono): contas,
aprovação e pagamentos de um app não se misturam com os do outro.

**Ligado em 31/10/2026 (versão 2026-10-31e)**, no projeto `super-hqs` do dono:
Authentication com E-mail/senha e Google, Firestore com as regras versão 5
publicadas, app da Web registrado. Conferido no Firebase de verdade com
`node testes/prova-regras-firebase.js` (17 provas, conta descartável apagada).
Cada rodada da prova deixa um aceite "Teste regras" no histórico e um aviso de
pagamento de R$ 1,00 "teste das regras": recuse-o no painel (as regras não
deixam apagar). Esvaziar `FIREBASE_ACESSO` desliga o login (emergência).

## O que o dono faz uma vez (uns 10 minutos)

1. Abra **console.firebase.google.com** e toque em **Criar um projeto**. Nome:
   `super-hqs`. O Google Analytics pode ficar **desativado**.
2. **Criação › Authentication › Vamos começar**. Em **Método de login**, ative
   **E-mail/senha** › **Salvar**.
3. Ainda em Authentication: **Configurações › Domínios autorizados › Adicionar
   domínio** › `carlosjr81.github.io` (se já não estiver).
4. (Opcional) **Authentication › Modelos**: idioma dos e-mails em **Português (Brasil)**.
5. **Criação › Firestore Database › Criar banco de dados**. Local:
   **southamerica-east1 (São Paulo)**. Modo: **produção**.
6. No Firestore, aba **Regras**: apague o que estiver lá, cole o arquivo
   **`firebase/firestore.rules`** inteiro e toque em **Publicar**.
7. Engrenagem › **Configurações do projeto › Geral › Seus apps** › ícone **`</>`**
   (Web). Apelido: `Super HQs`. **Não** marque o Hosting. **Registrar app**.
8. Mande ao Claude **só** `apiKey` e `projectId` do bloco `firebaseConfig`. São
   públicos (identificam o projeto; quem protege são as regras do passo 6).

## Entrar com o Google

1. **Authentication › Método de login › Adicionar novo provedor › Google ›
   Ativar**, com o seu e-mail de suporte › **Salvar**.
2. https://console.cloud.google.com/apis/credentials?project=super-hqs › **Web
   client (auto created by Google Service)** › **Origens JavaScript
   autorizadas** › **Adicionar URI** › `https://carlosjr81.github.io` › **Salvar**.
3. O botão aparece sozinho na tela de entrar. Não precisa mandar nada ao Claude.
4. **"Erro 400: origin_mismatch"** na tela do Google (aconteceu em 31/10/2026,
   com o primeiro usuário): é o passo 2 que faltou ou ficou errado. A origem é
   exatamente `https://carlosjr81.github.io`: sem barra no fim e sem
   `/Super-HQs`. Pode levar de 5 minutos a algumas horas para valer. Não é
   erro do código: o app não tem como contornar.

## Assim que o Claude publicar com a chave

**Todo mundo que abrir o app cai na tela de login, inclusive você.** Faça logo:

1. Abra o app › **Criar conta** com `carlos.jr.81@hotmail.com`.
2. Confirme o e-mail pelo link que chega (confira o spam) › **Já confirmei**.
3. **Ajustes › 👑 Sua conta › 👥 Painel de usuários**.

Sem confirmar o e-mail, ninguém passa por dono.

## A cobrança

Igual ao Treino Livre: a chave **💰 Cobrança** no painel nasce **desligada**.
Ligada, quem não tem plano, cortesia ou teste vê a tela de planos (mensal, anual,
único, vitalício), paga por **Pix copia e cola** ou pelo link de pagamento do
plano e toca "Já paguei". Você confere no extrato e confirma no painel. Preços,
chave Pix e links ficam em **⚙ Planos, preços e Pix**.

## O acervo (etapa seguinte)

As edições oferecidas pelo app vão para o **Firebase Storage** do mesmo projeto,
com regras que leem a conta da pessoa (liberada, paga, cortesia ou em teste).
Isso exige o plano **Blaze** (pago por uso, com cota gratuita): ligue também um
**alerta de orçamento** em Google Cloud › Faturamento, porque o Blaze avisa mas
não para sozinho. As regras do Storage entram nesta pasta quando o acervo for
construído.

## Limites que valem saber

- O plano gratuito do Firestore aguenta 50 mil leituras e 20 mil gravações por dia.
- O código do app é público e roda no aparelho: quem programa consegue pular a
  tela de login **na cópia dele**. O que as regras garantem é a lista de usuários,
  a aprovação, os pagamentos e (no acervo) quem baixa cada edição.
- Para apagar uma conta de vez (LGPD): Firebase › Authentication › Usuários › ⋮ ›
  Excluir, e Firestore › `usuarios` › o documento › Excluir.

## O acervo do app (Storage) — quando o dono decidir ligar

O app já tem o envio pronto (Perfil › Sua conta › 📦 Acervo do app), mas
**nada pago é ligado sem o dono**. Os passos:

1. Firebase › engrenagem › **Uso e faturamento** › **Modificar plano** › Blaze.
   Logo em seguida: console.cloud.google.com › **Faturamento** ›
   **Orçamentos e alertas** › criar orçamento (ex.: R$ 50/mês, alertas em 50%,
   90% e 100%). O alerta avisa; ele **não** corta o serviço sozinho.
2. Firebase › **Storage** › Começar › região `southamerica-east1` (São Paulo),
   modo de produção.
3. Storage › **Regras**: cole `firebase/storage.rules` inteiro › Publicar.
4. Firestore › **Regras**: cole `firebase/firestore.rules` (versão 6) › Publicar.
5. Mande ao Claude o nome do balde (topo da tela do Storage, algo como
   `super-hqs.firebasestorage.app`). Ele entra em `FIREBASE_ARMAZENAMENTO`.
6. Depois de publicado: `node testes/prova-regras-firebase.js` (prova que quem
   não está liberado não lê o acervo).

Custo de referência (preços públicos do Google, conferir na hora): guardar
fica perto de US$ 0,026 por GB/mês; o que pesa é a **saída** (cada download de
edição), perto de US$ 0,12 por GB. 1.000 leituras de uma edição de 50 MB são
cerca de 50 GB, uns US$ 6. Como o app guarda a edição baixada no aparelho,
cada pessoa baixa cada edição uma vez.

Só entra obra própria, licenciada ao dono ou em domínio público no Brasil,
com o registro de direitos (titular, licença, origem) que a tela exige.
Acervo de outro serviço (Ink, Comixfy...) não entra, mesmo com assinatura.
