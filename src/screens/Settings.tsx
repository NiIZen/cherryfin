import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/context';
import {
  ACCENTS,
  DEFAULT_SETTINGS,
  HOTKEY_LABELS,
  type HotkeyAction,
  type PlaybackSettings,
  type SegmentAction,
  type SegmentKind,
  type SubtitleSettings,
  HOME_ROW_LABELS,
  moveItem,
  prefsFor,
  type Appearance,
  type AudioSettings,
  type LibraryPrefs,
  type PassthroughFormat,
  type Settings,
} from '../app/settings';
import { useLibraryTabs } from '../app/tabs';
import { focusElement, focusFirstIn, inputMode } from '../focus/engine';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ServerIcon } from '../ui/Icons';
import { ChoiceRow, LibraryPrefRows, ON_OFF, VIEW_OPTIONS } from '../ui/SettingRows';
import { isTV } from '../tv/platform';

const QUALITIES = [
  { label: 'Maximal', value: 120_000_000 },
  { label: '40 Mbit/s', value: 40_000_000 },
  { label: '20 Mbit/s', value: 20_000_000 },
  { label: '10 Mbit/s', value: 10_000_000 },
  { label: '4 Mbit/s', value: 4_000_000 },
];

const CATEGORIES = [
  { id: 'appearance', label: 'Darstellung' },
  { id: 'home', label: 'Startseite' },
  { id: 'tabs', label: 'Bereiche' },
  { id: 'library', label: 'Mediathek' },
  { id: 'playback', label: 'Wiedergabe' },
  { id: 'subtitles', label: 'Untertitel' },
  { id: 'hotkeys', label: 'Tastenkürzel' },
  { id: 'account', label: 'Konto' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

function MoveButtons({ canUp, canDown, onMove, label }: { canUp: boolean; canDown: boolean; onMove: (delta: number) => void; label: string }) {
  return (
    <>
      <button type="button" className="round-btn small" data-focusable disabled={!canUp} aria-label={`${label} nach oben`} onClick={() => onMove(-1)}><ArrowUpIcon /></button>
      <button type="button" className="round-btn small" data-focusable disabled={!canDown} aria-label={`${label} nach unten`} onClick={() => onMove(1)}><ArrowDownIcon /></button>
    </>
  );
}

function AppearancePanel() {
  const { settings, updateSettings } = useApp();
  const a = settings.appearance;
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => updateSettings({ appearance: { ...a, [key]: value } });

  return (
    <>
      <h2 className="settings-heading">Farbe</h2>
      <div className="swatches" data-focus-group role="radiogroup" aria-label="Akzentfarbe">
        {ACCENTS.map((accent) => (
          <button
            key={accent.id}
            type="button"
            className="swatch"
            data-focusable
            data-accent={accent.id}
            role="radio"
            aria-checked={a.accent === accent.id}
            aria-label={accent.label}
            style={{ background: accent.bg, color: accent.fg }}
            onClick={() => set('accent', accent.id)}
          >
            {a.accent === accent.id && <CheckIcon />}
          </button>
        ))}
      </div>
      <div className="list-group">
        <ChoiceRow label="Hintergrund" value={a.background} options={[{ value: 'black', label: 'Schwarz' }, { value: 'graphite', label: 'Graphit' }, { value: 'slate', label: 'Nachtblau' }]} onChange={(v) => set('background', v)} />
      </div>

      <h2 className="settings-heading">Oberfläche</h2>
      <div className="list-group">
        <ChoiceRow label="Größe der Oberfläche" value={a.scale} options={[80, 90, 100, 110, 125, 150].map((value) => ({ value, label: `${value} %` }))} onChange={(v) => set('scale', v)} />
        <ChoiceRow label="Schrift" value={a.font} options={[{ value: 'inter', label: 'Inter' }, { value: 'system', label: 'Segoe UI' }]} onChange={(v) => set('font', v)} />
        <ChoiceRow label="Ecken" value={a.corners} options={[{ value: 'normal', label: 'Abgerundet' }, { value: 'round', label: 'Stark gerundet' }, { value: 'sharp', label: 'Eckig' }]} onChange={(v) => set('corners', v)} />
        <ChoiceRow label="Glaseffekt" value={a.glass} options={ON_OFF} onChange={(v) => set('glass', v)} />
        <ChoiceRow label="Animationen" value={a.motion} options={ON_OFF} onChange={(v) => set('motion', v)} />
        <ChoiceRow label="Sparmodus" hint="Schaltet Glas, Animationen und Neigen ab, für schwächere Geräte" value={a.lowPower} options={ON_OFF} onChange={(v) => set('lowPower', v)} />
        <ChoiceRow label="Hintergrund der Detailseite" value={a.detailBackground} options={[{ value: 'blurred', label: 'Bild mit Glas' }, { value: 'sharp', label: 'Bild ohne Glas' }, { value: 'off', label: 'Kein Bild' }]} onChange={(v) => set('detailBackground', v)} />
      </div>

      <h2 className="settings-heading">Karten und Fokus</h2>
      <div className="list-group">
        <ChoiceRow label="Kartengröße in Reihen" value={a.cardScale} options={[{ value: 0.8, label: 'Klein' }, { value: 1, label: 'Mittel' }, { value: 1.2, label: 'Groß' }, { value: 1.4, label: 'Sehr groß' }]} onChange={(v) => set('cardScale', v)} />
        <ChoiceRow label="Titel unter Karten in Reihen" value={a.labels} options={[{ value: 'auto', label: 'Automatisch' }, { value: 'always', label: 'Immer' }, { value: 'focus', label: 'Nur im Fokus' }, { value: 'off', label: 'Nie' }]} onChange={(v) => set('labels', v)} />
        <ChoiceRow label="Fokus-Zoom" value={a.focusZoom} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Groß' }, { value: 'small', label: 'Dezent' }]} onChange={(v) => set('focusZoom', v)} />
        <ChoiceRow label="Neigen und Glanz" value={a.tilt} options={ON_OFF} onChange={(v) => set('tilt', v)} />
        <ChoiceRow label="Fokusrahmen in Akzentfarbe" value={a.focusRing} options={ON_OFF} onChange={(v) => set('focusRing', v)} />
        <ChoiceRow label="Fortschrittsbalken" value={a.progress} options={ON_OFF} onChange={(v) => set('progress', v)} />
        <ChoiceRow label="Haken bei Gesehenem" value={a.watched} options={ON_OFF} onChange={(v) => set('watched', v)} />
        <ChoiceRow label="Spoiler-Schutz" hint="Verdeckt Bild und Inhalt ungesehener Folgen" value={a.spoilerProtection} options={ON_OFF} onChange={(v) => set('spoilerProtection', v)} />
      </div>
    </>
  );
}

function HomePanel() {
  const { settings, updateSettings } = useApp();
  const home = settings.home;
  const set = (patch: Partial<Settings['home']>) => updateSettings({ home: { ...home, ...patch } });

  return (
    <>
      <h2 className="settings-heading">Titelbereich</h2>
      <div className="list-group">
        <ChoiceRow label="Anzeige" value={home.hero} options={[{ value: 'carousel', label: 'Wechselnd' }, { value: 'static', label: 'Feststehend' }, { value: 'off', label: 'Aus' }]} onChange={(v) => set({ hero: v })} />
        <ChoiceRow label="Wechsel alle" value={home.heroSeconds} options={[5, 9, 15, 30].map((value) => ({ value, label: `${value} Sekunden` }))} onChange={(v) => set({ heroSeconds: v })} />
        <ChoiceRow label="Inhalt" value={home.heroSource} options={[{ value: 'new', label: 'Neu hinzugefügt' }, { value: 'continue', label: 'Weiter ansehen' }, { value: 'nextup', label: 'Nächste Folgen' }, { value: 'mixed', label: 'Weiter ansehen und Nächste Folgen' }]} onChange={(v) => set({ heroSource: v })} />
        <ChoiceRow label="Beschreibung zeigen" value={home.heroDetails} options={ON_OFF} onChange={(v) => set({ heroDetails: v })} />
        <ChoiceRow label="Kartenformat" value={home.cardStyle} options={[{ value: 'auto', label: 'Automatisch' }, { value: 'poster', label: 'Hochformat' }, { value: 'landscape', label: 'Querformat' }]} onChange={(v) => set({ cardStyle: v })} />
      </div>

      <h2 className="settings-heading">Weiter ansehen</h2>
      <div className="list-group">
        <ChoiceRow label="Aufteilung" value={home.continueMode} options={[{ value: 'combined', label: 'Zusammen in einer Reihe' }, { value: 'separate', label: 'Zwei getrennte Reihen' }, { value: 'resume', label: 'Nur Angefangenes' }, { value: 'nextup', label: 'Nur nächste Folgen' }]} onChange={(v) => set({ continueMode: v })} />
        <ChoiceRow label="Nächste Folgen aus Serien der letzten" value={home.nextUpDays} options={[{ value: 0, label: 'Unbegrenzt' }, { value: 30, label: '30 Tage' }, { value: 90, label: '3 Monate' }, { value: 180, label: '6 Monate' }, { value: 365, label: '1 Jahr' }]} onChange={(v) => set({ nextUpDays: v })} />
      </div>

      <h2 className="settings-heading">Reihen auf der Startseite</h2>
      <div className="list-group">
        {home.rows.map((row, index) => (
          <div key={row.id} className="pref-line" data-focus-group>
            <button type="button" className="list-row" data-focusable data-setting={HOME_ROW_LABELS[row.id]} onClick={() => set({ rows: home.rows.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)) })}>
              <span className="list-row-title">{HOME_ROW_LABELS[row.id]}</span>
              <span className="list-row-value">{row.enabled ? 'Ein' : 'Aus'}</span>
            </button>
            <MoveButtons label={HOME_ROW_LABELS[row.id]} canUp={index > 0} canDown={index < home.rows.length - 1} onMove={(delta) => set({ rows: moveItem(home.rows, index, delta) })} />
          </div>
        ))}
      </div>
    </>
  );
}

function TabsPanel() {
  const { settings, updateSettings } = useApp();
  const { all } = useLibraryTabs();
  const tabs = settings.tabs;
  const ids = all.map((tab) => tab.id);

  const setView = (id: string, view: LibraryPrefs['view']) => updateSettings({
    libraryOverrides: { ...settings.libraryOverrides, [id]: { ...settings.libraryOverrides[id], view } },
  });

  return (
    <>
      <h2 className="settings-heading">Bereiche in der Leiste oben</h2>
      <div className="list-group">
        {all.map((tab, index) => {
          const hidden = tabs.hidden.includes(tab.id);
          return (
            <div key={tab.id} className="pref-line" data-focus-group>
              <button
                type="button"
                className="list-row"
                data-focusable
                data-setting={tab.label}
                onClick={() => updateSettings({ tabs: { ...tabs, hidden: hidden ? tabs.hidden.filter((id) => id !== tab.id) : [...tabs.hidden, tab.id] } })}
              >
                <span className="list-row-title">{tab.label}</span>
                <span className="list-row-value">{hidden ? 'Ausgeblendet' : 'Sichtbar'}</span>
              </button>
              <ChoiceRow label={`Ansicht: ${tab.label}`} value={prefsFor(settings, tab.id).view} options={VIEW_OPTIONS} onChange={(view) => setView(tab.id, view)} />
              <MoveButtons label={tab.label} canUp={index > 0} canDown={index < all.length - 1} onMove={(delta) => updateSettings({ tabs: { ...tabs, order: moveItem(ids, index, delta) } })} />
            </div>
          );
        })}
      </div>
      <h2 className="settings-heading">Zusammenfassen</h2>
      <div className="list-group">
        <ChoiceRow label="Alle Film- und Serien-Bibliotheken zusammenlegen" value={tabs.merge} options={ON_OFF} onChange={(merge) => updateSettings({ tabs: { ...tabs, merge } })} />
      </div>
    </>
  );
}

function LibraryPanel() {
  const { settings, updateSettings } = useApp();
  const own = Object.keys(settings.libraryOverrides).length;
  return (
    <>
      <h2 className="settings-heading">Standard für alle Bereiche</h2>
      <p className="settings-note">Einzelne Bereiche passt du direkt dort über den Knopf „Ansicht“ an. Solche Anpassungen haben Vorrang.</p>
      <LibraryPrefRows prefs={settings.library} onChange={(key, value) => updateSettings({ library: { ...settings.library, [key]: value } })} />
      {own > 0 && (
        <div className="list-group spaced">
          <button type="button" className="list-row danger" data-focusable onClick={() => updateSettings({ libraryOverrides: {} })}>
            <span className="list-row-title">Anpassungen einzelner Bereiche löschen</span>
            <span className="list-row-value">{own}</span>
          </button>
        </div>
      )}
    </>
  );
}

const SEEK_LENGTHS = [5, 10, 15, 30, 60].map((value) => ({ value, label: `${value} Sekunden` }));
const SEGMENT_OPTIONS: Array<{ value: SegmentAction; label: string }> = [{ value: 'ask', label: 'Knopf zeigen' }, { value: 'skip', label: 'Automatisch überspringen' }, { value: 'off', label: 'Nichts tun' }];
const SEGMENT_ROWS: Array<{ kind: SegmentKind; label: string }> = [
  { kind: 'Intro', label: 'Intro' },
  { kind: 'Recap', label: 'Rückblick' },
  { kind: 'Commercial', label: 'Werbung' },
  { kind: 'Preview', label: 'Vorschau' },
  { kind: 'Outro', label: 'Abspann' },
];

function PlaybackPanel() {
  const { settings, updateSettings } = useApp();
  const { playback } = settings;
  const [hasMpv, setHasMpv] = useState(false);
  const set = (patch: Partial<PlaybackSettings>) => updateSettings({ playback: { ...playback, ...patch } });

  useEffect(() => {
    window.native?.player?.available().then(setHasMpv).catch(() => undefined);
  }, []);
  const usesMpv = hasMpv && settings.playerBackend === 'mpv';

  return (
    <>
      <h2 className="settings-heading">Wiedergabe</h2>
      <div className="list-group">
        <ChoiceRow label="Qualität im Heimnetz" value={settings.maxBitrate} options={QUALITIES} onChange={(maxBitrate) => updateSettings({ maxBitrate })} />
        <ChoiceRow label="Qualität über das Internet" value={playback.maxBitrateInternet} options={QUALITIES} onChange={(maxBitrateInternet) => set({ maxBitrateInternet })} />
        <ChoiceRow label="Nächste Folge automatisch" value={settings.autoplayNext} options={ON_OFF} onChange={(autoplayNext) => updateSettings({ autoplayNext })} />
        {!isTV && <ChoiceRow label="Player im Vollbild starten" value={settings.fullscreenPlayback} options={ON_OFF} onChange={(fullscreenPlayback) => updateSettings({ fullscreenPlayback })} />}
        <ChoiceRow label="Sprung zurück" value={playback.seekBack} options={SEEK_LENGTHS} onChange={(seekBack) => set({ seekBack })} />
        <ChoiceRow label="Sprung vorwärts" value={playback.seekForward} options={SEEK_LENGTHS} onChange={(seekForward) => set({ seekForward })} />
        <ChoiceRow label="Tonsprache merken" value={playback.rememberAudio} options={ON_OFF} onChange={(rememberAudio) => set({ rememberAudio })} />
        <ChoiceRow label="Untertitelsprache merken" value={playback.rememberSubtitles} options={ON_OFF} onChange={(rememberSubtitles) => set({ rememberSubtitles })} />
        <ChoiceRow label="Inkognito" hint="Der Server erfährt nichts, Fortschritt und Gesehen bleiben unverändert" value={playback.incognito} options={ON_OFF} onChange={(incognito) => set({ incognito })} />
        <ChoiceRow label="Bildschirmschoner nach 1 Minute Pause" value={playback.screensaver} options={[{ value: 'off', label: 'Aus' }, { value: 'clock', label: 'Uhr' }, { value: 'logo', label: 'Logo' }]} onChange={(screensaver) => set({ screensaver })} />
      </div>

      <h2 className="settings-heading">Bild</h2>
      <div className="list-group">
        <ChoiceRow label="Bildanpassung" value={playback.fit} options={[{ value: 'contain', label: 'Einpassen' }, { value: 'cover', label: 'Füllen und beschneiden' }, { value: 'fill', label: 'Strecken' }]} onChange={(fit) => set({ fit })} />
        {usesMpv && <ChoiceRow label="Hardware-Dekodierung" value={playback.hardwareDecoding} options={ON_OFF} onChange={(hardwareDecoding) => set({ hardwareDecoding })} />}
        {usesMpv && <ChoiceRow label="Puffer für den Stream" value={playback.bufferMb} options={[64, 128, 256, 512, 1024, 2048].map((value) => ({ value, label: value >= 1024 ? `${value / 1024} GB` : `${value} MB` }))} onChange={(bufferMb) => set({ bufferMb })} />}
      </div>

      <h2 className="settings-heading">Intro, Abspann und andere Abschnitte</h2>
      <p className="settings-note">Wirkt, wenn der Server die Abschnitte kennt, zum Beispiel über Intro Skipper.</p>
      <div className="list-group">
        {SEGMENT_ROWS.map(({ kind, label }) => (
          <ChoiceRow key={kind} label={label} value={playback.segments[kind]} options={SEGMENT_OPTIONS} onChange={(action) => set({ segments: { ...playback.segments, [kind]: action } })} />
        ))}
      </div>

      {!isTV && (
        <>
          <h2 className="settings-heading">Maus und Tastatur</h2>
          <div className="list-group">
            <ChoiceRow label="Tempo beim Halten der Maustaste" value={playback.speedBoost} options={[{ value: 0, label: 'Aus' }, { value: 1.5, label: '1,5×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }]} onChange={(speedBoost) => set({ speedBoost })} />
            <ChoiceRow label="Doppelklick auf das Bild" hint="Spulen: links zurück, rechts vorwärts, Mitte Vollbild" value={playback.doubleClick} options={[{ value: 'fullscreen', label: 'Vollbild' }, { value: 'seek', label: 'Spulen' }]} onChange={(doubleClick) => set({ doubleClick })} />
            <ChoiceRow label="Medientasten der Tastatur" value={playback.mediaKeys} options={ON_OFF} onChange={(mediaKeys) => set({ mediaKeys })} />
          </div>
        </>
      )}

      <AudioPanel />
    </>
  );
}

const SUBTITLE_COLORS = [
  { value: '#ffffff', label: 'Weiß' },
  { value: '#ffe066', label: 'Gelb' },
  { value: '#cfcfcf', label: 'Hellgrau' },
  { value: '#7fdfff', label: 'Hellblau' },
  { value: '#9fef9f', label: 'Hellgrün' },
];

function SubtitlePanel() {
  const { settings, updateSettings } = useApp();
  const s = settings.subtitles;
  const set = (patch: Partial<SubtitleSettings>) => updateSettings({ subtitles: { ...s, ...patch } });
  return (
    <>
      <h2 className="settings-heading">Darstellung</h2>
      <p className="settings-note">Gilt für Untertitel als Text. Bildbasierte Untertitel wie PGS bringen ihr Aussehen selbst mit. Bei ASS-Untertiteln behält mpv den Stil der Datei.</p>
      <div className="list-group">
        <ChoiceRow label="Größe" value={s.size} options={[{ value: 32, label: 'Klein' }, { value: 44, label: 'Mittel' }, { value: 56, label: 'Groß' }, { value: 72, label: 'Sehr groß' }]} onChange={(size) => set({ size })} />
        <ChoiceRow label="Schrift fett" value={s.bold} options={ON_OFF} onChange={(bold) => set({ bold })} />
        <ChoiceRow label="Farbe" value={s.color} options={SUBTITLE_COLORS} onChange={(color) => set({ color })} />
        <ChoiceRow label="Rand" value={s.outline} options={[{ value: 0, label: 'Kein' }, { value: 1, label: 'Dünn' }, { value: 2, label: 'Normal' }, { value: 4, label: 'Dick' }]} onChange={(outline) => set({ outline })} />
        <ChoiceRow label="Hintergrund" value={s.background} options={[{ value: 'none', label: 'Keiner' }, { value: 'box', label: 'Dunkle Fläche' }]} onChange={(background) => set({ background })} />
        <ChoiceRow label="Abstand vom unteren Rand" hint="Nur mit mpv" value={s.position} options={[{ value: 0, label: 'Kein' }, { value: 5, label: 'Klein' }, { value: 10, label: 'Mittel' }, { value: 20, label: 'Groß' }]} onChange={(position) => set({ position })} />
      </div>
    </>
  );
}

/** Tasten, die schon eine feste Aufgabe haben. */
const RESERVED_KEYS = new Set(['enter', ' ', 'tab', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'backspace', 'f', 'f5', 'f11', 'shift', 'control', 'alt', 'meta', 'capslock']);

function HotkeyPanel() {
  const { settings, updateSettings } = useApp();
  const { hotkeys } = settings.playback;
  const [listening, setListening] = useState<HotkeyAction | null>(null);

  useEffect(() => {
    if (!listening) return undefined;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        setListening(null);
        return;
      }
      const key = event.key.toLowerCase();
      if (RESERVED_KEYS.has(key)) return;
      // Ist die Taste schon vergeben, tauschen die beiden Aktionen.
      const other = (Object.keys(hotkeys) as HotkeyAction[]).find((name) => hotkeys[name] === key);
      const next = { ...hotkeys, [listening]: key };
      if (other && other !== listening) next[other] = hotkeys[listening];
      updateSettings({ playback: { ...settings.playback, hotkeys: next } });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hotkeys, listening, settings.playback, updateSettings]);

  return (
    <>
      <h2 className="settings-heading">Im Player</h2>
      <p className="settings-note">Eintrag wählen und die neue Taste drücken. Escape bricht ab. Leertaste, Pfeile, Enter und F bleiben fest belegt.</p>
      <div className="list-group">
        {(Object.keys(HOTKEY_LABELS) as HotkeyAction[]).map((action) => (
          <button key={action} type="button" className="list-row" data-focusable data-hotkey={action} onClick={() => setListening(action)}>
            <span className="list-row-title">{HOTKEY_LABELS[action]}</span>
            <span className="list-row-value">{listening === action ? 'Taste drücken …' : hotkeys[action].toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="list-group spaced">
        <button type="button" className="list-row" data-focusable onClick={() => updateSettings({ playback: { ...settings.playback, hotkeys: DEFAULT_SETTINGS.playback.hotkeys } })}>
          <span className="list-row-title">Standard wiederherstellen</span>
        </button>
      </div>
    </>
  );
}

const PASSTHROUGH_LABELS: Array<{ format: PassthroughFormat; label: string; hint?: string }> = [
  { format: 'ac3', label: 'Dolby Digital (AC3)' },
  { format: 'eac3', label: 'Dolby Digital Plus (E-AC3)', hint: 'Auch Atmos in E-AC3' },
  { format: 'truehd', label: 'Dolby TrueHD', hint: 'Auch Atmos in TrueHD' },
  { format: 'dts', label: 'DTS' },
  { format: 'dts-hd', label: 'DTS-HD Master Audio', hint: 'Auch DTS:X' },
];

function AudioPanel() {
  const { settings, updateSettings, client } = useApp();
  const { audio } = settings;
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const setAudio = (patch: Partial<AudioSettings>) => updateSettings({ audio: { ...audio, ...patch } });

  useEffect(() => {
    const bridge = window.native?.player;
    if (!bridge) return;
    bridge.available().then(setAvailable).catch(() => undefined).finally(() => setChecked(true));
    bridge.audioDevices().then(setDevices).catch(() => undefined);
  }, []);

  const usesMpv = available && settings.playerBackend === 'mpv';
  const deviceOptions = devices.length ? devices.map((d) => ({ value: d.id, label: d.id === 'auto' ? 'Automatisch' : d.name })) : [{ value: 'auto', label: 'Automatisch' }];
  const channelRow = (
    <ChoiceRow
      label="Tonkanäle"
      value={settings.audioChannels}
      options={usesMpv ? [{ value: 6, label: 'Wie im Windows-Gerät eingerichtet' }, { value: 2, label: 'Stereo' }] : [{ value: 6, label: 'Bis zu 5.1' }, { value: 2, label: 'Stereo' }]}
      onChange={(audioChannels) => updateSettings({ audioChannels })}
    />
  );

  return (
    <>
      {available && (
        <>
          <h2 className="settings-heading">Player</h2>
          <div className="list-group">
            <ChoiceRow label="Wiedergabe mit" value={settings.playerBackend} options={[{ value: 'mpv', label: 'mpv' }, { value: 'builtin', label: 'Eingebauter Player' }]} onChange={(playerBackend) => updateSettings({ playerBackend })} />
          </div>
        </>
      )}

      <h2 className="settings-heading">Ton</h2>
      <div className="list-group">
        {usesMpv && <ChoiceRow label="Ausgabegerät" value={audio.device} options={deviceOptions} onChange={(device) => setAudio({ device })} />}
        <ChoiceRow label="Lautstärke beim Start" value={settings.playback.volume} options={[50, 60, 70, 80, 90, 100, 110, 120, 130].map((value) => ({ value, label: `${value} %` })).filter((option) => usesMpv || option.value <= 100)} onChange={(volume) => updateSettings({ playback: { ...settings.playback, volume } })} />
        {channelRow}
        {isTV && <ChoiceRow label="DTS direkt abspielen" hint="Nur einschalten, wenn dein Fernseher DTS kann" value={settings.tvDts} options={ON_OFF} onChange={(tvDts) => updateSettings({ tvDts })} />}
        {usesMpv && (
          <ChoiceRow
            label="Passthrough an den Receiver"
            hint="Der Receiver dekodiert den Ton selbst"
            value={audio.mode}
            options={[{ value: 'pcm', label: 'Aus' }, { value: 'passthrough', label: 'Ein' }]}
            onChange={(mode) => setAudio({ mode, exclusive: mode === 'passthrough' ? true : audio.exclusive })}
          />
        )}
      </div>

      {usesMpv && audio.mode === 'passthrough' && (
        <>
          <h2 className="settings-heading">Formate für Passthrough</h2>
          <div className="list-group">
            {PASSTHROUGH_LABELS.map(({ format, label, hint }) => {
              const on = audio.formats.includes(format);
              return (
                <ChoiceRow
                  key={format}
                  label={label}
                  hint={hint}
                  value={on}
                  options={ON_OFF}
                  onChange={(enable) => setAudio({ formats: enable ? [...audio.formats, format] : audio.formats.filter((f) => f !== format) })}
                />
              );
            })}
          </div>
        </>
      )}

      {usesMpv && (
        <div className="list-group spaced">
          <ChoiceRow label="Exklusiver Audiomodus" hint="Sperrt andere Windows-Töne während der Wiedergabe" value={audio.exclusive} options={ON_OFF} onChange={(exclusive) => setAudio({ exclusive })} />
        </div>
      )}

      <p className="settings-note below">
        {isTV
          ? 'Der Fernseher spielt die Dateien selbst ab und gibt den Ton nach seinen eigenen Einstellungen aus. Passthrough an einen Receiver stellst du in den Toneinstellungen des Fernsehers ein (HDMI ARC oder eARC).'
          : usesMpv
          ? 'Schalte nur Formate ein, die dein Receiver dekodiert. Für TrueHD und DTS-HD muss der exklusive Modus an sein. Ist Passthrough aus, dekodiert mpv den Ton und sendet unkomprimierten Mehrkanalton, ohne Atmos- und DTS:X-Objekte. Welche Ausgabe gerade läuft, steht im Player im Tonspur-Menü.'
          : client.isDemo
            ? 'Der Demo-Modus nutzt immer den eingebauten Player. Dolby und DTS werden damit vom Server in AAC umgewandelt.'
            : `${checked && window.native && !available ? 'mpv konnte nicht geladen werden, daher läuft der eingebaute Player. ' : ''}Der eingebaute Player kann kein Passthrough. Dolby und DTS wandelt der Server in AAC um.`}
        {' '}Die Tonsprache legst du in deinem Jellyfin-Profil fest.
      </p>
    </>
  );
}

function AccountPanel() {
  const { client, signOut, updateSettings } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <h2 className="settings-heading">Verbindung</h2>
      <div className="list-group">
        <div className="list-row static">
          <ServerIcon />
          <span className="list-row-title">{client.serverName}</span>
          <span className="list-row-value">{client.isDemo ? 'Demo-Modus' : client.serverUrl}</span>
        </div>
        <button type="button" className="list-row danger" data-focusable onClick={signOut}>
          <span className="list-row-title">{client.isDemo ? 'Demo beenden' : 'Abmelden'}</span>
        </button>
      </div>

      <h2 className="settings-heading">Einstellungen</h2>
      <div className="list-group">
        <button
          type="button"
          className="list-row danger"
          data-focusable
          data-setting="reset"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
            } else {
              updateSettings(DEFAULT_SETTINGS);
              setConfirmReset(false);
            }
          }}
          onBlur={() => setConfirmReset(false)}
        >
          <span className="list-row-title">{confirmReset ? 'Wirklich alles zurücksetzen?' : 'Alle Einstellungen zurücksetzen'}</span>
        </button>
      </div>

      <h2 className="settings-heading">Tastatur und Gamepad</h2>
      <dl className="shortcut-list">
        <div><dt>Pfeiltasten / Steuerkreuz</dt><dd>Navigieren, im Player 10 Sekunden springen</dd></div>
        <div><dt>Enter / A</dt><dd>Auswählen</dd></div>
        <div><dt>Esc, Rücktaste / B</dt><dd>Zurück</dd></div>
        <div><dt>Leertaste / Start</dt><dd>Wiedergabe und Pause</dd></div>
        {!isTV && <div><dt>F oder F11</dt><dd>Vollbild</dd></div>}
      </dl>
    </>
  );
}

export function SettingsScreen() {
  const { client } = useApp();
  const [category, setCategory] = useState<CategoryId>('appearance');
  const nav = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const avatar = client.userImageUrl(client.user, 240);

  // Die Kategorien stehen links, die Optionen rechts. Der Wechsel klappt auch ohne Zeile auf gleicher Höhe.
  useEffect(() => {
    const navEl = nav.current;
    const panelEl = panel.current;
    if (!navEl || !panelEl) return undefined;
    const toPanel = (event: Event) => {
      if ((event as CustomEvent).detail !== 'right') return;
      event.preventDefault();
      focusFirstIn(panelEl);
    };
    const toNav = (event: Event) => {
      if ((event as CustomEvent).detail !== 'left') return;
      event.preventDefault();
      const current = navEl.querySelector<HTMLElement>('[aria-current="true"]');
      if (current) focusElement(current, false);
    };
    navEl.addEventListener('focus-edge', toPanel);
    panelEl.addEventListener('focus-edge', toNav);
    return () => {
      navEl.removeEventListener('focus-edge', toPanel);
      panelEl.removeEventListener('focus-edge', toNav);
    };
  }, []);

  return (
    <div className="page settings-page" data-vscroll>
      <div className="settings-layout">
        <aside className="settings-side">
          <div className="settings-user">
            <div className="settings-avatar">
              {avatar ? <img src={avatar} alt="" /> : <span>{(client.user.Name ?? '?').charAt(0).toUpperCase()}</span>}
            </div>
            <div>
              <h1>{client.user.Name}</h1>
              <p>{client.serverName}</p>
            </div>
          </div>
          <nav className="list-group" ref={nav} aria-label="Einstellungen" data-focus-group data-section="top">
            {CATEGORIES.filter((entry) => !isTV || entry.id !== 'hotkeys').map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`list-row category ${category === entry.id ? 'selected' : ''}`}
                data-focusable
                data-category={entry.id}
                aria-current={category === entry.id ? 'true' : undefined}
                onClick={() => setCategory(entry.id)}
                onFocus={() => {
                  if (inputMode() === 'keyboard') setCategory(entry.id);
                }}
              >
                <span className="list-row-title">{entry.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="settings-list" ref={panel} key={category}>
          {category === 'appearance' && <AppearancePanel />}
          {category === 'home' && <HomePanel />}
          {category === 'tabs' && <TabsPanel />}
          {category === 'library' && <LibraryPanel />}
          {category === 'playback' && <PlaybackPanel />}
          {category === 'subtitles' && <SubtitlePanel />}
          {category === 'hotkeys' && <HotkeyPanel />}
          {category === 'account' && <AccountPanel />}
        </div>
      </div>
    </div>
  );
}
