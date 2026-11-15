// Baut aus dist-webos das IPK-Paket und das Manifest für den Homebrew Channel.
// Aufruf: node scripts/package-webos.mjs [--source https://github.com/name/repo] [--icon https://.../icon160.png]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const build = path.join(root, 'dist-webos');
for (const file of ['appinfo.json', 'icon80.png', 'icon130.png']) copyFileSync(path.join(root, 'webos', file), path.join(build, file));

const appinfo = JSON.parse(readFileSync(path.join(root, 'webos', 'appinfo.json'), 'utf8'));
const out = path.join(root, 'release', 'webos');
mkdirSync(out, { recursive: true });

const ares = path.join(root, 'node_modules', '@webos-tools', 'cli', 'bin', 'ares-package.js');
console.log(execFileSync(process.execPath, [ares, build, '--outdir', out], { encoding: 'utf8' }).trim());

const ipkName = `${appinfo.id}_${appinfo.version}_all.ipk`;
const ipk = path.join(out, ipkName);
const data = readFileSync(ipk);

// Größe und Prüfsumme gelten nur für genau dieses Paket: Jede Version braucht ein neues Manifest.
const manifest = {
  id: appinfo.id,
  version: appinfo.version,
  type: appinfo.type,
  title: appinfo.title,
  appDescription: appinfo.appDescription,
  iconUri: argument('icon') ?? 'icon160.png',
  sourceUrl: argument('source') ?? '',
  rootRequired: false,
  ipkUrl: ipkName,
  ipkHash: { sha256: createHash('sha256').update(data).digest('hex') },
  ipkSize: statSync(ipk).size,
};
writeFileSync(path.join(out, `${appinfo.id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(path.join(root, 'webos', 'icon160.png'), path.join(out, 'icon160.png'));
console.log(`Fertig: ${ipkName} (${(manifest.ipkSize / 1024 / 1024).toFixed(1)} MB), Prüfsumme ${manifest.ipkHash.sha256}`);
