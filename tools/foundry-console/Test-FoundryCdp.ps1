$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'FoundryCdp.Targets.ps1')

function Assert-CdpTest {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$filesToParse = @(
    (Join-Path $PSScriptRoot 'Invoke-FoundryCdp.ps1'),
    (Join-Path $PSScriptRoot 'FoundryCdp.Targets.ps1')
)
foreach ($file in $filesToParse) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors) | Out-Null
    Assert-CdpTest ($parseErrors.Count -eq 0) "Erro de parser em $([System.IO.Path]::GetFileName($file)): $($parseErrors -join '; ')"
}

$realResponseFixture = @'
[
  {"type":"page","title":"Encampment • Foundry Virtual Tabletop","url":"http://localhost:30001/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/foundry-page-1"},
  {"type":"page","title":"DevTools","url":"devtools://devtools/bundled/inspector.html","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/devtools-1"},
  {"type":"iframe","title":"Foundry iframe","url":"http://localhost:30001/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/iframe-1"},
  {"type":"worker","title":"Foundry worker","url":"http://localhost:30001/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/worker-1"},
  {"type":"service_worker","title":"Foundry service worker","url":"http://localhost:30001/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/sw-1"},
  {"type":"page","title":"Oracle","url":"https://v14.rpgup.com.br/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/remote-1"},
  {"type":"page","title":"Other local page","url":"http://localhost:30001/setup","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/setup-1"}
]
'@
$targets = ConvertFrom-CdpTargetJson -JsonText $realResponseFixture
$selectedTargets = Get-FoundryPageTargets -Targets $targets
Assert-CdpTest ($targets.Count -eq 7) 'A resposta múltipla não preservou seus sete targets.'
Assert-CdpTest ($selectedTargets.Count -eq 1) 'O filtro deveria selecionar somente a página Foundry /game.'
Assert-CdpTest ($selectedTargets[0].title -eq 'Encampment • Foundry Virtual Tabletop') 'O target selecionado não é a janela Foundry informada.'
Assert-CdpTest (Test-FoundryPageWebSocket -WebSocketUrl $selectedTargets[0].webSocketDebuggerUrl -EndpointPort 9223) 'O WebSocket local de fixture deveria ser aceito.'
Assert-CdpTest (-not (Test-FoundryPageWebSocket -WebSocketUrl 'ws://example.com:9223/devtools/page/x' -EndpointPort 9223)) 'Um WebSocket remoto não pode ser aceito.'

$singleTargetFixture = '[{"type":"page","title":"Encampment • Foundry Virtual Tabletop","url":"http://localhost:30001/game","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/one"}]'
$singleTargets = ConvertFrom-CdpTargetJson -JsonText $singleTargetFixture
Assert-CdpTest ($singleTargets.Count -eq 1) 'O array JSON unitário não foi preservado como um target.'
Assert-CdpTest ((Get-FoundryPageTargets -Targets $singleTargets).Count -eq 1) 'O array JSON unitário não produziu um target Foundry.'
Assert-CdpTest ((ConvertFrom-CdpTargetJson -JsonText '[]').Count -eq 0) 'O array JSON vazio não foi preservado como zero targets.'

$urlVariantFixtures = @(
    '[{"type":"page","title":"slash","url":"http://localhost:30001/game/","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/slash"}]',
    '[{"type":"page","title":"query","url":"http://localhost:30001/game?tab=scene&mode=test","webSocketDebuggerUrl":"ws://127.0.0.1:9223/devtools/page/query"}]'
)
foreach ($fixture in $urlVariantFixtures) {
    $variantTargets = ConvertFrom-CdpTargetJson -JsonText $fixture
    Assert-CdpTest ((Get-FoundryPageTargets -Targets $variantTargets).Count -eq 1) 'Barra final ou parâmetros de consulta foram rejeitados.'
}

$bomFixture = [string][char]0xFEFF + $singleTargetFixture
Assert-CdpTest ((ConvertFrom-CdpTargetJson -JsonText $bomFixture).Count -eq 1) 'Um BOM UTF-8 no JSON não foi tratado.'

$invalidJsonRejected = $false
try { ConvertFrom-CdpTargetJson -JsonText '[{broken json' | Out-Null }
catch { $invalidJsonRejected = $true }
Assert-CdpTest $invalidJsonRejected 'JSON inválido deveria produzir erro explícito.'

Write-Output 'PASS: parser PowerShell, array JSON (unitário/múltiplo), target local, barra final, query, filtros de DevTools/iframe/workers, WebSocket local e erros JSON.'
