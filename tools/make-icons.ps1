# =============================================================
#  GRIMOIRE - make-icons.ps1
#  Draws the app icons from the same 16x16 pixel map the app
#  uses on screen, so the home-screen icon and the in-app mark
#  are literally the same artwork.
#
#  Run from the project root:   powershell -File tools\make-icons.ps1
# =============================================================

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root 'icons'
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Path $iconDir | Out-Null }

# palette - matches PAL in js/sprites.js
$pal = @{
  'K' = '#17121f'; 'W' = '#f4f0e4'; 'G' = '#f0b429'; 'Y' = '#ffe98a'
  'R' = '#c1362f'; 'D' = '#7a1f1c'; 'T' = '#43c9b0'
}

# the tome - matches TOME in js/sprites.js
$map = @(
  '................',
  '..KKKKKKKKKKKK..',
  '.KDGDKRRRRRRRRK.',
  '.KDDDKRRRRRRRRK.',
  '.KDGDKRRRRRRRGK.',
  '.KDDDKRRGGGGRRK.',
  '.KDGDKRRGTTGRRK.',
  '.KDDDKRRGTTGRRK.',
  '.KDGDKRRGGGGRRK.',
  '.KDDDKRRRRRRRGK.',
  '.KDGDKRRRRRRRRK.',
  '.KDDDKRRRRRRRRK.',
  '.KDGDKRRRRRRRRK.',
  '.KKKKKWWWWWWWWK.',
  '..KKKKKKKKKKKK..',
  '................'
)

$bgColour = '#14101f'   # --c-void, the dungeon theme background

function New-PixelIcon {
  param(
    [int]    $Size,
    [double] $Fill,       # 1.0 = art fills the canvas, 0.7 = maskable safe zone
    [string] $Path
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($bgColour))

  $px = [Math]::Floor(($Size * $Fill) / 16)
  if ($px -lt 1) { $px = 1 }
  $art = $px * 16
  $off = [Math]::Floor(($Size - $art) / 2)

  for ($y = 0; $y -lt 16; $y++) {
    $row = $map[$y]
    for ($x = 0; $x -lt 16; $x++) {
      $ch = [string]$row[$x]
      if ($ch -eq '.') { continue }
      $hex = $pal[$ch]
      if (-not $hex) { $hex = '#ff00ff' }
      $brush = New-Object System.Drawing.SolidBrush(
        [System.Drawing.ColorTranslator]::FromHtml($hex))
      $g.FillRectangle($brush, ($off + $x * $px), ($off + $y * $px), $px, $px)
      $brush.Dispose()
    }
  }

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-28} {1}x{1}  ({2}px per art pixel)" -f (Split-Path $Path -Leaf), $Size, $px)
}

Write-Host ''
Write-Host 'Drawing icons into' $iconDir -ForegroundColor Cyan

New-PixelIcon -Size 32  -Fill 1.0  -Path (Join-Path $iconDir 'icon-32.png')
New-PixelIcon -Size 64  -Fill 1.0  -Path (Join-Path $iconDir 'icon-64.png')
New-PixelIcon -Size 180 -Fill 1.0  -Path (Join-Path $iconDir 'icon-180.png')
New-PixelIcon -Size 180 -Fill 1.0  -Path (Join-Path $iconDir 'apple-touch-icon-180.png')
New-PixelIcon -Size 192 -Fill 1.0  -Path (Join-Path $iconDir 'icon-192.png')
New-PixelIcon -Size 512 -Fill 1.0  -Path (Join-Path $iconDir 'icon-512.png')

# maskable icons keep the art inside the middle ~70% so Android
# can crop them to a circle or squircle without clipping it
New-PixelIcon -Size 192 -Fill 0.68 -Path (Join-Path $iconDir 'maskable-192.png')
New-PixelIcon -Size 512 -Fill 0.68 -Path (Join-Path $iconDir 'maskable-512.png')

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ''
