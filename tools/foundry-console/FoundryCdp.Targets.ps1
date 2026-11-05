function Test-CdpLoopbackHost {
    param([Parameter(Mandatory = $true)][string]$HostName)

    if ($HostName -ieq 'localhost') { return $true }
    $address = $null
    if (-not [System.Net.IPAddress]::TryParse($HostName, [ref]$address)) { return $false }
    return [System.Net.IPAddress]::IsLoopback($address)
}

function ConvertFrom-CdpTargetJson {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$JsonText)

    if ([string]::IsNullOrWhiteSpace($JsonText)) { throw 'CDP /json/list retornou JSON vazio.' }
    $cleanJson = $JsonText.TrimStart([char]0xFEFF)
    try {
        $parsed = ConvertFrom-Json -InputObject $cleanJson -ErrorAction Stop
    }
    catch {
        throw "JSON inválido em CDP /json/list: $($_.Exception.Message)"
    }

    if ($null -eq $parsed) { return ,@() }
    if ($parsed -is [System.Array]) {
        $targets = $parsed
    }
    elseif ($parsed.PSObject.Properties.Name -contains 'type' -and $parsed.PSObject.Properties.Name -contains 'url') {
        # Também aceita um único target, forma que Windows PowerShell 5.1 pode
        # produzir ao desserializar um array JSON de um só elemento.
        $targets = @($parsed)
    }
    else {
        throw 'CDP /json/list deve conter um array de targets ou um target único.'
    }
    return ,$targets
}

function Get-FoundryPageTargets {
    [CmdletBinding()]
    param([Parameter()][AllowNull()][object[]]$Targets)

    $matchedTargets = New-Object 'System.Collections.Generic.List[object]'
    foreach ($target in $Targets) {
        if ($null -eq $target) { continue }

        $type = [string]$target.type
        if (-not [string]::Equals($type, 'page', [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        if ([string]::IsNullOrWhiteSpace([string]$target.url) -or [string]::IsNullOrWhiteSpace([string]$target.webSocketDebuggerUrl)) { continue }

        $pageUri = $null
        if (-not [Uri]::TryCreate([string]$target.url, [UriKind]::Absolute, [ref]$pageUri)) { continue }
        if ($pageUri.Scheme -cne 'http' -or $pageUri.Host -ine 'localhost' -or $pageUri.Port -ne 30001 -or $pageUri.UserInfo) { continue }
        if ($pageUri.AbsolutePath -cne '/game' -and $pageUri.AbsolutePath -cne '/game/') { continue }
        if ($pageUri.Fragment) { continue }

        $null = $matchedTargets.Add($target)
    }

    $result = $matchedTargets.ToArray()
    return ,$result
}

function Test-FoundryPageWebSocket {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$WebSocketUrl,
        [Parameter(Mandatory = $true)][int]$EndpointPort
    )

    $uri = $null
    if (-not [Uri]::TryCreate($WebSocketUrl, [UriKind]::Absolute, [ref]$uri)) { return $false }
    return $uri.Scheme -ceq 'ws' -and (Test-CdpLoopbackHost $uri.Host) -and
        $uri.Port -eq $EndpointPort -and
        $uri.AbsolutePath.StartsWith('/devtools/page/', [System.StringComparison]::Ordinal)
}
