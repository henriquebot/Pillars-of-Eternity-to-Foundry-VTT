[CmdletBinding(DefaultParameterSetName = 'Probe')]
param(
    [Parameter(ParameterSetName = 'Probe')]
    [switch]$Probe,

    [Parameter(ParameterSetName = 'Expression', Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Expression,

    [Parameter(ParameterSetName = 'Script', Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ScriptPath,

    [ValidateNotNullOrEmpty()]
    [string]$Endpoint = 'http://127.0.0.1:9223',

    [ValidateRange(1, 120)]
    [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
$startedAt = [DateTimeOffset]::UtcNow
$stage = 'validate'
$targetInfo = $null
$socket = $null
$cts = $null
$http = $null
$response = $null

function Read-CdpMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [System.Threading.CancellationToken]$CancellationToken
    )
    $buffer = New-Object byte[] 16384
    $stream = New-Object System.IO.MemoryStream
    try {
        do {
            $segment = [System.ArraySegment[byte]]::new($buffer)
            $received = $WebSocket.ReceiveAsync($segment, $CancellationToken).GetAwaiter().GetResult()
            if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw 'O endpoint CDP fechou a conexão antes de responder.'
            }
            if ($received.MessageType -ne [System.Net.WebSockets.WebSocketMessageType]::Text) {
                throw 'O endpoint CDP retornou um frame que não é texto.'
            }
            $null = $stream.Write($buffer, 0, $received.Count)
        } while (-not $received.EndOfMessage)
        $text = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
        return ConvertFrom-Json -InputObject $text
    }
    finally {
        $null = $stream.Dispose()
    }
}

function Send-CdpRequest {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [int]$RequestId,
        [string]$Method,
        [hashtable]$Parameters,
        [System.Threading.CancellationToken]$CancellationToken
    )
    $request = @{ id = $RequestId; method = $Method; params = $Parameters }
    $json = ConvertTo-Json -InputObject $request -Depth 30 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $null = $WebSocket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $CancellationToken).GetAwaiter().GetResult()

    while ($true) {
        $message = Read-CdpMessage -WebSocket $WebSocket -CancellationToken $CancellationToken
        if ($message.id -ne $RequestId) { continue }
        return $message
    }
}

try {
    $stage = 'load-assembly'
    $null = Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
    $null = . (Join-Path $PSScriptRoot 'FoundryCdp.Targets.ps1')

    $stage = 'validate'
    $endpointUri = [Uri]$Endpoint
    if ($endpointUri.Scheme -ne 'http' -or -not (Test-CdpLoopbackHost $endpointUri.Host) -or $endpointUri.AbsolutePath -ne '/' -or $endpointUri.Query -or $endpointUri.UserInfo) {
        throw 'Endpoint CDP inválido: use somente uma URL HTTP local, por exemplo http://127.0.0.1:9223.'
    }

    if ($PSCmdlet.ParameterSetName -eq 'Probe') {
        $expressionToRun = @'
(async () => {
  if (!globalThis.game?.ready) throw new Error("Foundry ainda não está pronto nesta página.");
  return {
    version: game.version ?? null,
    worldId: game.world?.id ?? null,
    isGM: Boolean(game.user?.isGM),
    importerVersion: game.modules?.get("rpgup-pillars-importer")?.version ?? null
  };
})()
'@
    }
    elseif ($PSCmdlet.ParameterSetName -eq 'Script') {
        $scriptRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        $resolvedScript = (Resolve-Path -LiteralPath $ScriptPath).Path
        $fullScriptPath = [System.IO.Path]::GetFullPath($resolvedScript)
        if (-not $fullScriptPath.StartsWith($scriptRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'O script precisa estar dentro de tools/foundry-console/.'
        }
        if ([System.IO.Path]::GetExtension($fullScriptPath) -ne '.js') {
            throw 'Somente arquivos .js podem ser executados pelo parâmetro -ScriptPath.'
        }
        $item = Get-Item -LiteralPath $fullScriptPath
        if ($item.Length -gt 512000) { throw 'O script excede o limite de 512 KB.' }
        $expressionToRun = [System.IO.File]::ReadAllText($fullScriptPath, [System.Text.Encoding]::UTF8)
    }
    else {
        $expressionToRun = $Expression
    }

    $stage = 'discover'
    $jsonListUri = ([Uri]::new($endpointUri, '/json/list')).AbsoluteUri
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseProxy = $false
    $http = [System.Net.Http.HttpClient]::new($handler)
    $http.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    $response = $http.GetAsync($jsonListUri).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
        throw "CDP /json/list respondeu HTTP $([int]$response.StatusCode)."
    }
    $targetsJson = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $null = $response.Dispose()
    $targets = ConvertFrom-CdpTargetJson -JsonText $targetsJson
    $matchingTargets = Get-FoundryPageTargets -Targets $targets
    if ($matchingTargets.Count -ne 1) {
        throw "Esperava exatamente uma página type=page em http://localhost:30001/game; encontrei $($matchingTargets.Count)."
    }
    $target = $matchingTargets[0]
    $webSocketUri = [Uri]$target.webSocketDebuggerUrl
    if (-not (Test-FoundryPageWebSocket -WebSocketUrl $target.webSocketDebuggerUrl -EndpointPort $endpointUri.Port)) {
        throw 'O WebSocket da página não pertence ao endpoint CDP local esperado; conexão recusada.'
    }
    $targetInfo = [ordered]@{ title = [string]$target.title; url = [string]$target.url; type = [string]$target.type }

    $stage = 'connect'
    $cts = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $socket.ConnectAsync($webSocketUri, $cts.Token).GetAwaiter().GetResult()

    $stage = 'evaluate'
    $requestId = 1
    $message = Send-CdpRequest -WebSocket $socket -RequestId $requestId -Method 'Runtime.evaluate' -Parameters @{
        expression = $expressionToRun
        awaitPromise = $true
        returnByValue = $true
        userGesture = $false
        includeCommandLineAPI = $false
        replMode = $false
    } -CancellationToken $cts.Token

    if ($message.error) { throw "CDP Runtime.evaluate erro $($message.error.code): $($message.error.message)" }
    $evaluation = $message.result
    $remote = $evaluation.result
    $exception = $evaluation.exceptionDetails
    $evaluationError = $null
    if ($exception) {
        $evaluationError = [ordered]@{
            kind = 'javascript-exception'
            message = [string]$exception.text
            description = [string]$exception.exception.description
            lineNumber = $exception.lineNumber
            columnNumber = $exception.columnNumber
        }
    }
    $value = $null
    if ($remote -and $remote.PSObject.Properties.Name -contains 'value') { $value = $remote.value }
    $result = [ordered]@{
        status = $(if ($evaluationError) { 'error' } else { 'ok' })
        stage = $stage
        target = $targetInfo
        requestId = $message.id
        value = $value
        remoteType = [string]$remote.type
        remoteSubtype = [string]$remote.subtype
        remoteDescription = [string]$remote.description
        unserializableValue = [string]$remote.unserializableValue
        error = $evaluationError
        durationMs = [int]([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds
    }
    $global:LASTEXITCODE = $(if ($evaluationError) { 1 } else { 0 })
    [PSCustomObject]$result
}
catch {
    $global:LASTEXITCODE = 1
    $exceptionChain = @()
    $currentException = $_.Exception
    while ($currentException -and $exceptionChain.Count -lt 8) {
        $exceptionChain += [ordered]@{
            type = $currentException.GetType().FullName
            message = $currentException.Message
        }
        $currentException = $currentException.InnerException
    }
    $deepestException = $exceptionChain | Select-Object -Last 1
    $errorKind = switch ($stage) {
        'discover' { 'target-discovery-failed' }
        'connect' { 'websocket-connect-failed' }
        'evaluate' { 'javascript-evaluation-failed' }
        default { 'connection-or-protocol-error' }
    }
    [PSCustomObject][ordered]@{
        status = 'error'
        stage = $stage
        target = $targetInfo
        requestId = $null
        value = $null
        remoteType = $null
        remoteSubtype = $null
        remoteDescription = $null
        unserializableValue = $null
        error = [ordered]@{
            kind = $errorKind
            message = $_.Exception.Message
            exceptionType = $_.Exception.GetType().FullName
            innerMessage = $(if ($exceptionChain.Count -gt 1) { $deepestException.message } else { $null })
            exceptionChain = $exceptionChain
        }
        durationMs = [int]([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds
    }
}
finally {
    if ($socket) {
        try {
            if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                $closeCts = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(2))
                $null = $socket.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', $closeCts.Token).GetAwaiter().GetResult()
                $null = $closeCts.Dispose()
            }
        }
        catch { }
        $null = $socket.Dispose()
    }
    if ($cts) { $null = $cts.Dispose() }
    if ($response) { $null = $response.Dispose() }
    if ($http) { $null = $http.Dispose() }
}
