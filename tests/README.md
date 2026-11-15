# Tests

Die Unit-Tests laufen mit `npm test` im Hauptordner.

Die Fenstertests starten die echte Electron-App gegen einen kleinen Jellyfin-Testserver (`e2e/mock-server.mjs`). Vorher einmal `npm run build` und in `tests/e2e` `npm install`.

| Skript | Prüft |
| --- | --- |
| `e2e/run.mjs` | Grundbedienung, Demo, Fokus |
| `e2e/run2.mjs` | A–Z-Übersicht mit über 5000 Titeln, Einstellungen |
| `e2e/run3.mjs` | Verbindungsausfälle, eingebauter Player, HLS |
| `e2e/run4.mjs` | mpv im echten Fensteraufbau |
| `e2e/run5.mjs` | Einstellungen aus Fladder |
| `e2e/matrix.mjs` | mpv mit echtem Audiogerät, jeweils mit kaltem Gerät |
| `e2e/migrate.mjs` | Übernahme älterer Einstellungen beim ersten Start |
| `e2e/builtin-cold.mjs` | eingebauter Player mit kaltem Audiogerät |
| `tv/run.mjs` | webOS-Build in Electron 4 (Chromium 69) und 8 (Chromium 80) |

Aufruf, zum Beispiel:

```bash
node tests/e2e/run3.mjs . tests/e2e/hls tests/e2e/media/test.mkv
```

Die Testmedien liegen nicht im Repository: `tests/e2e/hls/` braucht eine HLS-Wiedergabeliste (`index.m3u8` mit Segmenten), `tests/e2e/media/test.mkv` ein MKV mit H.264 und vier Tonspuren (AC3, E-AC3, TrueHD, DTS). `matrix.mjs` und `builtin-cold.mjs` nutzen das echte Audiogerät des Rechners.
