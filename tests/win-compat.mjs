#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'skills', 'taste-skill', 'scripts');

const makeTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test('win-util.mjs: isInside, readJson, killTree, findBrowser', async () => {
  const { isInside, readJson, killTree, findBrowser } = await import(
    pathToFileURL(path.join(SCRIPTS, 'win-util.mjs')).href
  );

  // readJson: strips UTF-8 BOM \uFEFF and falls back safely
  const dir = makeTempDir('taste-winutil-');
  try {
    const siteDir = path.join(dir, 'site');
    const siblingDir = path.join(dir, 'site-secret');
    assert.equal(isInside(siteDir, path.join(siblingDir, 'x.json')), false);
    assert.equal(isInside(siteDir, path.join(siteDir, 'index.html')), true);
    assert.equal(isInside(siteDir, path.join(siteDir, '..hidden.html')), true);
    assert.equal(isInside(siteDir, siteDir), false);
    assert.equal(isInside(siteDir, siteDir, true), true);

    const bomFile = path.join(dir, 'bom.json');
    fs.writeFileSync(bomFile, '\uFEFF{"ok":true,"n":42}\n', 'utf8');
    assert.deepEqual(readJson(bomFile, null), { ok: true, n: 42 });
    assert.deepEqual(readJson(path.join(dir, 'missing.json'), { empty: 1 }), { empty: 1 });

    // killTree: safe no-op on null, undefined pid, and already-exited proc
    assert.doesNotThrow(() => killTree(null));
    assert.doesNotThrow(() => killTree({ pid: undefined, exitCode: null }));
    assert.doesNotThrow(() => killTree({ pid: 999999, exitCode: 0 }));

    // findBrowser: CHROME_PATH takes precedence over CHROME
    const exe1 = path.join(dir, 'chrome-a.exe');
    const exe2 = path.join(dir, 'chrome-b.exe');
    fs.writeFileSync(exe1, '');
    fs.writeFileSync(exe2, '');
    const prevPath = process.env.CHROME_PATH;
    const prevChrome = process.env.CHROME;
    try {
      process.env.CHROME_PATH = exe1;
      process.env.CHROME = exe2;
      assert.equal(findBrowser(), exe1);

      delete process.env.CHROME_PATH;
      process.env.CHROME = exe2;
      assert.equal(findBrowser(), exe2);
    } finally {
      if (prevPath === undefined) delete process.env.CHROME_PATH;
      else process.env.CHROME_PATH = prevPath;
      if (prevChrome === undefined) delete process.env.CHROME;
      else process.env.CHROME = prevChrome;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('win-util.mjs (win32 paths)', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, async () => {
  const { isInside } = await import(
    pathToFileURL(path.join(SCRIPTS, 'win-util.mjs')).href
  );

  // isInside: sibling directory bypass, drive root, drive-letter case, ..hidden.html, allowSelf
  assert.equal(isInside('D:\\app\\site', 'D:\\app\\site-secret\\x.json'), false);
  assert.equal(isInside('D:\\app\\site', 'D:\\app\\site\\index.html'), true);
  assert.equal(isInside('D:\\', 'D:\\index.html'), true);
  assert.equal(isInside('D:\\', 'D:\\sub\\page.html'), true);
  assert.equal(isInside('D:\\', 'E:\\index.html'), false);
  assert.equal(isInside('d:\\app\\site', 'D:\\APP\\site\\index.html'), true);
  assert.equal(isInside('D:\\app\\site', 'D:\\app\\site\\..hidden.html'), true);
  assert.equal(isInside('D:\\app\\site', 'D:\\app\\site'), false);
  assert.equal(isInside('D:\\app\\site', 'D:\\app\\site', true), true);
});

test('effects.mjs (F-01, F-04): preserves sibling history keys and reads BOM JSON', () => {
  const dir = makeTempDir('taste-fx-');
  try {
    const histFile = path.join(dir, '.taste-skill', 'history.json');
    fs.mkdirSync(path.dirname(histFile), { recursive: true });
    const seedHist = {
      palettes: ['moss-sand'],
      types: ['inter-ibm'],
      moments: [{ id: 'word-highlight', at: '2026-01-01T00:00:00Z' }],
      photos: [{ trade: 'cafe', ids: ['123'] }],
    };
    fs.writeFileSync(histFile, '\uFEFF' + JSON.stringify(seedHist, null, 2), 'utf8');

    const res = spawnSync(
      process.execPath,
      [
        path.join(SCRIPTS, 'effects.mjs'),
        'pick',
        '--page', 'software',
        '--palette', 'light',
        '--slots', 'card,hero',
        '--seed', 'wincompat1',
        '--history', histFile,
        '--json',
      ],
      { encoding: 'utf8', cwd: dir }
    );
    assert.equal(res.status, 0, res.stderr);
    const updated = JSON.parse(fs.readFileSync(histFile, 'utf8'));
    assert.deepEqual(updated.palettes, seedHist.palettes);
    assert.deepEqual(updated.types, seedHist.types);
    assert.deepEqual(updated.moments, seedHist.moments);
    assert.deepEqual(updated.photos, seedHist.photos);
    assert.ok(Array.isArray(updated.picks) && updated.picks.length === 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('copy-lint.mjs (F-07): crossFile handles files sharing only a Windows drive root without ..\\..\\', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  const modUrl = new URL('../skills/taste-skill/scripts/copy-lint.mjs', import.meta.url).href;
  const script = `
    import { crossFile } from ${JSON.stringify(modUrl)};
    const out = crossFile([
      { file: 'D:\\\\foo\\\\a.html', headings: ['Precision tools for teams'] },
      { file: 'D:\\\\bar\\\\b.html', headings: ['Precision tools for teams'] },
    ]);
    console.log(JSON.stringify(out));
  `;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.heroes.length, 2);
  for (const h of out.heroes) {
    assert.equal(h.includes('..'), false, `unexpected .. escape in ${h}`);
  }
  assert.match(out.heroes[0], /^foo\/a\.html:/);
  assert.match(out.heroes[1], /^bar\/b\.html:/);
});

test('icons.mjs (F-12): --base normalizes backslashes to forward slashes', () => {
  const dir = makeTempDir('taste-icons-');
  try {
    const cacheDir = path.join(dir, 'cache');
    const siteDir = path.join(dir, 'site');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });
    const cacheFile = path.join(
      cacheDir,
      'cdn.jsdelivr.net_npm_@iconify-json_vscode-icons@1.2.30_icons.json'
    );
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        prefix: 'vscode-icons',
        width: 32,
        height: 32,
        icons: {
          'file-type-pdf2': {
            body: '<path d="M0 0h32v32H0z" fill="#e11"/>',
          },
        },
      }),
      'utf8'
    );

    const res = spawnSync(
      process.execPath,
      [
        path.join(SCRIPTS, 'icons.mjs'),
        'fetch',
        'file:pdf2',
        '--out', 'assets/icons',
        '--base', 'assets\\icons',
      ],
      {
        encoding: 'utf8',
        cwd: siteDir,
        env: { ...process.env, TASTE_SKILL_ICON_CACHE: cacheDir },
      }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /src="assets\/icons\/pdf2\.svg"/);
    assert.equal(res.stdout.includes('assets\\icons'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gate.mjs (F-10, F-13): manual CLI without --hook plumbing and forward-slash GATE command', () => {
  const src = fs.readFileSync(path.join(SCRIPTS, 'gate.mjs'), 'utf8');
  assert.equal(/\bMODES\b/.test(src), false);
  assert.equal(/\breadStdin\b/.test(src), false);
  assert.equal(/\bunarmedPage\b/.test(src), false);
  assert.equal(/['"]hook['"]/.test(src), false);

  const dir = makeTempDir('taste-gate-');
  try {
    const off = spawnSync(process.execPath, [path.join(SCRIPTS, 'gate.mjs')], {
      encoding: 'utf8',
      cwd: dir,
      input: '{"cwd":"C:/ignored"}',
      timeout: 5000,
    });
    assert.equal(off.status, 0, off.stderr);
    assert.match(off.stdout, /GATE: OFF/);
    assert.match(off.stdout, /node "[^"]*\/gate\.mjs" --start index\.html/);

    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><main><h1>Test</h1></main>', 'utf8');
    const start = spawnSync(process.execPath, [path.join(SCRIPTS, 'gate.mjs'), '--start', 'index.html'], {
      encoding: 'utf8',
      cwd: dir,
      timeout: 5000,
    });
    assert.equal(start.status, 0, start.stderr);
    assert.match(start.stdout, /node "[^"]*\/gate\.mjs"/);
    assert.equal(fs.existsSync(path.join(dir, '.taste-skill', 'build.json')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('start.mjs (F-15, --no-gate): uses \\uFEFF escape and skips build.json when --no-gate is set', () => {
  const buf = fs.readFileSync(path.join(SCRIPTS, 'start.mjs'));
  assert.equal(buf.includes(Buffer.from([0xef, 0xbb, 0xbf])), false, 'raw UTF-8 BOM bytes in start.mjs');
  const text = buf.toString('utf8');
  assert.match(text, /\\uFEFF/);

  const dir = makeTempDir('taste-start-');
  try {
    const histFile = path.join(dir, 'history.json');
    const res = spawnSync(
      process.execPath,
      [path.join(SCRIPTS, 'start.mjs'), 'deal', '--page', 'software', '--no-gate', '--history', histFile],
      { encoding: 'utf8', cwd: dir }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /PALETTES/);
    assert.equal(fs.existsSync(path.join(dir, '.taste-skill', 'build.json')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Install-AntigravityPlugin.ps1: exists, has no BOM, and passes PowerShell AST parse', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  const ps1 = path.join(ROOT, 'Install-AntigravityPlugin.ps1');
  assert.equal(fs.existsSync(ps1), true, 'Install-AntigravityPlugin.ps1 missing');
  const raw = fs.readFileSync(ps1);
  assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false, 'PS1 should not have UTF-8 BOM');

  const check = `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${ps1.replace(/'/g, "''")}', [ref]$null, [ref]$e); if ($e.Count -gt 0) { $e | ForEach-Object { Write-Error $_.Message }; exit 1 }`;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', check], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('Install-AntigravityPlugin.ps1: parses multi-line agy plugin list --json under PS 5.1 StrictMode and prunes legacy skill', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  const ps1 = path.join(ROOT, 'Install-AntigravityPlugin.ps1');
  const dir = makeTempDir('taste-ps1-');
  try {
    const binDir = path.join(dir, 'bin');
    const tempHome = path.join(dir, 'home');
    const legacyDir = path.join(tempHome, '.agents', 'skills', 'design-taste-frontend');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'SKILL.md'), 'legacy', 'utf8');

    const jsonPath = path.join(dir, 'plugins.json');
    const agyCmd = path.join(binDir, 'agy.cmd');
    fs.writeFileSync(
      agyCmd,
      [
        '@echo off',
        'if "%1"=="plugin" if "%2"=="validate" exit /b 0',
        'if "%1"=="plugin" if "%2"=="install" exit /b 0',
        `if "%1"=="plugin" if "%2"=="list" type "${jsonPath}" & exit /b 0`,
        'exit /b 1',
        '',
      ].join('\r\n'),
      'utf8'
    );

    const parsedHome = path.parse(tempHome);
    const env = {
      ...process.env,
      PATH: `${binDir};${process.env.PATH || ''}`,
      HOME: tempHome,
      USERPROFILE: tempHome,
      HOMEDRIVE: parsedHome.root.slice(0, 2),
      HOMEPATH: tempHome.slice(2),
    };

    const runInstaller = (payload) => {
      fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
      return spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
        { encoding: 'utf8', env }
      );
    };

    // Multi-line JSON array with an entry missing `skills` (rtk) alongside taste-skill
    const multi = runInstaller([
      { name: 'rtk', enabled: true, version: '1.0.0', rules: ['AGENTS.md'] },
      {
        name: 'taste-skill',
        enabled: true,
        version: '2.5.1',
        path: path.join(tempHome, '.gemini', 'config', 'plugins', 'taste-skill'),
        skills: ['taste-skill'],
      },
    ]);
    assert.equal(multi.status, 0, multi.stderr || multi.stdout);
    assert.match(multi.stdout, /Installed and verified 'taste-skill'/);
    assert.equal(fs.existsSync(legacyDir), false, 'legacy design-taste-frontend should be removed');

    // Single-element JSON array (PS 5.1 array unwrapping edge case)
    const single = runInstaller([
      {
        name: 'taste-skill',
        enabled: true,
        path: path.join(tempHome, '.gemini', 'config', 'plugins', 'taste-skill'),
        skills: ['taste-skill'],
      },
    ]);
    assert.equal(single.status, 0, single.stderr || single.stdout);

    // Verification failures must exit non-zero without PropertyNotFoundStrict
    const missingSkills = runInstaller([{ name: 'taste-skill', enabled: true }]);
    assert.notEqual(missingSkills.status, 0);
    assert.equal(/PropertyNotFoundStrict/.test(missingSkills.stderr), false, missingSkills.stderr);
    assert.match(missingSkills.stderr, /does not expose skill 'taste-skill'/);

    const emptyList = runInstaller([]);
    assert.notEqual(emptyList.status, 0);
    assert.equal(/PropertyNotFoundStrict/.test(emptyList.stderr), false, emptyList.stderr);
    assert.match(emptyList.stderr, /was not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
