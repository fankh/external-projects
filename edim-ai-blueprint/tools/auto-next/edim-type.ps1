# Inject text into the interactive Claude session console as if typed by the user.
# Mechanism: AttachConsole(<claude PID from session.pid>) + WriteConsoleInput key events.
# Usage: powershell -File edim-type.ps1 "message"   (-TargetPid to override)
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)][string[]]$Text,
    [Parameter()][int]$TargetPid = 0
)
$ErrorActionPreference = 'Stop'
if ($TargetPid -eq 0) {
    $TargetPid = [int](Get-Content 'C:\temp\edim-auto-next\session.pid' -Raw).Trim()
}
$msg = ($Text -join ' ')

Add-Type -Namespace Win32 -Name ConIn -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint dwProcessId);
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr CreateFile(
    string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
[StructLayout(LayoutKind.Sequential)] public struct KEY_EVENT_RECORD {
    public bool bKeyDown; public ushort wRepeatCount; public ushort wVirtualKeyCode;
    public ushort wVirtualScanCode; public char UnicodeChar; public uint dwControlKeyState; }
[StructLayout(LayoutKind.Explicit)] public struct INPUT_RECORD {
    [FieldOffset(0)] public ushort EventType; [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent; }
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool WriteConsoleInput(
    IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer, uint nLength, out uint lpNumberOfEventsWritten);
'@

[Win32.ConIn]::FreeConsole() | Out-Null
if (-not [Win32.ConIn]::AttachConsole([uint32]$TargetPid)) {
    throw "AttachConsole($TargetPid) failed - must run in the same user session"
}
try {
    # GENERIC_READ|GENERIC_WRITE = 0xC0000000 (UInt32 리터럴 오버플로 회피)
    $h = [Win32.ConIn]::CreateFile('CONIN$', [uint32]3221225472, [uint32]3, [IntPtr]::Zero, [uint32]3, [uint32]0, [IntPtr]::Zero)
    if ($h -eq [IntPtr]::Zero -or $h.ToInt64() -eq -1) { throw 'open CONIN$ failed' }
    $events = New-Object 'System.Collections.Generic.List[Win32.ConIn+INPUT_RECORD]'
    $addKey = {
        param([char]$ch, [uint16]$vk)
        foreach ($down in $true, $false) {
            $k = New-Object 'Win32.ConIn+KEY_EVENT_RECORD'
            $k.bKeyDown = $down; $k.wRepeatCount = 1
            $k.wVirtualKeyCode = $vk; $k.UnicodeChar = $ch
            $r = New-Object 'Win32.ConIn+INPUT_RECORD'
            $r.EventType = 1
            $r.KeyEvent = $k
            $events.Add($r)
        }
    }
    foreach ($ch in $msg.ToCharArray()) { & $addKey $ch 0 }
    & $addKey ([char]13) 0x0D
    $written = [uint32]0
    if (-not [Win32.ConIn]::WriteConsoleInput($h, $events.ToArray(), [uint32]$events.Count, [ref]$written)) {
        throw "WriteConsoleInput failed (written=$written)"
    }
    Write-Output "injected $written events -> PID $TargetPid : $msg"
} finally {
    [Win32.ConIn]::FreeConsole() | Out-Null
}
