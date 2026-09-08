param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Files)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$cli = Join-Path $PSScriptRoot '..\cc-transfer.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ($Files.Count -gt 0) {
    & $node $cli send -- @Files
    if ($LASTEXITCODE -ne 0) { [Windows.Forms.MessageBox]::Show('One or more files could not be sent. Run the sender from PowerShell to view the error.','Command Centre') | Out-Null }
    else { [Windows.Forms.MessageBox]::Show('Files sent to your other paired devices.','Command Centre') | Out-Null }
    exit
}
$form = New-Object Windows.Forms.Form
$form.Text = 'Command Centre Transfer'
$form.Size = New-Object Drawing.Size(550, 435)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(18, 30, 49)
$form.ForeColor = [Drawing.Color]::White
$form.AllowDrop = $true
$title = New-Object Windows.Forms.Label
$title.Text = 'Drop files to send to your other devices'
$title.Location = New-Object Drawing.Point(22, 20)
$title.Size = New-Object Drawing.Size(490, 50)
$title.Font = New-Object Drawing.Font('Segoe UI', 16)
$form.Controls.Add($title)
$label = New-Object Windows.Forms.Label
$label.Text = 'Original file bytes. Default expiry: 1 day. Pair this sender first using the setup guide.'
$label.Location = New-Object Drawing.Point(22, 76)
$label.Size = New-Object Drawing.Size(490, 40)
$form.Controls.Add($label)
$choose = New-Object Windows.Forms.Button
$choose.Text = 'Choose files'
$choose.Location = New-Object Drawing.Point(22, 125)
$choose.Size = New-Object Drawing.Size(145, 36)
$form.Controls.Add($choose)
$text = New-Object Windows.Forms.TextBox
$text.Multiline = $true
$text.Location = New-Object Drawing.Point(22, 180)
$text.Size = New-Object Drawing.Size(490, 120)
$form.Controls.Add($text)
$send = New-Object Windows.Forms.Button
$send.Text = 'Send message / link'
$send.Location = New-Object Drawing.Point(22, 310)
$send.Size = New-Object Drawing.Size(190, 36)
$form.Controls.Add($send)
$stateLabel = New-Object Windows.Forms.Label
$stateLabel.Text = 'Ready'
$stateLabel.Location = New-Object Drawing.Point(22, 357)
$stateLabel.Size = New-Object Drawing.Size(490, 36)
$form.Controls.Add($stateLabel)
# Start-Job keeps network activity off the UI thread. The token remains in DPAPI-protected CLI config.
$script:transferJob = $null
function Start-Transfer([string[]]$CliArgs) {
    if ($script:transferJob) { return }
    $choose.Enabled = $false; $send.Enabled = $false
    $stateLabel.Text = 'Sending... Keep this window open.'
    $script:transferJob = Start-Job -ArgumentList $node,$cli,($CliArgs) -ScriptBlock {
        param($NodePath,$CliPath,$Arguments)
        & $NodePath $CliPath @Arguments 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Transfer failed.' }
    }
}
$choose.Add_Click({
    $dialog = New-Object Windows.Forms.OpenFileDialog
    $dialog.Multiselect = $true
    if ($dialog.ShowDialog() -eq 'OK') { Start-Transfer (@('send','--') + $dialog.FileNames) }
})
$send.Add_Click({
    $value = $text.Text.Trim()
    if (!$value) { return }
    if ($value -match '^https?://\S+$') { Start-Transfer @('link','--url',$value) }
    else { Start-Transfer @('message','--text',$value) }
})
$form.Add_DragEnter({ if ($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) { $_.Effect = [Windows.Forms.DragDropEffects]::Copy } })
$form.Add_DragDrop({ if (!$script:transferJob) { Start-Transfer (@('send','--') + [string[]]$_.Data.GetData([Windows.Forms.DataFormats]::FileDrop)) } })
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 400
$timer.Add_Tick({
    if ($script:transferJob -and $script:transferJob.State -in @('Completed','Failed','Stopped')) {
        $result = Receive-Job $script:transferJob -ErrorAction SilentlyContinue | Out-String
        if ($script:transferJob.State -eq 'Completed') { $stateLabel.Text = 'Sent. Open Transfers on your other device.'; $text.Clear() }
        else { $stateLabel.Text = 'Could not send. Check connection and pairing.'; [Windows.Forms.MessageBox]::Show($result,'Transfer error') | Out-Null }
        Remove-Job $script:transferJob; $script:transferJob = $null
        $choose.Enabled = $true; $send.Enabled = $true
    }
})
$form.Add_FormClosing({ if ($script:transferJob) { $_.Cancel = $true; $stateLabel.Text = 'Please wait for this transfer to finish before closing.' } })
$timer.Start()
$form.ShowDialog() | Out-Null
$timer.Dispose()
