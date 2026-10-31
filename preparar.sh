#!/usr/bin/env bash
# Prepara uma maquina nova para desenvolver o Super HQs (macOS / Linux).
#
#   bash preparar.sh
#
# Confere o que falta e instala. Nao desinstala, nao atualiza o que ja existe e
# nao mexe em configuracao global: so acrescenta o que o projeto precisa.
#
# O que NAO da para automatizar:
#   - "Disponivel off-line" na pasta do Drive: e um menu do Finder. O script
#     detecta o sintoma (leitura lenta) e avisa.
#   - `gh auth login`: abre o navegador e espera voce digitar.

set -u
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
problemas=()
instalados=()

V=$'\e[32m'; A=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; Z=$'\e[0m'
titulo() { printf '\n%s== %s%s\n' "$C" "$1" "$Z"; }
ok()     { printf '   %sok%s   %s\n' "$V" "$Z" "$1"; }
falta()  { printf '   %s--%s   %s\n' "$A" "$Z" "$1"; }
ruim()   { printf '   %sXX%s   %s\n' "$R" "$Z" "$1"; }

if [ "$(uname)" = "Darwin" ]; then GERENTE="brew"; else GERENTE="apt"; fi

instalar() {   # instalar <pacote-brew> <pacote-apt> <nome> <comando>
  local pb="$1" pa="$2" nome="$3" cmd="$4"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$nome  ($("$cmd" --version 2>&1 | head -1))"
    return 0
  fi
  falta "$nome nao encontrado - instalando"
  if [ "$GERENTE" = "brew" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      ruim "Homebrew nao existe. Instale em https://brew.sh e rode este script de novo."
      problemas+=("$nome nao instalado (sem brew)")
      return 1
    fi
    brew install "$pb"
  else
    sudo apt-get update -qq && sudo apt-get install -y "$pa"
  fi
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$nome instalado"; instalados+=("$nome"); return 0
  fi
  ruim "$nome instalou mas nao apareceu no PATH. Abra um terminal novo e rode de novo."
  problemas+=("$nome precisa de terminal novo")
  return 1
}

printf 'Super HQs - preparando esta maquina\npasta: %s\n' "$RAIZ"

# ------------------------------------------------------------- 1. arquivos
titulo "Os arquivos estao mesmo no disco?"
# O Google Drive, por padrao, guarda so os nomes e baixa sob demanda. Ler o
# arquivo inteiro e o jeito de descobrir isso.
APP="$RAIZ/index.html"
if [ ! -f "$APP" ]; then
  ruim "index.html nao esta em $RAIZ - voce esta na pasta certa?"
  problemas+=("index.html ausente")
else
  tam=$(wc -c < "$APP" | tr -d ' ')
  t0=$(date +%s)
  cat "$APP" > /dev/null 2>&1
  seg=$(( $(date +%s) - t0 ))
  if [ "$tam" -lt 400000 ]; then
    ruim "index.html tem $tam bytes - esperado ~700 KB. Arquivo incompleto."
    problemas+=("index.html incompleto")
  elif [ "$seg" -gt 5 ]; then
    ruim "index.html levou ${seg}s para ser lido - a pasta nao esta disponivel off-line."
    problemas+=("pasta nao esta off-line")
  else
    ok "index.html: $((tam/1024)) KB, lido em ${seg}s"
  fi
fi

# ---------------------------------------------------------------- 2. node
titulo "Node.js (testes e servidor local)"
temNode=0; instalar node nodejs "Node.js" node && temNode=1
# Nao existe `npm install` a fazer: o projeto nao tem dependencia nenhuma.

# ------------------------------------------------------------ 3. git e gh
titulo "git e GitHub CLI (publicar daqui)"
temGit=0; instalar git git "git" git && temGit=1
temGh=0;  instalar gh gh "gh" gh && temGh=1

if [ "$temGh" = "1" ]; then
  if gh auth status >/dev/null 2>&1; then
    ok "conta do GitHub ja conectada"
  else
    falta "falta conectar a conta do GitHub - rode no seu terminal:  gh auth login"
    problemas+=("gh auth login pendente")
  fi
fi

if [ "$temGit" = "1" ] && [ -d "$RAIZ/.git" ]; then
  if [ -z "$(git -C "$RAIZ" config user.name || true)" ]; then
    git -C "$RAIZ" config user.name "Carlosjr81"
    # noreply: nao publica e-mail pessoal num repositorio publico
    git -C "$RAIZ" config user.email "Carlosjr81@users.noreply.github.com"
    ok "identidade dos commits definida (so neste repositorio)"
  else
    ok "identidade dos commits: $(git -C "$RAIZ" config user.name)"
  fi

  # A trava de publicacao. Hook do git nao viaja no clone (.git/hooks nao e
  # versionado), entao ele mora em testes/hooks e o git e apontado para la.
  git -C "$RAIZ" config core.hooksPath "testes/hooks"
  chmod +x "$RAIZ/testes/hooks/pre-push" 2>/dev/null || true
  if [ "$(git -C "$RAIZ" config --get core.hooksPath)" = "testes/hooks" ]; then
    ok "trava de publicacao ligada (roda testes + conferida antes de todo push)"
  else
    ruim "nao consegui ligar a trava de publicacao"
    problemas+=("trava de publicacao desligada")
  fi
fi

# ---------------------------------------------------------------- 4. prova
titulo "A prova: as sete suites"
if [ "$temNode" = "1" ]; then
  node "$RAIZ/testes/rodar.js" || problemas+=("testes falharam")
else
  falta "sem Node, os testes nao rodam"
fi

# ------------------------------------------------------------------ 5. fim
titulo "Resumo"
[ ${#instalados[@]} -gt 0 ] && echo "   instalado agora: ${instalados[*]}"
if [ ${#problemas[@]} -gt 0 ]; then
  echo; ruim "falta resolver:"
  for p in "${problemas[@]}"; do printf '        %s- %s%s\n' "$A" "$p" "$Z"; done
  echo; echo "   Se foi instalacao: abra um terminal novo e rode de novo."
  exit 1
fi
echo; ok "maquina pronta. Abra o Claude nesta pasta e continue de onde parou."
echo "        node testes/rodar.js    roda os testes"
echo "        node testes/servir.js   abre o app em http://localhost:8765"
