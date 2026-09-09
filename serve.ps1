# =============================================================
#  GRIMOIRE - serve.ps1
#
#  A tiny static web server so you can open the app on your
#  iPhone over your home wi-fi. Needs nothing installed - no
#  Node, no Python - and does NOT need Administrator, because it
#  uses a raw TCP listener rather than Windows' HTTP stack.
#
#  Usage:
#      powershell -ExecutionPolicy Bypass -File serve.ps1
#      powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000
#
#  Then open the printed http://192.168.x.x:8080 address in
#  Safari on your iPhone. Ctrl+C here stops the server.
# =============================================================

[CmdletBinding()]
param(
  [int]    $Port = 8080,
  [string] $Root = ''
)

$ErrorActionPreference = 'Stop'

# Work out the project folder. $PSScriptRoot is not always populated
# depending on how the script is launched, so fall back sensibly.
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
}
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }

$Root = (Resolve-Path -LiteralPath $Root).Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
  '.woff' = 'font/woff'
  '.ttf'  = 'font/ttf'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.wav'  = 'audio/wav'
  '.mp3'  = 'audio/mpeg'
}

function Get-LocalAddresses {
  $ips = @()
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
           Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
           Select-Object -ExpandProperty IPAddress
  } catch {
    $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
           Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
           ForEach-Object { $_.IPAddressToString } |
           Where-Object { $_ -notlike '127.*' -and $_ -notlike '169.254.*' }
  }
  return $ips
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream] $Stream,
    [int]    $Status,
    [string] $StatusText,
    [string] $ContentType,
    [byte[]] $Body,
    [bool]   $HeadOnly = $false
  )

  $len = if ($Body) { $Body.Length } else { 0 }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("HTTP/1.1 $Status $StatusText")
  [void]$sb.AppendLine("Content-Type: $ContentType")
  [void]$sb.AppendLine("Content-Length: $len")
  # never cache during development, or edits appear not to work
  [void]$sb.AppendLine('Cache-Control: no-store, must-revalidate')
  [void]$sb.AppendLine('Service-Worker-Allowed: /')
  [void]$sb.AppendLine('Connection: close')
  [void]$sb.AppendLine()

  $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $Stream.Write($head, 0, $head.Length)
  if ($Body -and -not $HeadOnly) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

# ------------------------------------------------------------------

if (-not (Test-Path (Join-Path $Root 'index.html'))) {
  Write-Host ''
  Write-Warning "No index.html found in $Root - is serve.ps1 in the project folder?"
  Write-Host ''
}

try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
  $listener.Start()
} catch {
  Write-Host ''
  Write-Host "Could not listen on port $Port." -ForegroundColor Red
  Write-Host "Something else may be using it. Try:  -Port 8081" -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host '  ##   GRIMOIRE   ##' -ForegroundColor Yellow
Write-Host ''
Write-Host "  Serving : $Root"
Write-Host "  On this PC : " -NoNewline
Write-Host "http://localhost:$Port" -ForegroundColor Green
foreach ($ip in Get-LocalAddresses) {
  Write-Host "  On your iPhone : " -NoNewline
  Write-Host ("http://{0}:{1}" -f $ip, $Port) -ForegroundColor Green
}
Write-Host ''
Write-Host '  Open that address in SAFARI on the iPhone, then'
Write-Host '  Share > Add to Home Screen.'
Write-Host ''
Write-Host '  Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $client.NoDelay = $true
    # a graceful close, so the browser always sees the whole response.
    # Without this, closing the socket can send a RST and truncate the
    # body - which service-worker script fetches refuse outright.
    $client.LingerState = New-Object System.Net.Sockets.LingerOption($true, 4)
    $stream = $null
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000

      # read until the end of the request head, not just once - the
      # head can arrive split across several TCP segments
      $buf = New-Object byte[] 4096
      $text = ''
      while ($text -notmatch "`r`n`r`n" -and $text.Length -lt 32768) {
        $read = $stream.Read($buf, 0, $buf.Length)
        if ($read -le 0) { break }
        $text += [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
      }
      if ([string]::IsNullOrEmpty($text)) { continue }

      $firstLine = ($text -split "`r`n")[0]
      $parts = $firstLine -split ' '
      if ($parts.Count -lt 2) { continue }

      $method = $parts[0].ToUpper()
      $target = $parts[1]

      if ($method -ne 'GET' -and $method -ne 'HEAD') {
        Send-Response -Stream $stream -Status 405 -StatusText 'Method Not Allowed' `
          -ContentType 'text/plain' -Body ([System.Text.Encoding]::UTF8.GetBytes('Only GET is served.'))
        continue
      }

      # strip query and fragment, decode %20 etc.
      $path = ($target -split '[?#]')[0]
      $path = [System.Uri]::UnescapeDataString($path)
      if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
      $rel = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)

      $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))

      # keep requests inside the project folder
      if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Response -Stream $stream -Status 403 -StatusText 'Forbidden' `
          -ContentType 'text/plain' -Body ([System.Text.Encoding]::UTF8.GetBytes('Nope.'))
        continue
      }

      if ((Test-Path $full) -and (Get-Item $full).PSIsContainer) {
        $full = Join-Path $full 'index.html'
      }

      if (-not (Test-Path $full)) {
        Write-Host ("  404  {0}" -f $path) -ForegroundColor DarkYellow
        Send-Response -Stream $stream -Status 404 -StatusText 'Not Found' `
          -ContentType 'text/html; charset=utf-8' `
          -Body ([System.Text.Encoding]::UTF8.GetBytes(
            "<h1>404</h1><p>$($path -replace '[<>&"]', '?') is not here.</p>")) `
          -HeadOnly ($method -eq 'HEAD')
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $type = $mime[$ext]
      if (-not $type) { $type = 'application/octet-stream' }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      Write-Host ("  200  {0}  ({1:N0} bytes)" -f $path, $bytes.Length) -ForegroundColor DarkGray
      Send-Response -Stream $stream -Status 200 -StatusText 'OK' -ContentType $type `
        -Body $bytes -HeadOnly ($method -eq 'HEAD')

    } catch {
      # a dropped connection is normal - keep serving
      Write-Verbose $_.Exception.Message
    } finally {
      # half-close the send side first so the client gets a clean FIN
      try { $client.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch {}
      if ($stream) { try { $stream.Close() } catch {} }
      try { $client.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  Write-Host ''
  Write-Host '  Server stopped.' -ForegroundColor Yellow
  Write-Host ''
}
