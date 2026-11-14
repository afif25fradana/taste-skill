import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

export function isInside(parent, child, allowSelf = false) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  if (!rel) return !!allowSelf;
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

export function findBrowser() {
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME,
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    home && path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

export function killTree(proc) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try { proc.kill('SIGKILL'); } catch {}
    }
  }
}

export function slash(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/') : p;
}

