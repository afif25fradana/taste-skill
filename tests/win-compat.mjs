#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
    delete env.ANTIGRAVITY_LS_ADDRESS;
    delete env.ANTIGRAVITY_CSRF_TOKEN;

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

test('Install-AntigravityPlugin.ps1: deprecates -Link, copies physical directory, supports -Sync and verifies Connect RPC', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, async () => {
  const ps1 = path.join(ROOT, 'Install-AntigravityPlugin.ps1');
  const dir = makeTempDir('taste-ps1-phase3-');
  try {
    const binDir = path.join(dir, 'bin');
    const tempHome = path.join(dir, 'home');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(tempHome, { recursive: true });

    const jsonPath = path.join(dir, 'plugins.json');
    const validPluginList = [
      {
        name: 'taste-skill',
        enabled: true,
        version: '2.5.1',
        path: path.join(tempHome, '.gemini', 'config', 'plugins', 'taste-skill'),
        skills: ['taste-skill'],
      },
    ];
    fs.writeFileSync(jsonPath, JSON.stringify(validPluginList, null, 2), 'utf8');

    const agyCmd = path.join(binDir, 'agy.cmd');
    fs.writeFileSync(
      agyCmd,
      [
        '@echo off',
        'if "%1"=="plugin" if "%2"=="validate" exit /b 0',
        `if "%1"=="plugin" if "%2"=="list" type "${jsonPath}" & exit /b 0`,
        'exit /b 1',
        '',
      ].join('\r\n'),
      'utf8'
    );

    const parsedHome = path.parse(tempHome);
    const baseEnv = {
      ...process.env,
      PATH: `${binDir};${process.env.PATH || ''}`,
      HOME: tempHome,
      USERPROFILE: tempHome,
      HOMEDRIVE: parsedHome.root.slice(0, 2),
      HOMEPATH: tempHome.slice(2),
    };
    delete baseEnv.ANTIGRAVITY_LS_ADDRESS;
    delete baseEnv.ANTIGRAVITY_CSRF_TOKEN;

    const run = (args = [], extraEnv = {}) =>
      new Promise((resolve) => {
        const proc = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
          { env: { ...baseEnv, ...extraEnv } }
        );
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (status) => resolve({ status, stdout, stderr }));
      });

    // 1. -Link must throw terminating deprecation error mentioning isGlobalPluginDir
    const linkRes = await run(['-Link']);
    assert.notEqual(linkRes.status, 0, 'installer with -Link should exit non-zero');
    assert.match(linkRes.stderr, /is deprecated/i, '-Link must explain deprecation');
    assert.match(linkRes.stderr, /isGlobalPluginDir/i, '-Link must cite isGlobalPluginDir confinement');

    // 2. Default installation must perform physical copy and remove existing junction
    const pluginDest = path.join(tempHome, '.gemini', 'config', 'plugins', 'taste-skill');
    fs.mkdirSync(path.dirname(pluginDest), { recursive: true });
    const dummyTarget = path.join(dir, 'dummy-target');
    fs.mkdirSync(dummyTarget, { recursive: true });
    spawnSync('cmd.exe', ['/c', 'mklink', '/J', pluginDest, dummyTarget], { encoding: 'utf8' });

    const installRes = await run(['-Force']);
    assert.equal(installRes.status, 0, installRes.stderr || installRes.stdout);
    assert.match(installRes.stdout, /Installed and verified 'taste-skill'/);
    assert.equal(fs.existsSync(path.join(pluginDest, 'plugin.json')), true, 'physical plugin.json must exist');
    assert.equal(fs.existsSync(path.join(pluginDest, 'skills', 'taste-skill', 'SKILL.md')), true, 'physical SKILL.md must exist');

    const checkReparse = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$item = Get-Item -LiteralPath '${pluginDest.replace(/'/g, "''")}'; if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 } else { exit 0 }`,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(checkReparse.status, 0, 'pluginDest must be a physical directory, not ReparsePoint');

    const nonRuntimeDirs = ['.github', 'tests', 'examples', '.taste-skill'];
    for (const d of nonRuntimeDirs) {
      assert.equal(
        fs.existsSync(path.join(pluginDest, d)),
        false,
        `non-runtime folder '${d}' must be excluded from plugin destination`
      );
    }
    const nonRuntimeFiles = ['.gitignore', 'package.json', 'package-lock.json'];
    for (const f of nonRuntimeFiles) {
      assert.equal(
        fs.existsSync(path.join(pluginDest, f)),
        false,
        `non-runtime file '${f}' must be excluded from plugin destination`
      );
    }

    // Seed non-runtime folders in pluginDest to verify explicit pruning
    const staleTestDir = path.join(pluginDest, 'tests');
    fs.mkdirSync(staleTestDir, { recursive: true });
    fs.writeFileSync(path.join(staleTestDir, 'stale.txt'), 'stale', 'utf8');

    // 3. -Sync switch must succeed and prune stale non-runtime directories
    const syncRes = await run(['-Sync']);
    assert.equal(syncRes.status, 0, syncRes.stderr || syncRes.stdout);
    assert.equal(
      fs.existsSync(staleTestDir),
      false,
      'stale non-runtime folder should be explicitly pruned'
    );

    // 4. Connect RPC verification: test passing when LS returns taste-skill
    let rpcResponsePayload = { plugins: [{ name: 'taste-skill' }] };
    const mockLsServer = http.createServer((req, res) => {
      req.resume();
      if (req.method === 'POST' && req.url === '/exa.language_server_pb.LanguageServerService/GetAllPlugins') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rpcResponsePayload));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => mockLsServer.listen(0, '127.0.0.1', resolve));
    const port = mockLsServer.address().port;
    try {
      const lsEnv = { ANTIGRAVITY_LS_ADDRESS: `127.0.0.1:${port}` };
      const rpcPassRes = await run(['-Force'], lsEnv);
      assert.equal(rpcPassRes.status, 0, rpcPassRes.stderr || rpcPassRes.stdout);

      // Connect RPC verification: test failing when LS omits taste-skill
      rpcResponsePayload = { plugins: [{ name: 'chrome-devtools-plugin' }] };
      const rpcFailRes = await run(['-Force'], lsEnv);
      assert.notEqual(rpcFailRes.status, 0, 'installer must fail when Connect RPC omits taste-skill');
      assert.match(rpcFailRes.stderr, /did not register|not registered/i);
    } finally {
      await new Promise((resolve) => mockLsServer.close(resolve));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('check.mjs and win-util.mjs (Wave 1): check.mjs cleanly imports win-util.mjs and win-util exports slash', async () => {
  const checkSrc = fs.readFileSync(path.join(ROOT, 'skills', 'taste-skill', 'assets', 'layout', 'check.mjs'), 'utf8');
  assert.match(
    checkSrc,
    /import\s*\{[^}]*isInside[^}]*findBrowser[^}]*killTree[^}]*\}\s*from\s*['"]\.\.\/\.\.\/scripts\/win-util\.mjs['"]/,
    'check.mjs must import isInside, findBrowser, killTree from win-util.mjs'
  );
  assert.equal(/const\s+isInside\s*=/.test(checkSrc), false, 'check.mjs must not duplicate isInside');
  assert.equal(/const\s+localChrome\s*=/.test(checkSrc), false, 'check.mjs must not duplicate localChrome');
  assert.equal(/const\s+kill\s*=/.test(checkSrc), false, 'check.mjs must not duplicate kill');

  const winUtil = await import(pathToFileURL(path.join(SCRIPTS, 'win-util.mjs')).href);
  assert.equal(typeof winUtil.slash, 'function', 'win-util.mjs must export slash');
  assert.equal(typeof winUtil.isInside, 'function');
  assert.equal(typeof winUtil.readJson, 'function');
  assert.equal(typeof winUtil.killTree, 'function');
  assert.equal(typeof winUtil.findBrowser, 'function');
  assert.equal(winUtil.slash('path\\to\\file'), 'path/to/file');
  assert.equal(winUtil.slash('path/to/file'), 'path/to/file');
});

test('perf.mjs (Wave 1): safe profile cleanup preserves alive runs and purges stale profiles', async () => {
  const perfSrc = fs.readFileSync(path.join(SCRIPTS, 'perf.mjs'), 'utf8');
  assert.equal(
    /alive\s*=\s*\(?pid\)?\s*=>\s*\{\s*try\s*\{\s*process\.kill\(pid,\s*0\);?\s*return true;?\s*\}\s*catch\s*\(e\)\s*\{\s*return\s*e\.code\s*===\s*['"]EPERM['"];?\s*\}/.test(perfSrc),
    true,
    'perf.mjs must define alive(pid) treating EPERM as alive'
  );
  assert.equal(
    perfSrc.includes('taste-skill-owner.json'),
    true,
    'perf.mjs must write and inspect taste-skill-owner.json'
  );
  assert.match(perfSrc, /fs\.rmSync\(portFile/, 'perf.mjs must guard against stale DevToolsActivePort');

  const { sweepProfiles, alive } = await import(pathToFileURL(path.join(SCRIPTS, 'perf.mjs')).href);
  assert.equal(typeof sweepProfiles, 'function', 'perf.mjs must export sweepProfiles');
  assert.equal(typeof alive, 'function', 'perf.mjs must export alive');

  const dir = makeTempDir('taste-perf-sweep-');
  try {
    const alivePid = process.pid;
    const deadPid = 999999;
    const currentPid = 12345;

    // 1. Alive PID folder without owner file -> must NOT be removed
    const aliveDir = path.join(dir, `run-${alivePid}`);
    fs.mkdirSync(aliveDir, { recursive: true });

    // 2. Dead PID folder without owner file -> MUST be removed
    const deadDir = path.join(dir, `run-${deadPid}`);
    fs.mkdirSync(deadDir, { recursive: true });

    // 3. Stale folder matching current process PID -> MUST be removed
    const currentDir = path.join(dir, `run-${currentPid}`);
    fs.mkdirSync(currentDir, { recursive: true });

    // 4. Alive folder with valid taste-skill-owner.json on same machine -> must NOT be removed
    const aliveOwnerDir = path.join(dir, 'run-888888');
    fs.mkdirSync(aliveOwnerDir, { recursive: true });
    fs.writeFileSync(
      path.join(aliveOwnerDir, 'taste-skill-owner.json'),
      JSON.stringify({ machine: os.hostname(), ownerPid: alivePid, time: Date.now() }),
      'utf8'
    );

    // 5. Dead folder with taste-skill-owner.json (dead ownerPid) -> MUST be removed
    const deadOwnerDir = path.join(dir, 'run-777777');
    fs.mkdirSync(deadOwnerDir, { recursive: true });
    fs.writeFileSync(
      path.join(deadOwnerDir, 'taste-skill-owner.json'),
      JSON.stringify({ machine: os.hostname(), ownerPid: deadPid, time: Date.now() }),
      'utf8'
    );

    // 6. Stale folder with taste-skill-owner.json (ownerPid matching currentPid) -> MUST be removed
    const currentOwnerDir = path.join(dir, 'run-666666');
    fs.mkdirSync(currentOwnerDir, { recursive: true });
    fs.writeFileSync(
      path.join(currentOwnerDir, 'taste-skill-owner.json'),
      JSON.stringify({ machine: os.hostname(), ownerPid: currentPid, time: Date.now() }),
      'utf8'
    );

    // 7. Non-matching directory should NOT be removed
    const customDir = path.join(dir, 'custom-folder');
    fs.mkdirSync(customDir, { recursive: true });

    sweepProfiles(dir, currentPid, os.hostname());

    assert.equal(fs.existsSync(aliveDir), true, 'alive PID run dir must NOT be removed');
    assert.equal(fs.existsSync(aliveOwnerDir), true, 'alive ownerPid run dir must NOT be removed');
    assert.equal(fs.existsSync(customDir), true, 'non-run dir must NOT be removed');

    assert.equal(fs.existsSync(deadDir), false, 'dead PID run dir must be removed');
    assert.equal(fs.existsSync(currentDir), false, 'recycled current PID run dir must be removed');
    assert.equal(fs.existsSync(deadOwnerDir), false, 'dead ownerPid run dir must be removed');
    assert.equal(fs.existsSync(currentOwnerDir), false, 'recycled ownerPid run dir must be removed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('photos.mjs (Wave 2, SEC-02 & SEC-03): SAFE_NAME, fileIn, okUrl, foundEntry security validations', async () => {
  const mod = await import(pathToFileURL(path.join(SCRIPTS, 'photos.mjs')).href);
  const { SAFE_NAME, fileIn, LINK_HOSTS, okUrl, foundEntry } = mod;

  assert.equal(typeof fileIn, 'function', 'photos.mjs must export fileIn');
  assert.equal(typeof okUrl, 'function', 'photos.mjs must export okUrl');
  assert.equal(typeof foundEntry, 'function', 'photos.mjs must export foundEntry');
  assert.ok(SAFE_NAME instanceof RegExp, 'photos.mjs must export SAFE_NAME RegExp');

  // SEC-02: SAFE_NAME & fileIn path traversal protection
  const baseDir = makeTempDir('taste-photos-sec-');
  try {
    assert.equal(SAFE_NAME.test('photo-f12345-1280.jpg'), true);
    assert.equal(SAFE_NAME.test('photo-326.webp'), true);
    assert.equal(SAFE_NAME.test('../hack.jpg'), false);
    assert.equal(SAFE_NAME.test('..\\hack.jpg'), false);
    assert.equal(SAFE_NAME.test('/etc/passwd'), false);
    assert.equal(SAFE_NAME.test('C:\\boot.ini'), false);
    assert.equal(SAFE_NAME.test('bad name.jpg'), false);
    assert.equal(SAFE_NAME.test('sub/dir/img.jpg'), false);
    assert.equal(SAFE_NAME.test(''), false);
    assert.equal(SAFE_NAME.test('.hidden'), false);

    assert.equal(fileIn(baseDir, 'photo-1.jpg'), path.resolve(baseDir, 'photo-1.jpg'));
    assert.throws(() => fileIn(baseDir, '../escape.jpg'), /refused the file name/);
    assert.throws(() => fileIn(baseDir, '..\\escape.jpg'), /refused the file name/);
    assert.throws(() => fileIn(baseDir, '/escape.jpg'), /refused the file name/);
    assert.throws(() => fileIn(baseDir, 'invalid name.jpg'), /refused the file name/);

    // SEC-02 & SEC-03: foundEntry rejects entries with 'files', invalid ID, bad URLs, untrusted hosts
    assert.equal(foundEntry(null), 'not an entry');
    assert.equal(foundEntry('string'), 'not an entry');
    assert.equal(foundEntry([]), 'not an entry');
    assert.equal(foundEntry({ id: 'f123', files: ['photo.jpg'] }), 'it lists files (only library frames have files)');
    assert.equal(foundEntry({ id: '123' }), 'its id is not an f and a number');
    assert.equal(foundEntry({ id: 'f123/../../hack' }), 'its id is not an f and a number');
    assert.equal(foundEntry({ id: 'f123;rm -rf' }), 'its id is not an f and a number');
    assert.equal(foundEntry({ id: 'f123', source: 'unsplash' }), 'its source is not commons');
    assert.equal(
      foundEntry({
        id: 'f123',
        source: 'commons',
        url: 'https://evil.com/fake.jpg',
      }),
      'its url is not a Commons file on upload.wikimedia.org'
    );
    assert.equal(
      foundEntry({
        id: 'f123',
        source: 'commons',
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg',
        page: 'javascript:alert(1)',
      }),
      'its page is not an http(s) link on commons.wikimedia.org'
    );

    // SEC-03: okUrl and link validation
    assert.equal(okUrl('https://commons.wikimedia.org/wiki/File:Test.jpg', LINK_HOSTS.commons.page), true);
    assert.equal(okUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg', ['upload.wikimedia.org'], true), true);
    assert.equal(okUrl('http://upload.wikimedia.org/test.jpg', ['upload.wikimedia.org'], true), false, 'httpsOnly rejects http');
    assert.equal(okUrl('javascript:alert(1)', LINK_HOSTS.commons.page), false);
    assert.equal(okUrl('data:text/html,<script>alert(1)</script>', LINK_HOSTS.commons.page), false);
    assert.equal(okUrl('https://evil.com/fake.jpg', ['upload.wikimedia.org']), false);
    assert.equal(okUrl('https://user:pass@upload.wikimedia.org/pic.jpg', ['upload.wikimedia.org']), false);
    assert.equal(okUrl('https://upload.wikimedia.org:8080/pic.jpg', ['upload.wikimedia.org']), false);
    assert.equal(okUrl('https://upload.wikimedia.org/test\nnewline', ['upload.wikimedia.org']), false);
    assert.equal(okUrl('https://upload.wikimedia.org/test"quote', ['upload.wikimedia.org']), false);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('photos.mjs (Wave 2, SEC-04): escH, creditLine, creditList, and goodCredits validation', async () => {
  const mod = await import(pathToFileURL(path.join(SCRIPTS, 'photos.mjs')).href);
  const { escH, creditLine, creditList, creditWhy, goodCredits } = mod;

  assert.equal(typeof escH, 'function', 'photos.mjs must export escH');
  assert.equal(typeof creditLine, 'function', 'photos.mjs must export creditLine');
  assert.equal(typeof creditList, 'function', 'photos.mjs must export creditList');
  assert.equal(typeof goodCredits, 'function', 'photos.mjs must export goodCredits');

  // escH escaping
  assert.equal(escH('<script>alert("x & y")</script>'), '&lt;script&gt;alert(&quot;x &amp; y&quot;)&lt;/script&gt;');

  // creditLine escapes creditSources and href
  const dummyList = [
    { source: '<img src=x onerror=alert(1)>', by: 'Artist & Co' },
  ];
  const lineHtml = creditLine(dummyList, 'credits.html?q="foo"&b=<bar>');
  assert.equal(lineHtml.includes('<img'), false, 'creditLine must escape creditSources');
  assert.equal(lineHtml.includes('&lt;img'), true);
  assert.equal(lineHtml.includes('&quot;foo&quot;&amp;b=&lt;bar&gt;'), true, 'creditLine must escape href');

  // creditList escapes photographer, page, and licenceUrl
  const listHtml = creditList([
    {
      source: 'Wikimedia Commons',
      id: 'f101',
      by: '<script>evil()</script>',
      page: 'https://commons.wikimedia.org/wiki/File:Test.jpg?x="1"&y=<2>',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/?a="b"',
    },
  ]);
  assert.equal(listHtml.includes('<script>'), false, 'creditList must escape by');
  assert.equal(listHtml.includes('&lt;script&gt;evil()&lt;/script&gt;'), true);
  assert.equal(listHtml.includes('&quot;1&quot;&amp;y=&lt;2&gt;'), true);

  // goodCredits & creditWhy filter unsafe sources and links
  assert.equal(creditWhy(null), 'not an entry');
  assert.equal(creditWhy({ id: 'c1', source: 'malicious' }), 'its source is not Wikimedia Commons or Unsplash');
  assert.equal(creditWhy({ id: 'c1', source: 'Unsplash', page: 'https://evil.com/photo' }), 'its page is not an http(s) link on unsplash.com');
  const filtered = goodCredits({
    photos: [
      { id: 'ok1', source: 'Unsplash', page: 'https://unsplash.com/photos/123' },
      { id: 'bad1', source: 'Unsplash', page: 'javascript:alert(1)' },
      { id: 'bad2', source: 'EvilSource', page: 'https://evil.com' },
    ],
  }, 'credits.json');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'ok1');
});

test('photos.mjs (Wave 2, SEC-05): TASTE_SKILL_RECENT normalization to absolute path', () => {
  const testRelPath = path.join('.', 'test-scratch-recent.json');
  const res = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        process.env.TASTE_SKILL_RECENT = ${JSON.stringify(testRelPath)};
        const { RECENT_FILE } = await import(${JSON.stringify(pathToFileURL(path.join(SCRIPTS, 'photos.mjs')).href)});
        if (RECENT_FILE !== ${JSON.stringify(path.resolve(testRelPath))}) {
          console.error('RECENT_FILE mismatch: ' + RECENT_FILE);
          process.exit(1);
        }
      `,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('photos.mjs (Wave 2, SEC-06): BOM stripping on HTML templates in creditsPage', async () => {
  const mod = await import(pathToFileURL(path.join(SCRIPTS, 'photos.mjs')).href);
  const { creditsPage } = mod;
  assert.equal(typeof creditsPage, 'function', 'photos.mjs must export creditsPage');

  const dir = makeTempDir('taste-photos-bom-');
  try {
    const shellFile = path.join(dir, 'privacy.html');
    // Write template with UTF-8 BOM
    fs.writeFileSync(
      shellFile,
      '\uFEFF<!doctype html><html><head><title>Original</title></head><body><main class="wrap"><p>Legal</p></main></body></html>',
      'utf8'
    );
    const outputHtml = creditsPage(
      dir,
      'credits.html',
      [{ id: '326', source: 'Unsplash', by: 'Photographer', page: 'https://unsplash.com/photos/326' }],
      'MyBrand'
    );
    assert.equal(outputHtml.startsWith('\uFEFF'), false, 'creditsPage must strip leading UTF-8 BOM');
    assert.match(outputHtml, /MyBrand: photograph credits/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('photos.mjs (Wave 2, Fetch Redirect): ALLOWED_DOWNLOAD_HOSTS and download redirect validation', async () => {
  const mod = await import(pathToFileURL(path.join(SCRIPTS, 'photos.mjs')).href);
  const { ALLOWED_DOWNLOAD_HOSTS, download } = mod;

  assert.ok(Array.isArray(ALLOWED_DOWNLOAD_HOSTS), 'photos.mjs must export ALLOWED_DOWNLOAD_HOSTS array');
  assert.ok(ALLOWED_DOWNLOAD_HOSTS.includes('upload.wikimedia.org'));
  assert.ok(ALLOWED_DOWNLOAD_HOSTS.includes('thumb.wikimedia.org'));
  assert.ok(ALLOWED_DOWNLOAD_HOSTS.includes('picsum.photos'));
  assert.ok(ALLOWED_DOWNLOAD_HOSTS.includes('fastly.picsum.photos'));
  assert.equal(typeof download, 'function', 'photos.mjs must export download');

  // Verify post-fetch redirected URL validation
  const origFetch = globalThis.fetch;
  try {
    // 1. Untrusted redirect host must throw
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      url: 'https://malicious.attacker.com/exploit.jpg',
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    });
    await assert.rejects(
      () => download('https://upload.wikimedia.org/wikipedia/commons/test.jpg'),
      /refused download from unexpected redirected host/
    );

    // 2. HTTP downgrade redirect must throw
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      url: 'http://upload.wikimedia.org/wikipedia/commons/test.jpg',
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    });
    await assert.rejects(
      () => download('https://upload.wikimedia.org/wikipedia/commons/test.jpg'),
      /refused download from unexpected redirected host/
    );

    // 3. Valid download host with JPEG magic bytes passes
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    });
    const buf = await download('https://upload.wikimedia.org/wikipedia/commons/test.jpg');
    assert.ok(buf instanceof Buffer);
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
  } finally {
    globalThis.fetch = origFetch;
  }
});
