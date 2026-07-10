# EDIM 백로그 자동 계속 러너 — Windows 작업 스케줄러가 매시 실행.
# 헤드리스 claude -p 로 "do next" 한 회차(배치 1개)를 수행한다.
$ErrorActionPreference = 'Stop'
$repo = 'C:\repos\new-research\external-projects\edim-ai-blueprint'
$logDir = 'C:\temp\edim-auto-next'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("run-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.log')
$lock = Join-Path $logDir 'run.lock'

# 동시 실행 가드 — 이전 회차가 아직 돌고 있으면 건너뜀 (3시간 이상 된 lock 은 스테일로 간주)
if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalHours -lt 3) {
        "skip: previous run in progress (lock age $([int]$age.TotalMinutes)m)" | Out-File $log -Encoding utf8
        exit 0
    }
    Remove-Item $lock -Force
}
New-Item -ItemType File $lock -Force | Out-Null

try {
    Set-Location $repo
    $prompt = Get-Content (Join-Path $repo 'tools\auto-next\edim-auto-next-prompt.md') -Raw -Encoding utf8
    # 무인 회차 — 권한 프롬프트 없이 실행 (로그로 전 과정 감사 가능). 빈 stdin 으로 경고 억제.
    $null | & claude -p $prompt --dangerously-skip-permissions 2>&1 | Out-File $log -Encoding utf8
    "exit: $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
} finally {
    Remove-Item $lock -Force -ErrorAction SilentlyContinue
    # 30일 지난 로그 정리
    Get-ChildItem $logDir -Filter 'run-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}
