#!/usr/bin/env node
// Validate every skill's SKILL.md frontmatter (strict YAML, UTF-8 without BOM, body <= 24,000 bytes)
// and the root Antigravity plugin.json manifest before packaging or publishing.
//
//   npm install --no-save --no-package-lock yaml@2.6.1   (once; CI does this)
//   node tests/frontmatter.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let YAML;
try { YAML = await import('yaml'); } catch {
  console.error('This check needs the "yaml" package: npm install --no-save --no-package-lock yaml@2.6.1');
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, 'skills');
const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const parse = (text, where) => {
  const doc = YAML.parseDocument(text, { strict: true, uniqueKeys: true, prettyErrors: true });
  for (const e of [...doc.errors, ...doc.warnings]) fail(where, `YAML ${e.name}: ${e.message.split('\n')[0]}`);
  return doc.errors.length ? null : doc.toJS();
};

const names = new Map();
for (const dir of readdirSync(SKILLS)) {
  const file = join(SKILLS, dir, 'SKILL.md');
  if (!statSync(join(SKILLS, dir)).isDirectory() || !existsSync(file)) continue;
  const where = `skills/${dir}/SKILL.md`;
  const raw = readFileSync(file);
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    fail(where, 'must not have a UTF-8 BOM');
    continue;
  }
  let src;
  try {
    src = utf8Fatal.decode(raw);
  } catch (e) {
    fail(where, `invalid UTF-8: ${e.message}`);
    continue;
  }
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { fail(where, 'no frontmatter block (--- ... ---) at the top'); continue; }
  const bodyBytes = Buffer.byteLength(src.slice(m[0].length), 'utf8');
  if (bodyBytes > 24000) fail(where, `body is ${bodyBytes} bytes; must be <= 24000 bytes`);
  const fm = parse(m[1], where);
  if (!fm) continue;
  if (typeof fm.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name) || fm.name.length > 64) fail(where, `name must be kebab-case, 64 characters at most (got ${JSON.stringify(fm.name)})`);
  if (typeof fm.description !== 'string' || !fm.description.trim()) fail(where, 'description must be a non-empty string');
  else if (fm.description.length > 1024) fail(where, `description is ${fm.description.length} characters; agents allow 1024 at most`);
  if ('disable-model-invocation' in fm && typeof fm['disable-model-invocation'] !== 'boolean') fail(where, 'disable-model-invocation must be true or false');
  if (fm.name) { if (names.has(fm.name)) fail(where, `name "${fm.name}" is also used by ${names.get(fm.name)}`); else names.set(fm.name, where); }
}
if (names.size === 0) fail('skills', 'no valid skills found under skills/');

// root Antigravity plugin.json: required, valid JSON, required metadata and local asset/skill paths
const manifestPath = join(ROOT, 'plugin.json');
if (!existsSync(manifestPath)) {
  fail('plugin.json', 'missing root plugin.json');
} else {
  let j;
  try {
    j = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail('plugin.json', 'invalid JSON: ' + e.message);
  }
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    if (typeof j.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(j.name) || j.name.length > 64) {
      fail('plugin.json', `name must be kebab-case, 64 characters at most (got ${JSON.stringify(j.name)})`);
    }
    if (typeof j.version !== 'string' || !j.version.trim()) fail('plugin.json', 'version must be a non-empty string');
    if (typeof j.description !== 'string' || !j.description.trim()) fail('plugin.json', 'description must be a non-empty string');
    if ('skills' in j) {
      if (!Array.isArray(j.skills) && typeof j.skills !== 'string') {
        fail('plugin.json', 'skills must be a path string or array of paths');
      } else {
        for (const s of [].concat(j.skills)) {
          if (typeof s !== 'string' || !s.trim() || !existsSync(join(ROOT, s))) {
            fail('plugin.json', `skills path does not exist: ${JSON.stringify(s)}`);
          }
        }
      }
    }
    if ('logo' in j) {
      if (typeof j.logo !== 'string' || !j.logo.trim()) {
        fail('plugin.json', 'logo must be a non-empty string');
      } else if (!/^https?:\/\//i.test(j.logo) && !existsSync(join(ROOT, j.logo))) {
        fail('plugin.json', `local logo does not exist: ${j.logo}`);
      }
    }
    if (!Array.isArray(j.suggestedPrompts) || j.suggestedPrompts.length > 3 || j.suggestedPrompts.some((p) => typeof p !== 'string' || !p.trim())) {
      fail('plugin.json', 'suggestedPrompts must be an array of at most 3 non-empty strings');
    }
  } else if (j !== undefined) {
    fail('plugin.json', 'manifest must be a JSON object');
  }
}

// the default skill's data files
const lib = join(SKILLS, 'taste-skill', 'library');
if (existsSync(lib)) for (const f of readdirSync(lib)) if (f.endsWith('.json')) { try { JSON.parse(readFileSync(join(lib, f), 'utf8')); } catch (e) { fail(`skills/taste-skill/library/${f}`, 'invalid JSON: ' + e.message); } }

if (errors.length) {
  console.error(`not ok - ${errors.length} problem(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`ok - ${names.size} skill(s) load: frontmatter parses, names are unique, root plugin.json is valid`);
