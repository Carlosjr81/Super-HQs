# Começar a mexer no Super HQs num aparelho novo

> **Outra conta do Claude?** (por exemplo, a pessoal no lugar da corporativa)
> O passo a passo está em `TROCAR-DE-CONTA-CLAUDE.md`. O projeto não depende de
> conta do Claude nenhuma: ele mora no seu GitHub (`Carlosjr81/Super-HQs`).

O mesmo esquema do Treino Livre, com dois caminhos:

- **Celular**: Claude no navegador, trabalhando direto no GitHub. Não precisa
  instalar nada.
- **Computador**: clone do repositório e o script `preparar.ps1` (ou `preparar.sh`).

---

## No celular

Abra **`claude.ai/code`** no navegador do celular (ou o app do Claude, aba Code),
entre na sua conta, conecte a conta `Carlosjr81` do GitHub e comece uma sessão
com o repositório **`Carlosjr81/Super-HQs`** selecionado. A sessão trabalha num
clone na nuvem: lê, edita, roda os testes e publica.

### Sempre, antes de publicar do celular

Peça ao Claude, ou confira que ele fez:

```bash
node testes/rodar.js
```

```bash
node testes/verificar.js
```

A primeira prova que a **lógica** não quebrou. A segunda prova que o app ainda
**abre**: JSX compilando, hashes das bibliotecas conferindo, as três versões
sincronizadas. A regra está no `CLAUDE.md`, então o Claude já a conhece; a
lembrança aqui é para você poder cobrar.

#### A rede da sessão na nuvem

A sessão na nuvem só alcança uma lista de domínios. O `registry.npmjs.org` está
nela; a `cdnjs.cloudflare.com` (de onde vêm React e Babel) **não**. O
`verificar.js` contorna isso pegando o Babel no npm, então a conferida funciona
sem configurar nada. Só os *hashes* das bibliotecas viram aviso, e o **GitHub
Actions confere por você** (o ✓ ou ✗ aparece no app do GitHub).

Para a conferida completa também no celular: no seletor de ambiente da sessão,
escolha **Custom** em acesso de rede, marque *incluir a lista padrão* e acrescente:

```text
cdnjs.cloudflare.com
```

### Depois de publicar

1. **O ✓ no app do GitHub** (`.github/workflows/conferir.yml`). Veio ✗: peça ao
   Claude para reverter.
2. **O próprio app**: abra `https://carlosjr81.github.io/Super-HQs/` um ou dois
   minutos depois. Toque para Ler e a virada de página se testam melhor no
   celular mesmo, então o ciclo fecha no mesmo aparelho.

### Se algo quebrar

Peça: **"reverta o último commit e publique"**. Reverter primeiro, investigar depois.

---

## No computador

```bash
gh repo clone Carlosjr81/Super-HQs
```

Abra o Claude na pasta e diga **"prepare esta máquina"**, ou rode você mesmo:

```bash
powershell -ExecutionPolicy Bypass -File preparar.ps1
```

No Mac ou Linux:

```bash
bash preparar.sh
```

O script instala o que falta (Node, git, gh), define a identidade dos commits só
neste repositório (e-mail `noreply` do GitHub), liga a trava de `pre-push` e
termina rodando os testes. Não desinstala nem atualiza nada. Depois de instalar
alguma coisa, feche e reabra o terminal.

`gh auth login` ele não faz: abre o navegador e espera você digitar.

### O jeito de trabalhar

```bash
git pull
```

ao **começar**, e

```bash
git push
```

ao **terminar**. O GitHub é a verdade. Celular e computador podem se alternar à
vontade, desde que cada um comece com `git pull` (a sessão na nuvem já começa
do GitHub atualizado).

No computador, a trava de `pre-push` roda os testes e a conferida sozinha e
cancela o push se reprovar.

```bash
node testes/servir.js
```

Abre o app em `http://localhost:8765`. Abrir o `index.html` direto não serve: em
`file://` o `localStorage` fica bloqueado e o service worker não registra.

---

## Publicar

Três lugares sobem de versão **em toda publicação**:

1. `VERSAO_APP` no `index.html` (`AAAA-MM-DD` + letra)
2. `versao.json`, com o mesmo valor
3. `CACHE` no `sw.js` (`superhqs-vN`)

Depois, `git push`: o GitHub Pages republica sozinho em um ou dois minutos.

Se publicar algo quebrado:

```bash
git revert --no-edit HEAD && git push
```
