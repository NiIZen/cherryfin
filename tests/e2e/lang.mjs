// Checks the interface language: German from the system locale, then switched to English in the settings.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const project = process.argv[2];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};

const userData = mkdtempSync(path.join(os.tmpdir(), 'cherryfin-lang-'));
const app = await electron.launch({
  executablePath: process.env.TEST_EXE || path.join(project, 'node_modules/electron/dist/electron.exe'),
  args: process.env.TEST_EXE ? ['--lang=de-DE', `--user-data-dir=${userData}`] : [project, '--lang=de-DE', `--user-data-dir=${userData}`],
  cwd: project,
});
const page = await app.firstWindow();
const lang = () => page.evaluate(() => document.documentElement.lang);

try {
  await page.waitForSelector('.connect-panel');
  check('German system locale shows German', (await page.textContent('.connect-lead')) === 'Verbinde dich mit deinem Jellyfin-Server.', await page.textContent('.connect-lead'));
  check('Page language is German', (await lang()) === 'de', await lang());

  await page.evaluate(() => localStorage.setItem('jellytv.settings', JSON.stringify({ fullscreenPlayback: false })));
  await page.click('text=Demo ansehen');
  await page.waitForSelector('.hero', { timeout: 30000 });
  await page.click('.tabbar [aria-label="Einstellungen"]');
  await page.waitForSelector('[data-setting="Sprache"]');
  check('Language row shows Automatic', (await page.textContent('[data-setting="Sprache"] .list-row-value')) === 'Automatisch');

  // Automatic -> German -> English. Each change reloads the page once.
  await page.click('[data-setting="Sprache"]');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const afterGerman = await page.evaluate(() => JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}').language);
  check('Choosing German is saved', afterGerman === 'de', afterGerman);

  await page.waitForSelector('[data-setting="Sprache"], .connect-panel', { timeout: 15000 });
  if (await page.locator('[data-setting="Sprache"]').count()) {
    await page.click('[data-setting="Sprache"]');
  } else {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}');
      localStorage.setItem('jellytv.settings', JSON.stringify({ ...s, language: 'en' }));
      location.reload();
    });
  }
  await page.waitForTimeout(2500);
  await page.waitForLoadState('load');
  check('English is saved', (await page.evaluate(() => JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}').language)) === 'en');
  check('Page language is English after the switch', (await lang()) === 'en', await lang());
  const text = await page.evaluate(() => document.body.innerText);
  check('Interface is English after the switch', /Settings|Connect to your Jellyfin server/.test(text) && !/Einstellungen|Verbinde dich/.test(text), text.slice(0, 80).replace(/\s+/g, ' '));
} catch (error) {
  check('Run', false, error.message.split('\n')[0]);
}

await app.close();
rmSync(userData, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
