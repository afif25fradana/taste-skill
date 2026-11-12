[CmdletBinding(SupportsShouldProcess = $true, PositionalBinding = $false)]
param(
    [switch]$Link,
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

if ($Link) {
    if ($isJunction) {
        if ($PSCmdlet.ShouldProcess($PluginDest, 'Remove existing plugin NTFS junction')) {
            [System.IO.Directory]::Delete($PluginDest, $false)
        }
    } elseif ($existing) {
        if ($PSCmdlet.ShouldProcess($PluginName, 'Uninstall existing plugin copy before linking')) {
            & agy plugin uninstall $PluginName
            if ($LASTEXITCODE -ne 0) {
                throw "agy plugin uninstall $PluginName failed with exit code $LASTEXITCODE"
            }
        }
        if (Get-Item -LiteralPath $PluginDest -Force -ErrorAction SilentlyContinue) {
            throw "Existing directory at $PluginDest could not be removed before creating junction."
        }
    }
    if (-not (Test-Path -LiteralPath $PluginsDir -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($PluginsDir, 'Create Antigravity plugins directory')) {
            New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null
        }
    }
    if ($PSCmdlet.ShouldProcess($PluginDest, "Create NTFS junction to $RepoRoot")) {
        New-Item -ItemType Junction -Path $PluginDest -Target $RepoRoot | Out-Null
    }
} else {
    if ($isJunction) {
        if ($PSCmdlet.ShouldProcess($PluginDest, 'Remove existing plugin NTFS junction before install')) {
            [System.IO.Directory]::Delete($PluginDest, $false)
        }
    }
    if ($PSCmdlet.ShouldProcess($RepoRoot, "Install Antigravity plugin $PluginName")) {
        & agy plugin install $RepoRoot
        if ($LASTEXITCODE -ne 0) {
            throw "agy plugin install failed with exit code $LASTEXITCODE"
        }
    }
}

if (-not $WhatIfPreference) {
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
    Write-Output "Installed and verified '$PluginName' (enabled=$($enabledProp.Value), path=$entryPath)."
}
