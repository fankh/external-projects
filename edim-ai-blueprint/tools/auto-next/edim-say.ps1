# 이 세션(백로그 실행 중인 Claude 대화)에 백그라운드에서 텍스트 전달.
# 사용: powershell -File edim-say.ps1 "메시지"   또는   edim-say.ps1 -Text "메시지"
# 동작: 인박스 파일에 적재 → 세션이 다음 기상(배치 사이 60초 / 대기 중 4.5분)에 읽고 지시로 처리.
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Text)
$inbox = 'C:\temp\edim-auto-next\inbox.md'
New-Item -ItemType Directory -Force (Split-Path $inbox) | Out-Null
$line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), ($Text -join ' ')
Add-Content -Path $inbox -Value $line -Encoding utf8
Write-Host "queued -> $inbox : $line"
