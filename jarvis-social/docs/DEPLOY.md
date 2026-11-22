# Colocar o Jarvis Social no ar — tudo pelo navegador do celular

Custo: **R$ 0** nos planos gratuitos abaixo (confira os limites atuais nos links;
são da documentação dos serviços e mudam). Nenhuma senha ou token vai para a
conversa: tudo é digitado só nas telas oficiais de cada serviço.

## Passo 0 — publicar o painel (uma autorização)
Dizer ao Claude: **"pode juntar o Jarvis Social na main"**. Ele junta a branch
e o GitHub Pages passa a servir https://carlosjr81.github.io/Super-HQs/jarvis-social/
(em DEMONSTRAÇÃO até o passo 1). O app Super HQs não muda.

## Passo 1 — servidor grátis (Supabase), ~10 min
1. Abra https://supabase.com/dashboard e entre com **Continue with GitHub**.
2. **New project** → nome `jarvis-social`, região **South America (São Paulo)**,
   plano **Free**. Em *Database password* toque em **Generate a password** e
   guarde no gerenciador de senhas do celular.
3. Quando o projeto abrir, copie o **Reference ID** (Project Settings › General;
   é o trecho `xxxx` de `https://xxxx.supabase.co`).
4. Crie um token: https://supabase.com/dashboard/account/tokens → **Generate new token**
   (nome `github-jarvis-social`). Copie.
5. No GitHub: https://github.com/Carlosjr81/Super-HQs/settings/secrets/actions →
   **New repository secret**, três vezes:
   - `JS_SUPABASE_ACCESS_TOKEN` = o token do item 4
   - `JS_SUPABASE_PROJECT_REF` = o Reference ID do item 3
   - `JS_SUPABASE_DB_PASSWORD` = a senha do item 2
   - (opcional) `JS_EMAILS_PERMITIDOS` = seu e-mail de login no painel, para
     ninguém mais conseguir criar espaço enquanto a venda não abre.
6. Diga ao Claude **"continue"**. Ele dispara o workflow *Jarvis Social*, que:
   aplica o banco, cria o bucket privado, publica a API e o worker, liga o
   relógio a cada minuto (pg_cron), configura o login para a URL do painel,
   faz a prova de vida e grava o endereço público no `config.js`.

Os segredos do servidor (chave de cifra dos tokens da Meta e segredo do worker)
são **derivados** da senha do banco pelo workflow: nada a mais para guardar.
Trocar a senha do banco depois obriga a reconectar o Instagram.

## Passo 2 — publicação oficial no Instagram (app da Meta), ~20 min
Pré-requisito: @carlos.jr.81 como **conta profissional** (criador ou empresa).
1. https://developers.facebook.com/apps → **Criar app** → caso de uso
   *Gerenciar mensagens e conteúdo no Instagram* (ou tipo *Empresa*, conforme a
   tela atual).
2. No produto **Instagram** › *Configuração da API com login do Instagram*:
   - adicione a conta @carlos.jr.81 (função de testador/administrador do app);
   - em *Configurar login de empresa do Instagram*, URL de redirecionamento OAuth:
     `https://SEU_REF.supabase.co/functions/v1/api/v1/instagram/retorno`
   - permissões: `instagram_business_basic` e `instagram_business_content_publish`.
3. Copie **ID do app do Instagram** e **Chave secreta do app do Instagram** para os
   segredos do GitHub `JS_META_APP_ID` e `JS_META_APP_SECRET`.
4. Diga ao Claude **"continue"** (ele reimplanta) e, no painel: Ajustes ›
   **Conectar Instagram**. Autorize na tela do Instagram.

Com o app em modo de desenvolvimento, só as contas com função no app conectam
— suficiente para o uso do dono. Vender para clientes exige revisão do app e
verificação da empresa pela Meta (Etapa E).

> Nomes de telas, versão da API (`v23.0` no código, ajustável por
> `JS_META_VERSAO`) e permissões vêm da documentação que o Claude conhece; a
> sessão na nuvem não alcança developers.facebook.com para reconferir. A
> primeira conexão real confirma ou corrige; o resultado entra em
> `MAPEAMENTO_FUNCIONAL.md`.

## Se algo der errado
- Workflow vermelho: o Claude lê o log pelo celular (`get_job_logs`) e corrige.
- Painel sem dados depois do passo 1: confira se o último run do workflow
  terminou verde e se o commit "endereço do servidor no painel" entrou.
