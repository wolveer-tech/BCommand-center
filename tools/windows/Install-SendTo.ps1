$ErrorActionPreference = 'Stop'
$sender = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Send-To-Command-Centre.ps1')).Path
if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer from nodejs.org first.' }
$sendToFolder = [Environment]::GetFolderPath('SendTo')
$shortcutPath = Join-Path $sendToFolder 'Command Centre.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $sender + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Send original files to your paired Command Centre devices'
$shortcut.Save()
Write-Host 'Installed: right-click a file > Show more options > Send to > Command Centre.'
Write-Host 'Keep this extracted app folder in place; the shortcut points to it.'
Write-Host 'To uninstall, remove the Command Centre shortcut from shell:sendto.'
