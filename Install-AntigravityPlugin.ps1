[CmdletBinding(SupportsShouldProcess = $true, PositionalBinding = $false)]
param(
    [switch]$Link,
    [switch]$Sync,
    [switch]$Force,
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Link) {
    throw 'The -Link switch is deprecated. NTFS junctions and symlinks across drive boundaries fail Antigravity Language Server path confinement (isGlobalPluginDir). Use default physical installation or -Sync for live repository synchronization.'
}

$RepoRoot = $PSScriptRoot
$PluginName = 'taste-skill'
$PluginsDir = Join-Path (Join-Path (Join-Path $HOME '.gemini') 'config') 'plugins'
$PluginDest = Join-Path $PluginsDir $PluginName
$LegacySkill = Join-Path (Join-Path (Join-Path $HOME '.agents') 'skills') 'design-taste-frontend'

function Remove-LegacySkill {
    $legacyItem = Get-Item -LiteralPath $LegacySkill -Force -ErrorAction SilentlyContinue
    if (-not $legacyItem) { return }
    $resolvedLegacy = [System.IO.Path]::GetFullPath($LegacySkill)
    $expectedSuffix = [System.IO.Path]::Combine('.agents', 'skills', 'design-taste-frontend')
    if (-not $resolvedLegacy.EndsWith($expectedSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove unexpected path: $resolvedLegacy"
    }
    if ($legacyItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        if ($PSCmdlet.ShouldProcess($LegacySkill, 'Unlink legacy skill junction')) {
            [System.IO.Directory]::Delete($LegacySkill, $false)
        }
    } elseif ($legacyItem.PSIsContainer) {
        if ($PSCmdlet.ShouldProcess($LegacySkill, 'Delete legacy design-taste-frontend skill directory')) {
            [System.IO.Directory]::Delete($LegacySkill, $true)
        }
    }
}

function Test-PreFlight {
    if (-not (Get-Command -Name 'agy' -ErrorAction SilentlyContinue)) {
        throw 'Antigravity CLI (agy) was not found on PATH.'
    }
    if ($Uninstall) { return }

    $licensePath = Join-Path $RepoRoot 'LICENSE'
    if (-not (Test-Path -LiteralPath $licensePath -PathType Leaf)) {
        throw "Missing root LICENSE at $licensePath"
    }
    $licenseText = [System.IO.File]::ReadAllText($licensePath, [System.Text.UTF8Encoding]::new($false))
    if ($licenseText -notmatch 'Leonxlnx') {
        throw 'Root LICENSE does not contain expected Leonxlnx attribution.'
    }

    $skillMdPath = Join-Path $RepoRoot (Join-Path 'skills' (Join-Path 'taste-skill' 'SKILL.md'))
    if (-not (Test-Path -LiteralPath $skillMdPath -PathType Leaf)) {
        throw "Missing SKILL.md at $skillMdPath"
    }
    $rawBytes = [System.IO.File]::ReadAllBytes($skillMdPath)
    if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
        throw 'skills/taste-skill/SKILL.md must be UTF-8 without BOM.'
    }
    $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
    $skillText = $utf8Strict.GetString($rawBytes)
    if ($skillText -notmatch '(?s)^---\r?\n.*?\r?\n---\r?\n(.*)$') {
        throw 'skills/taste-skill/SKILL.md is missing valid YAML frontmatter.'
    }
    $bodyBytes = [System.Text.Encoding]::UTF8.GetByteCount($Matches[1])
    if ($bodyBytes -gt 24000) {
        throw "skills/taste-skill/SKILL.md body is $bodyBytes bytes (exceeds 24,000-byte limit)."
    }

    & agy plugin validate --strict $RepoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "agy plugin validate --strict failed with exit code $LASTEXITCODE"
    }
}

Test-PreFlight

$existing = Get-Item -LiteralPath $PluginDest -Force -ErrorAction SilentlyContinue
$isJunction = $existing -and (($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)

if ($Uninstall) {
    if ($isJunction) {
        if ($PSCmdlet.ShouldProcess($PluginDest, 'Remove plugin NTFS junction')) {
            [System.IO.Directory]::Delete($PluginDest, $false)
        }
    } elseif ($existing) {
        if ($PSCmdlet.ShouldProcess($PluginName, 'Uninstall Antigravity plugin')) {
            & agy plugin uninstall $PluginName
            if ($LASTEXITCODE -ne 0) {
                throw "agy plugin uninstall $PluginName failed with exit code $LASTEXITCODE"
            }
        }
    }
    Remove-LegacySkill
    Write-Output "Uninstalled $PluginName."
    return
}

Remove-LegacySkill

if ($isJunction) {
    if ($PSCmdlet.ShouldProcess($PluginDest, 'Remove existing plugin NTFS junction before install')) {
        [System.IO.Directory]::Delete($PluginDest, $false)
        $existing = $null
        $isJunction = $false
    }
}

if (-not (Test-Path -LiteralPath $PluginsDir -PathType Container)) {
    if ($PSCmdlet.ShouldProcess($PluginsDir, 'Create Antigravity plugins directory')) {
        New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null
    }
}

$resolvedDest = [System.IO.Path]::GetFullPath($PluginDest)
$expectedSuffix = [System.IO.Path]::Combine('.gemini', 'config', 'plugins', $PluginName)
if (-not $resolvedDest.EndsWith($expectedSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to mirror into unexpected destination: $resolvedDest"
}

$actionDesc = if ($Sync) { "Sync repository to $PluginDest via robocopy" } else { "Install Antigravity plugin $PluginName" }
if ($PSCmdlet.ShouldProcess($PluginDest, $actionDesc)) {
    $roboOut = & robocopy "$RepoRoot" "$PluginDest" /mir /xd .git node_modules .gemini .github tests examples .taste-skill /xf .gitignore *.tmp *.log package.json package-lock.json
    if ($LASTEXITCODE -ge 8) {
        Write-Error ($roboOut | Out-String)
        throw "robocopy failed with exit code $LASTEXITCODE"
    }

    $pruneDirs = @('.github', 'tests', 'examples', '.taste-skill')
    foreach ($dirName in $pruneDirs) {
        $targetDir = Join-Path $PluginDest $dirName
        if (Test-Path -LiteralPath $targetDir -PathType Container) {
            [System.IO.Directory]::Delete($targetDir, $true)
        }
    }
    $pruneFiles = @('.gitignore', 'package.json', 'package-lock.json')
    foreach ($fileName in $pruneFiles) {
        $targetFile = Join-Path $PluginDest $fileName
        if (Test-Path -LiteralPath $targetFile -PathType Leaf) {
            [System.IO.File]::Delete($targetFile)
        }
    }
}

if (-not $WhatIfPreference) {
    $destItem = Get-Item -LiteralPath $PluginDest -Force -ErrorAction SilentlyContinue
    if (-not $destItem) {
        throw "Plugin destination '$PluginDest' does not exist after installation."
    }
    if (-not $destItem.PSIsContainer) {
        throw "Plugin destination '$PluginDest' is not a directory container."
    }
    if (($destItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Plugin destination '$PluginDest' must be a physical directory, not an NTFS junction or symlink."
    }

    $listRaw = & agy plugin list --json
    if ($LASTEXITCODE -ne 0) {
        throw "agy plugin list --json failed with exit code $LASTEXITCODE"
    }
    $parsed = ($listRaw | Out-String) | ConvertFrom-Json
    $plugins = [object[]]@()
    if ($null -ne $parsed) {
        $plugins = @($parsed)
    }
    $entry = $plugins | Where-Object {
        $null -ne $_ -and $null -ne $_.PSObject.Properties['name'] -and $_.name -eq $PluginName
    } | Select-Object -First 1
    if (-not $entry) {
        throw "Plugin '$PluginName' was not found in 'agy plugin list --json' after installation."
    }
    $enabledProp = $entry.PSObject.Properties['enabled']
    if (-not $enabledProp -or $enabledProp.Value -ne $true) {
        throw "Plugin '$PluginName' is installed but not enabled."
    }
    $skillsProp = $entry.PSObject.Properties['skills']
    $skills = [object[]]@()
    if ($skillsProp -and $null -ne $skillsProp.Value) {
        $skills = @($skillsProp.Value)
    }
    if (-not ($skills -contains 'taste-skill')) {
        throw "Plugin '$PluginName' does not expose skill 'taste-skill' (found: $($skills -join ', '))."
    }
    $pathProp = $entry.PSObject.Properties['path']
    $entryPath = if ($pathProp) { $pathProp.Value } else { '' }

    if ($env:ANTIGRAVITY_LS_ADDRESS) {
        $lsAddress = $env:ANTIGRAVITY_LS_ADDRESS
        $rpcUrl = "http://$lsAddress/exa.language_server_pb.LanguageServerService/GetAllPlugins"
        $headers = @{ 'Content-Type' = 'application/json' }
        if ($env:ANTIGRAVITY_CSRF_TOKEN) {
            $headers['x-codeium-csrf-token'] = $env:ANTIGRAVITY_CSRF_TOKEN
        }
        $timeout = [System.Diagnostics.Stopwatch]::StartNew()
        $registered = $false
        $lastError = 'none'
        while ($timeout.ElapsedMilliseconds -lt 10000) {
            try {
                $rpcResponse = Invoke-RestMethod -Uri $rpcUrl -Method Post -Body '{}' -Headers $headers -TimeoutSec 3 -ErrorAction Stop
                $lsPlugins = @($rpcResponse.plugins)
                if ($lsPlugins | Where-Object { $_ -and $_.name -eq $PluginName }) {
                    $registered = $true
                    break
                }
            } catch {
                $lastError = $_.Exception.Message
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $registered) {
            throw "Plugin '$PluginName' did not register with Language Server at $lsAddress within 10 seconds (Last error: $lastError)."
        }
    }

    Write-Output "Installed and verified '$PluginName' (enabled=$($enabledProp.Value), path=$entryPath)."
}
