param([int]$MaxRequests = 0)

$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 8000

function Get-LocalIPv4 {
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Connect("8.8.8.8", 53)
        $address = ([System.Net.IPEndPoint]$udp.Client.LocalEndPoint).Address.ToString()
        $udp.Close()
        return $address
    }
    catch {
        $address = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object {
                $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                $_.ToString() -notlike "127.*" -and
                $_.ToString() -notlike "169.254.*"
            } |
            Select-Object -First 1
        if ($address) { return $address.ToString() }
        return "PC-IP-ADDRESS"
    }
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [string]$Status,
        [string]$ContentType,
        [byte[]]$Body,
        [bool]$HeadOnly
    )

    $header = "HTTP/1.1 $Status`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

try {
    $listener.Start()
    $localIp = Get-LocalIPv4

    Clear-Host
    Write-Host ""
    Write-Host "  OTONIWA is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open this URL on your smartphone:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "      http://${localIp}:${port}" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Keep this window open while you play."
    Write-Host "  Press Ctrl+C to stop."
    Write-Host ""

    $requestCount = 0
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()

            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            while (($line = $reader.ReadLine()) -ne $null -and $line -ne "") { }

            $parts = $requestLine.Split(" ")
            $method = $parts[0]
            $rawPath = $parts[1].Split("?")[0]
            $headOnly = $method -eq "HEAD"

            if ($method -ne "GET" -and -not $headOnly) {
                Send-Response $stream "405 Method Not Allowed" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed")) $false
                continue
            }

            $urlPath = [System.Uri]::UnescapeDataString($rawPath)
            $relativePath = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }

            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
            $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

            if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                Send-Response $stream "403 Forbidden" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) $headOnly
                continue
            }

            if (-not [System.IO.File]::Exists($fullPath)) {
                Send-Response $stream "404 Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Not found")) $headOnly
                continue
            }

            $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) { $contentType = "application/octet-stream" }
            $body = [System.IO.File]::ReadAllBytes($fullPath)
            Send-Response $stream "200 OK" $contentType $body $headOnly
        }
        catch {
            # Ignore a single broken browser request and keep the server running.
        }
        finally {
            if ($client) { $client.Close() }
        }

        $requestCount++
        if ($MaxRequests -gt 0 -and $requestCount -ge $MaxRequests) { break }
    }
}
catch [System.Net.Sockets.SocketException] {
    Write-Host ""
    Write-Host "Port 8000 is already in use." -ForegroundColor Red
    Write-Host "Close the other OTONIWA window, then double-click the start file again."
    Write-Host ""
    Read-Host "Press Enter to close"
}
finally {
    $listener.Stop()
}
