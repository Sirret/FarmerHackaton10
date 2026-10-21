# Renders every slide of a deck to PNG with PowerPoint (QA previews).
# Usage: powershell -File render.ps1 [deck file name] [preview folder name]
param([string]$DeckName = 'kafo-signal-deck.pptx', [string]$OutName = 'previews')
$deck = Join-Path $PSScriptRoot $DeckName
$out = Join-Path $PSScriptRoot $OutName
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter 'slide-*.png' | Remove-Item -Force
$pp = New-Object -ComObject PowerPoint.Application
$p = $null
try {
  $p = $pp.Presentations.Open($deck, $true, $false, $false)  # read-only, no window
  $i = 0
  foreach ($s in $p.Slides) { $i++; $s.Export((Join-Path $out ('slide-{0:D2}.png' -f $i)), 'PNG', 1600, 900) }
  "rendered $i slides to $out"
} finally {
  if ($p) { $p.Close() }
  # Quit only if no other presentation is open (the user may have a deck open in PowerPoint)
  if ($pp.Presentations.Count -eq 0) { $pp.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
}
