// Starts the test server and runs the TV test in one Electron version.
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startMockServer, TEST_PASSWORD, TEST_USER } from '../e2e/mock-server.mjs';

const [project, electronExe, label] = process.argv.slice(2);
const here = import.meta.dirname;
const shots = path.join(here, 'shots');
mkdirSync(shots, { recursive: true });
const e2e = path.join(here, '..', 'e2e');
const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir: path.join(e2e, 'hls'), mkvFile: path.join(e2e, 'media/test.mkv') });

await new Promise((resolve) => {
  const child = spawn(electronExe, [path.join(here, 'main.cjs')], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      TV_BUILD: path.join(project, 'dist-webos'),
      TV_SHOTS: shots,
      TV_LABEL: label,
      TV_PORT: String(mock.port),
      TV_USER: TEST_USER,
      TV_PASS: TEST_PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const timer = setTimeout(() => { console.log('FAIL Zeitlimit des Gesamttests'); child.kill(); }, 180000);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.on('exit', () => { clearTimeout(timer); resolve(); });
});
const stopped = mock.state.sessions.filter((s) => s.route === '/Sessions/Playing/Stopped' && s.PositionTicks > 0);
console.log(`${stopped.length >= 2 ? 'OK  ' : 'FAIL'} Server learned about the end of playback -> ${stopped.length} reports`);
mock.close();
void spawnSync;
