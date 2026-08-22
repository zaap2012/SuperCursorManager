$ErrorActionPreference = "SilentlyContinue"
$homeDir = Join-Path $env:USERPROFILE ".pulse"
$spool = Join-Path $homeDir "spool.jsonl"
$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { $raw = "{}" }
$raw = $raw.Trim() -replace "[\r\n]+", ""
try { $null = $raw | ConvertFrom-Json } catch { $raw = "{}" }
$receivedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$line = "{`"schemaVersion`":1,`"source`":{`"kind`":`"ide.cursor`"},`"receivedAt`":$receivedAt,`"payload`":$raw}"
[void][System.IO.Directory]::CreateDirectory($homeDir)
[System.IO.File]::AppendAllText($spool, $line + "`n")
Write-Output "{}"
