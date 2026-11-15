# Cherryfin

![Cherryfin](electron/icon.png)

Jellyfin-Client für Windows mit einer Oberfläche im Stil von tvOS und der Apple-TV-App.
Unabhängiges Projekt ohne Verbindung zu Apple oder dem Jellyfin-Projekt.

Bis Version 0.5 hieß die App JellyTV. Beim ersten Start übernimmt Cherryfin Anmeldung und Einstellungen aus dem alten Ordner `%APPDATA%\JellyTV`. Eine installierte JellyTV-Version bleibt bestehen und lässt sich in Windows unter „Apps“ entfernen. Das Icon liegt als SVG in `branding/cherryfin.svg`.

## Herunterladen

Fertige Pakete stehen unter [Releases](../../releases/latest):

| Datei | Für |
| --- | --- |
| `Cherryfin Setup <Version>.exe` | Windows, mit Installation |
| `Cherryfin-portable-<Version>.exe` | Windows, ohne Installation |
| `org.cherryfin.webos_<Version>_all.ipk` | LG-Fernseher mit webOS 5 oder neuer, über den Homebrew Channel oder den Developer Mode |

Die Windows-Pakete sind nicht signiert. Windows SmartScreen warnt deshalb beim ersten Start.

## Starten

`mpv.exe` liegt nicht im Repository, weil die Datei für Git zu groß ist. Vor dem ersten Start den Build [mpv-x86_64-20261105-git-3138fc8eea](https://github.com/zhongfly/mpv-winbuild/releases) von zhongfly/mpv-winbuild herunterladen und `mpv.exe` nach `vendor/mpv/` legen. Ohne mpv läuft die App mit dem eingebauten Player.

```bash
npm install
npm start
```

Beim ersten Start sucht die App im Netzwerk nach Jellyfin-Servern. Ohne Server lässt sich alles über **Demo ansehen** ausprobieren.

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm start` | Bauen und in Electron starten |
| `npm run dev` | Entwicklung mit Hot Reload in Electron |
| `npm run web` | Nur die Oberfläche im Browser, Demo unter `http://localhost:5173/?demo=1` |
| `npm test` | Unit-Tests |
| `npm run dist` | Installer und portable `.exe` in `release/<version>/` erstellen |

## Bedienung

| Eingabe | Tastatur | Gamepad |
| --- | --- | --- |
| Navigieren | Pfeiltasten | Steuerkreuz, linker Stick |
| Auswählen | Enter | A |
| Zurück | Esc, Rücktaste | B |
| Wiedergabe/Pause | Leertaste | Start |
| Im Player springen | Pfeil links/rechts (10 s) | Steuerkreuz links/rechts |
| Vollbild | F, F11 | |

Mit der Maus folgt der Fokus dem Zeiger, die Karten kippen mit. Der Zurück-Knopf oben links erscheint nur im Mausbetrieb.

## Übersicht und Anpassung

Jede Video-Bibliothek des Servers ist ein eigener Bereich in der Leiste oben. Gibt es keine Bibliothek für Dokumentationen, entsteht der Bereich aus den passenden Genres, falls vorhanden. Ein Bereich zeigt standardmäßig alle Titel von A bis Z, mit Abschnitten und einer A–Z-Leiste zum Springen.

Einstellbar ist fast alles, unter **Einstellungen** und über den Knopf **Ansicht** in jedem Bereich:

| Kategorie | Optionen |
| --- | --- |
| Darstellung | Akzentfarbe, Hintergrund, Größe der Oberfläche, Schrift, Ecken, Glaseffekt, Animationen, Sparmodus, Hintergrund der Detailseite, Kartengröße, Titel unter Karten, Fokus-Zoom, Neigen und Glanz, Fokusrahmen, Fortschrittsbalken, Haken bei Gesehenem, Spoiler-Schutz |
| Startseite | Titelbereich (wechselnd, feststehend, aus), Wechselzeit, Inhalt, Beschreibung, Kartenformat, Weiter ansehen (zusammen, getrennt, nur eines von beiden), Zeitraum für nächste Folgen, Reihen ein-/ausblenden und umsortieren |
| Bereiche | Ein-/ausblenden, umsortieren, Übersicht oder Reihen, Bibliotheken zusammenlegen |
| Mediathek | Standard für alle Bereiche: Raster oder Liste, Hoch- oder Querformat, Größe, Titel, Sortierung, Reihenfolge, Abschnitte, A–Z-Leiste, Titelbild, nur Ungesehenes |
| Wiedergabe | Qualität getrennt für Heimnetz und Internet, nächste Folge automatisch, Player im Vollbild, Sprunglängen, Tonsprache und Untertitelsprache merken, Inkognito, Bildschirmschoner, Bildanpassung, Hardware-Dekodierung, Puffer, Verhalten je Abschnitt (Intro, Rückblick, Werbung, Vorschau, Abspann), Tempo beim Halten der Maustaste, Doppelklick, Medientasten, Lautstärke beim Start und alles zum Ton |
| Untertitel | Größe, Fett, Farbe, Rand, Hintergrund, Abstand vom unteren Rand |
| Tastenkürzel | Eigene Tasten im Player für Ton aus, Lautstärke, Tempo, Untertitel, nächste Folge und Segment überspringen (nicht auf dem Fernseher) |

Anpassungen über den Knopf **Ansicht** gelten nur für den jeweiligen Bereich und haben Vorrang vor dem Standard. Alle Einstellungen liegen lokal auf diesem Rechner und werden nicht mit dem Server abgeglichen.

## Wiedergabe mit dem eingebauten Player

Die App schickt dem Server ein Geräteprofil. Der Server entscheidet damit:

- **Direct Play** für MP4, MOV und WebM mit Codecs, die Chromium beherrscht. HEVC und AV1 werden nur gemeldet, wenn das Gerät sie laut `canPlayType` abspielen kann.
- **HLS** für alles andere, etwa MKV: Wenn möglich wird nur umverpackt, sonst transkodiert.
- Schlägt Direct Play trotzdem fehl, wechselt der Player automatisch zu HLS.
- Andere Tonspuren laufen immer über HLS, weil Chromium die Spur im Direct Play nicht umschalten kann. Das kann den Server stärker belasten.
- Textuntertitel kommen als WebVTT, Bilduntertitel (PGS, DVD) brennt der Server ein.

Unterstützt werden außerdem Trickplay-Vorschauen, „Intro überspringen“ über Media Segments (ab Jellyfin 10.10) und automatisch die nächste Folge.

## Aufbau

```text
electron/        Hauptprozess, Preload, Server-Suche, verschlüsselte Anmeldedaten
src/api/         Jellyfin-Client, Geräteprofil, Demo-Daten
src/focus/       Fokus-Navigation für Tastatur, Maus und Gamepad
src/ui/          Karten, Reihen, Hero, Icons
src/screens/     Anmeldung, Startseite, Mediathek, Details, Suche, Player
src/styles.css   Designsystem
```

Das Zugriffstoken liegt über Electron `safeStorage` (Windows DPAPI) verschlüsselt im Benutzerprofil. Das Passwort wird nicht gespeichert.

## LG webOS

Der Fernseher bekommt einen eigenen Build ohne Electron und mpv:

```bash
npm run package:webos
```

Das erzeugt in `release/webos/` das IPK-Paket, das Manifest für den Homebrew Channel und das Icon. Mit `--source` und `--icon` trägt das Skript die öffentlichen Adressen ins Manifest ein:

```bash
node scripts/package-webos.mjs --source https://github.com/NiIZen/cherryfin --icon https://github.com/NiIZen/cherryfin/releases/latest/download/icon160.png
```

Mindestens nötig ist webOS 5 (Modelle ab 2020, Chromium 68). Unterschiede zur Windows-App:

- Der Medienplayer des Fernsehers spielt ab, inklusive MKV, HEVC und Dolby. DTS lässt sich einschalten, falls das Modell es kann. Sonst wandelt der Server den Ton um.
- Passthrough an einen Receiver stellt man in den Toneinstellungen des Fernsehers ein (HDMI ARC oder eARC).
- Texteingaben laufen über eine Bildschirmtastatur. Den Server sucht die App nicht selbst, die Adresse wird einmal eingegeben.
- Das Zugriffstoken liegt unverschlüsselt im Speicher dieser App, weil der Fernseher keinen verschlüsselten Speicher bietet.
- Der Glaseffekt ist wegen der Rechenleistung standardmäßig aus.

Die Vorlage für den Eintrag im Homebrew Channel liegt unter `webos/homebrew-package.yml`. Die Regeln stehen in [webosbrew/apps-repo](https://github.com/webosbrew/apps-repo): Eine KI-gestützte Entwicklung muss im Pull Request offengelegt werden, und ein Mensch muss die App getestet und geprüft haben.

## Verbindungsausfälle

Antwortet der Server nicht mehr, erscheint statt einer leeren Seite ein Hinweis mit **Neu laden**. Die App prüft im Hintergrund weiter und lädt von selbst neu, sobald der Server zurück ist. Die Anmeldung und die Position in der App bleiben dabei erhalten. Ein laufender Film wird nicht unterbrochen, solange noch Video im Puffer ist; bricht die Wiedergabe ab, bietet der Player dort **Neu laden** an. F5 oder Strg+R laden jederzeit neu.

## Player und Ton

Standardmäßig spielt [mpv](https://mpv.io/) die Filme ab. Es liegt der App bei und liest praktisch jedes Format direkt, auch MKV, DTS und TrueHD. Der Server muss nur noch umwandeln, wenn die Bitrate über dem eingestellten Limit liegt. Untertitel aus der Datei liest mpv selbst, auch PGS und DVD, ohne Einbrennen.

Unter **Einstellungen > Wiedergabe** lässt sich auf den eingebauten Player umstellen. Der Demo-Modus nutzt immer den eingebauten Player.

| Einstellung | Wirkung |
| --- | --- |
| Ausgabegerät | Wählt das Windows-Audiogerät, zum Beispiel den Receiver. Windows zeigt ihn meist nur an, solange er eingeschaltet ist. |
| Passthrough | Der Ton geht unverändert an den Receiver, einzeln schaltbar für AC3, E-AC3, TrueHD, DTS und DTS-HD. Nötig für Atmos und DTS:X. |
| Passthrough aus | mpv dekodiert selbst und sendet unkomprimierten Mehrkanalton. Verlustfrei, aber ohne Atmos- und DTS:X-Objekte. |
| Exklusiver Audiomodus | mpv belegt das Gerät allein. Für TrueHD und DTS-HD nötig. Andere Windows-Töne sind dabei stumm. |

Was gerade ausgegeben wird, steht im Player im Tonspur-Menü, etwa `Passthrough: Dolby TrueHD` oder `PCM: 7.1`. Entscheidend ist am Ende die Anzeige des Receivers.

Manche Audiotreiber (nachgewiesen mit Intel Smart Sound) lassen die Abspieluhr des ersten Tonstroms nicht anlaufen, wenn das Gerät einige Sekunden nichts ausgegeben hat. Das Bild bleibt dann auf dem ersten Einzelbild stehen, bei mpv und beim eingebauten Player. Vor jedem Laden öffnet und schließt die App das Gerät deshalb 0,6 Sekunden lang mit Stille. Bleibt die Zeit mit mpv trotzdem stehen, startet sie die Audioausgabe neu und nutzt zuletzt den exklusiven Modus. Nimmt das Gerät ein Format nicht per Passthrough an, läuft der Film mit PCM, und der Player sagt das an.

Technik: mpv rendert in ein eigenes natives Fenster, darüber liegt ein transparentes Fenster mit der Bedienung. Das Hauptfenster ist währenddessen ausgeblendet. `vendor/mpv` enthält den Build [zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild) (`mpv-x86_64-20261105-git-3138fc8eea`). mpv steht unter GPL/LGPL; das ist zu beachten, bevor die App an andere weitergegeben wird.

## Grenzen

- Musik, Fotos, Bücher und Live-TV sind nicht eingebunden.
- Die Einstellungen sind am Quellcode von Fladder ausgerichtet. Nicht übernommen sind Downloads, Touch-Gesten, Bild-im-Bild, Seerr und ein Versatz für Untertitel.
- In der Fensteransicht lässt sich der Player verschieben, aber nicht in der Größe ändern. Vollbild schaltet F.
- HDR und Dolby Vision hängen von Windows, Grafikkarte und Bildschirm ab und sind nicht getestet.
- ASS/SSA-Untertitel werden zu WebVTT gewandelt und verlieren dabei ihre Formatierung.
- Die Schrift ist Inter. SF Pro wird nur genutzt, wenn sie lokal installiert ist, und wird nicht mitgeliefert.

## Lizenz

Cherryfin steht unter der [GNU General Public License 3.0](LICENSE). Die Windows-Pakete enthalten [mpv](https://mpv.io/) (GPL-2.0 oder neuer); der Quellcode des enthaltenen Builds liegt bei [mpv-player/mpv](https://github.com/mpv-player/mpv) unter Commit `3138fc8eea`, das Build-Skript bei [zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild).

Jellyfin ist ein Projekt der Jellyfin-Community. Cherryfin ist ein unabhängiger Client und nicht mit ihr verbunden.

Cherryfin wurde mit Unterstützung der KI Claude von Anthropic entwickelt.
