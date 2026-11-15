// Prüft den Umzug von JellyTV zu Cherryfin in einem Testordner, niemals im echten %APPDATA%.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const project = process.argv[2];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};
const exe = process.env.TEST_EXE || path.join(project, 'node_modules/electron/dist/electron.exe');
const launch = (appData) => electron.launch({ executablePath: exe, args: process.env.TEST_EXE ? [] : [project], cwd: project, env: { ...process.env, CHERRYFIN_APPDATA: appData } });

// Fall 1: Nur der alte Ordner ist da.
const base = mkdtempSync(path.join(os.tmpdir(), 'cherry-mig-'));
mkdirSync(path.join(base, 'JellyTV'));
writeFileSync(path.join(base, 'JellyTV', 'marker.txt'), 'alt');
let app = await launch(base);
let page = await app.firstWindow();
await page.waitForSelector('.connect-panel');
check('Alter Ordner wurde übernommen', readFileSync(path.join(base, 'Cherryfin', 'marker.txt'), 'utf8') === 'alt');
check('Alter Ordner ist weg', !existsSync(path.join(base, 'JellyTV')));
check('Fenstertitel', (await page.title()) === 'Cherryfin', await page.title());
check('App-Name', (await app.evaluate(({ app: a }) => a.getName())) === 'Cherryfin');
check('Begrüßung mit Namen', (await page.textContent('.connect-panel h1')) === 'Cherryfin');
const logo = await page.evaluate(() => {
  const img = document.querySelector('.connect-logo');
  return img ? { w: img.naturalWidth, shown: img.getBoundingClientRect().width } : null;
});
check('Logo geladen und sichtbar', logo && logo.w > 0 && logo.shown > 50, JSON.stringify(logo));
await app.close();

// Fall 2: Beide Ordner sind da. Nichts wird überschrieben.
const both = mkdtempSync(path.join(os.tmpdir(), 'cherry-mig-'));
mkdirSync(path.join(both, 'JellyTV'));
mkdirSync(path.join(both, 'Cherryfin'));
writeFileSync(path.join(both, 'JellyTV', 'marker.txt'), 'alt');
writeFileSync(path.join(both, 'Cherryfin', 'marker.txt'), 'neu');
app = await launch(both);
page = await app.firstWindow();
await page.waitForSelector('.connect-panel');
check('Neuer Ordner bleibt unverändert', readFileSync(path.join(both, 'Cherryfin', 'marker.txt'), 'utf8') === 'neu');
check('Alter Ordner bleibt liegen', existsSync(path.join(both, 'JellyTV', 'marker.txt')));
await app.close();

rmSync(base, { recursive: true, force: true });
rmSync(both, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} bestanden`);
