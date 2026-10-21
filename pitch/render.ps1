# Renders every slide of the deck to PNG with PowerPoint (QA previews). Usage: powershell -File render.ps1
$deck = Join-Path $PSScriptRoot 'kafo-signal-deck.pptx'
$out = Join-Path $PSScriptRoot 'previews'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter 'slide-*.png' | Remove-Item -Force
$pp = New-Object -ComObject PowerPoint.Application
try {
  $p = $pp.Presentations.Open($deck, $true, $false, $false)  # read-only, no window
  $i = 0
  foreach ($s in $p.Slides) { $i++; $s.Export((Join-Path $out ('slide-{0:D2}.png' -f $i)), 'PNG', 1600, 900) }
  $p.Close()
  "rendered $i slides to $out"
} finally { $pp.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null }
