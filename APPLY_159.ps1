$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\package.json")) {
  Write-Host "[ERROR] mathpooh-ai 프로젝트 루트에서 실행해 주세요." -ForegroundColor Red
  exit 1
}
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "src\app\admin\page.tsx",
  "src\app\api\admin\recommendations\route.ts",
  "src\app\exam-updates.css"
)
foreach ($rel in $files) {
  $src = Join-Path $patchRoot $rel
  $dst = Join-Path (Get-Location) $rel
  $dir = Split-Path -Parent $dst
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -Force $src $dst
  Write-Host "[APPLIED] $rel" -ForegroundColor Green
}
Write-Host ""
Write-Host "이제 아래 명령으로 확인하세요:" -ForegroundColor Cyan
Write-Host "git status"
Write-Host "git diff -- src/app/admin/page.tsx src/app/api/admin/recommendations/route.ts src/app/exam-updates.css"
