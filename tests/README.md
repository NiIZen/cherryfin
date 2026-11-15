# Tests

Run the unit tests with `npm test` in the main folder. Among other things, `src/i18n.test.ts` checks that every interface text has a German translation and that no German text is left in the code outside `src/i18n/de.ts`.

The window tests start the real Electron app against a small Jellyfin test server (`e2e/mock-server.mjs`). They run with the English interface (`--lang=en-US`), independent of the system language. Run `npm run build` first, and `npm install` once in `tests/e2e`.

| Script | Checks |
| --- | --- |
| `e2e/run.mjs` | Basic controls, demo, focus |
| `e2e/run2.mjs` | A–Z overview with more than 5000 titles, settings |
| `e2e/run3.mjs` | Connection loss, built-in player, HLS |
| `e2e/run4.mjs` | mpv in the real window setup |
| `e2e/run5.mjs` | Settings inspired by Fladder |
| `e2e/lang.mjs` | German from the system language, then switching to English |
| `e2e/matrix.mjs` | mpv with the real audio device, each time with a cold device |
| `e2e/migrate.mjs` | Taking over settings from an older app folder on the first start |
| `e2e/builtin-cold.mjs` | Built-in player with a cold audio device |
| `tv/run.mjs` | webOS build in Electron 4 (Chromium 69) and 8 (Chromium 80) |

Example:

```bash
node tests/e2e/run3.mjs . tests/e2e/hls tests/e2e/media/test.mkv
```

The test media are not in the repository: `tests/e2e/hls/` needs an HLS playlist (`index.m3u8` with segments), and `tests/e2e/media/test.mkv` an MKV with H.264 and four audio tracks (AC3, E-AC3, TrueHD, DTS). `matrix.mjs` and `builtin-cold.mjs` use the computer's real audio device.
