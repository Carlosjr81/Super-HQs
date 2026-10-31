# Prepara uma maquina nova para desenvolver o Super HQs (Windows).
#
#   powershell -ExecutionPolicy Bypass -File preparar.ps1
#
# Confere o que falta e instala. Nao desinstala, nao atualiza o que ja existe e
# nao mexe em configuracao global: so acrescenta o que o projeto precisa.
#
# O que NAO da para automatizar, e por que:
#   - "Disponivel off-line" na pasta do Drive: e um menu do Explorador, nenhum
#     comando o alcanca. O script detecta o sintoma e avisa.
#   - `gh auth login`: abre o navegador e espera voce digitar. O script detecta
#     se falta e mostra o comando.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$problemas = @()
$instalados = @()

function Titulo($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t)     { Write-Host "   ok   $t" -ForegroundColor Green }
function Falta($t)  { Write-Host "   --   $t" -ForegroundColor Yellow }
function Ruim($t)   { Write-Host "   XX   $t" -ForegroundColor Red }

# Depois de instalar por winget, o PATH so existe em sessao nova. Isto traz o
# PATH do registro para esta sessao, senao o proprio script nao acha o que
# acabou de instalar.
function AtualizarPath {
  $m = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $u = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$m;$u"
}

function Existe($cmd) {
  $c = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($null -eq $c) { return $false }
  return $true
}

function Instalar($id, $nome, $cmd) {
  if (Existe $cmd) {
    $v = (& $cmd --version 2>&1 | Select-Object -First 1)
    Ok "$nome  ($v)"
    return $true
  }
  Falta "$nome nao encontrado - instalando ($id)"
  if (-not (Existe "winget")) {
    Ruim "winget nao existe nesta maquina. Instale o $nome a mao: https://nodejs.org  /  https://git-scm.com"
    $script:problemas += "$nome nao instalado (sem winget)"
    return $false
  }
  winget install --id $id --silent --accept-package-agreements --accept-source-agreements
  AtualizarPath
  if (Existe $cmd) {
    Ok "$nome instalado"
    $script:instalados += $nome
    return $true
  }
  Ruim "$nome instalou mas nao apareceu no PATH. Feche e reabra o terminal e rode este script de novo."
  $script:problemas += "$nome precisa de terminal novo"
  return $false
}

Write-Host "Super HQs - preparando esta maquina" -ForegroundColor White
Write-Host "pasta: $raiz"

# ---------------------------------------------------------------- 1. arquivos
Titulo "Os arquivos estao mesmo no disco?"
# O Google Drive, por padrao, guarda so os nomes e baixa sob demanda. Ler o
# index.html inteiro e o jeito de descobrir isso: se estiver so na nuvem, a
# leitura trava ou o tamanho vem errado.
$app = Join-Path $raiz "index.html"
if (-not (Test-Path $app)) {
  Ruim "index.html nao esta em $raiz - voce esta na pasta certa?"
  $problemas += "index.html ausente"
} else {
  $tam = (Get-Item $app).Length
  $t0 = Get-Date
  try { [System.IO.File]::ReadAllBytes($app) | Out-Null } catch { }
  $seg = ((Get-Date) - $t0).TotalSeconds
  if ($tam -lt 400000) {
    Ruim "index.html tem $tam bytes - esperado ~700 KB. Arquivo incompleto."
    $problemas += "index.html incompleto"
  } elseif ($seg -gt 5) {
    Ruim "index.html levou $([math]::Round($seg,1))s para ser lido - a pasta nao esta disponivel off-line."
    $problemas += "pasta nao esta off-line"
  } else {
    Ok "index.html: $([math]::Round($tam/1KB)) KB, lido em $([math]::Round($seg,2))s"
  }
}

# ------------------------------------------------------------------- 2. node
Titulo "Node.js (testes e servidor local)"
$temNode = Instalar "OpenJS.NodeJS.LTS" "Node.js" "node"
# Nao existe `npm install` a fazer: o projeto nao tem dependencia nenhuma, de
# proposito. Ver "Restricoes que moldam tudo" no CLAUDE.md.

# --------------------------------------------------------------- 3. git e gh
Titulo "git e GitHub CLI (publicar daqui)"
$temGit = Instalar "Git.Git" "git" "git"
$temGh  = Instalar "GitHub.cli" "gh" "gh"

if ($temGh) {
  $logado = $false
  try { gh auth status 2>&1 | Out-Null; $logado = $? } catch { $logado = $false }
  if ($logado) {
    Ok "conta do GitHub ja conectada"
  } else {
    Falta "falta conectar a conta do GitHub - rode no seu terminal:  gh auth login"
    $problemas += "gh auth login pendente"
  }
}

if ($temGit -and (Test-Path (Join-Path $raiz ".git"))) {
  Push-Location $raiz
  $nome = (git config user.name)
  if ([string]::IsNullOrWhiteSpace($nome)) {
    git config user.name "Carlosjr81"
    # o endereco noreply evita publicar e-mail pessoal num repositorio publico
    git config user.email "Carlosjr81@users.noreply.github.com"
    Ok "identidade dos commits definida (so neste repositorio)"
  } else {
    Ok "identidade dos commits: $nome"
  }

  # A trava de publicacao. Hook do git nao viaja no clone (.git/hooks nao e
  # versionado), entao ele mora em testes/hooks e o git e apontado para la.
  # Sem isto, uma publicacao quebrada sai sem ninguem perceber.
  git config core.hooksPath "testes/hooks"
  if ((git config --get core.hooksPath) -eq "testes/hooks") {
    Ok "trava de publicacao ligada (roda testes + conferida antes de todo push)"
  } else {
    Ruim "nao consegui ligar a trava de publicacao"
    $script:problemas += "trava de publicacao desligada"
  }
  Pop-Location
}

# --------------------------------------------------------------- 4. a prova
Titulo "A prova: as sete suites"
if ($temNode) {
  Push-Location $raiz
  & node (Join-Path $raiz "testes\rodar.js")
  $saiu = $LASTEXITCODE
  Pop-Location
  if ($saiu -ne 0) { $problemas += "testes falharam" }
} else {
  Falta "sem Node, os testes nao rodam"
}

# ------------------------------------------------------------------ 5. fim
Titulo "Resumo"
if ($instalados.Count) { Write-Host "   instalado agora: $($instalados -join ', ')" }
if ($problemas.Count) {
  Write-Host ""
  Ruim "falta resolver:"
  $problemas | ForEach-Object { Write-Host "        - $_" -ForegroundColor Yellow }
  Write-Host ""
  Write-Host "   Se foi instalacao: feche e reabra o terminal e rode de novo." -ForegroundColor Yellow
  exit 1
}
Write-Host ""
Ok "maquina pronta. Abra o Claude nesta pasta e continue de onde parou."
Write-Host "        node testes\rodar.js    roda os testes"
Write-Host "        node testes\servir.js   abre o app em http://localhost:8765"
exit 0
