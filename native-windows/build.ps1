param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sdkVersion = '1.0.4258.31'
$sdkRoot = Join-Path $projectRoot "artifacts/native-windows-sdk/$sdkVersion"
$outputRoot = Join-Path $projectRoot 'artifacts/Command-Centre-Windows-1.0.2'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework 4.x compiler is required.' }
New-Item -ItemType Directory -Force -Path $sdkRoot, $outputRoot | Out-Null
$coreDll = Join-Path $sdkRoot 'lib/net462/Microsoft.Web.WebView2.Core.dll'
if (!(Test-Path -LiteralPath $coreDll)) {
    if ($Offline) { throw 'Pinned WebView2 SDK is not cached. Run without -Offline to download it from NuGet.' }
    $package = Join-Path $sdkRoot 'webview2.nupkg'
    $packageUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg"
    Invoke-WebRequest -UseBasicParsing -Uri $packageUrl -OutFile $package
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($package, $sdkRoot)
}
$formsDll = Join-Path $sdkRoot 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $sdkRoot 'runtimes/win-x64/native/WebView2Loader.dll'
foreach ($dependency in @($coreDll, $formsDll, $loader)) { if (!(Test-Path -LiteralPath $dependency)) { throw "SDK dependency missing: $dependency" } }
$policy = Join-Path $PSScriptRoot 'NavigationPolicy.cs'
$main = Join-Path $PSScriptRoot 'CommandCentre.cs'
$tests = Join-Path $PSScriptRoot 'PolicyTests.cs'
$testExe = Join-Path $sdkRoot 'CommandCentrePolicyTests.exe'
& $compiler /nologo /target:exe /platform:x64 "/out:$testExe" $policy $tests
if ($LASTEXITCODE -ne 0) { throw 'Native policy test compilation failed.' }
& $testExe
if ($LASTEXITCODE -ne 0) { throw 'Native navigation policy checks failed.' }
$executable = Join-Path $outputRoot 'CommandCentre.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" "/out:$executable" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$coreDll" "/reference:$formsDll" $policy $main
if ($LASTEXITCODE -ne 0) { throw 'Windows app compilation failed.' }
Copy-Item -LiteralPath $coreDll, $formsDll, $loader -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README-WINDOWS.md') -Destination $outputRoot -Force
Get-ChildItem -LiteralPath $sdkRoot -Filter '*LICENSE*' -File | Copy-Item -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $sdkRoot 'NOTICE.txt') -Destination $outputRoot -Force
$zip = Join-Path $projectRoot 'artifacts/Command-Centre-Windows-1.0.2.zip'
Compress-Archive -Path (Join-Path $outputRoot '*') -DestinationPath $zip -Force
Write-Output "Built $executable"
Write-Output "Portable package: $zip"
