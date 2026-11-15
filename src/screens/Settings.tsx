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
import { t } from '../i18n';

const QUALITIES = [
  { label: 'Maximum', value: 120_000_000 },
  { label: '40 Mbit/s', value: 40_000_000 },
  { label: '20 Mbit/s', value: 20_000_000 },
  { label: '10 Mbit/s', value: 10_000_000 },
  { label: '4 Mbit/s', value: 4_000_000 },
];

const CATEGORIES = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'home', label: 'Home' },
  { id: 'tabs', label: 'Sections' },
  { id: 'library', label: 'Library' },
  { id: 'playback', label: 'Playback' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'hotkeys', label: 'Keyboard shortcuts' },
  { id: 'account', label: 'Account' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

function MoveButtons({ canUp, canDown, onMove, label }: { canUp: boolean; canDown: boolean; onMove: (delta: number) => void; label: string }) {
  return (
    <>
      <button type="button" className="round-btn small" data-focusable disabled={!canUp} aria-label={t('Move {name} up', { name: label })} onClick={() => onMove(-1)}><ArrowUpIcon /></button>
      <button type="button" className="round-btn small" data-focusable disabled={!canDown} aria-label={t('Move {name} down', { name: label })} onClick={() => onMove(1)}><ArrowDownIcon /></button>
    </>
  );
}

function AppearancePanel() {
  const { settings, updateSettings } = useApp();
  const a = settings.appearance;
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => updateSettings({ appearance: { ...a, [key]: value } });

  return (
    <>
      <h2 className="settings-heading">{t('Language')}</h2>
      <div className="list-group">
        <ChoiceRow label="Language" value={settings.language} options={[{ value: 'auto', label: 'Automatic' }, { value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} onChange={(language) => updateSettings({ language })} />
      </div>

      <h2 className="settings-heading">{t('Color')}</h2>
      <div className="swatches" data-focus-group role="radiogroup" aria-label={t('Accent color')}>
        {ACCENTS.map((accent) => (
          <button
            key={accent.id}
            type="button"
            className="swatch"
            data-focusable
            data-accent={accent.id}
            role="radio"
            aria-checked={a.accent === accent.id}
            aria-label={t(accent.label)}
            style={{ background: accent.bg, color: accent.fg }}
            onClick={() => set('accent', accent.id)}
          >
            {a.accent === accent.id && <CheckIcon />}
          </button>
        ))}
      </div>
      <div className="list-group">
        <ChoiceRow label={t('Background')} value={a.background} options={[{ value: 'black', label: t('Black') }, { value: 'graphite', label: t('Graphite') }, { value: 'slate', label: t('Midnight blue') }]} onChange={(v) => set('background', v)} />
      </div>

      <h2 className="settings-heading">{t('Interface')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Interface size')} value={a.scale} options={[80, 90, 100, 110, 125, 150].map((value) => ({ value, label: `${value} %` }))} onChange={(v) => set('scale', v)} />
        <ChoiceRow label={t('Font')} value={a.font} options={[{ value: 'inter', label: 'Inter' }, { value: 'system', label: 'Segoe UI' }]} onChange={(v) => set('font', v)} />
        <ChoiceRow label={t('Corners')} value={a.corners} options={[{ value: 'normal', label: t('Rounded') }, { value: 'round', label: t('Very rounded') }, { value: 'sharp', label: t('Square') }]} onChange={(v) => set('corners', v)} />
        <ChoiceRow label={t('Glass effect')} value={a.glass} options={ON_OFF} onChange={(v) => set('glass', v)} />
        <ChoiceRow label={t('Animations')} value={a.motion} options={ON_OFF} onChange={(v) => set('motion', v)} />
        <ChoiceRow label={t('Power saving')} hint={t('Turns off glass, animations and tilt, for less powerful devices')} value={a.lowPower} options={ON_OFF} onChange={(v) => set('lowPower', v)} />
        <ChoiceRow label={t('Detail page background')} value={a.detailBackground} options={[{ value: 'blurred', label: t('Image with glass') }, { value: 'sharp', label: t('Image without glass') }, { value: 'off', label: t('No image') }]} onChange={(v) => set('detailBackground', v)} />
      </div>

      <h2 className="settings-heading">{t('Cards and focus')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Card size in rows')} value={a.cardScale} options={[{ value: 0.8, label: t('Small') }, { value: 1, label: t('Medium') }, { value: 1.2, label: t('Large') }, { value: 1.4, label: t('Very large') }]} onChange={(v) => set('cardScale', v)} />
        <ChoiceRow label={t('Titles below cards in rows')} value={a.labels} options={[{ value: 'auto', label: t('Automatic') }, { value: 'always', label: t('Always') }, { value: 'focus', label: t('Only when focused') }, { value: 'off', label: t('Never') }]} onChange={(v) => set('labels', v)} />
        <ChoiceRow label={t('Focus zoom')} value={a.focusZoom} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: t('Large') }, { value: 'small', label: t('Subtle') }]} onChange={(v) => set('focusZoom', v)} />
        <ChoiceRow label={t('Tilt and shine')} value={a.tilt} options={ON_OFF} onChange={(v) => set('tilt', v)} />
        <ChoiceRow label={t('Focus ring in accent color')} value={a.focusRing} options={ON_OFF} onChange={(v) => set('focusRing', v)} />
        <ChoiceRow label={t('Progress bars')} value={a.progress} options={ON_OFF} onChange={(v) => set('progress', v)} />
        <ChoiceRow label={t('Checkmark on watched')} value={a.watched} options={ON_OFF} onChange={(v) => set('watched', v)} />
        <ChoiceRow label={t('Spoiler protection')} hint={t('Hides the image and summary of unwatched episodes')} value={a.spoilerProtection} options={ON_OFF} onChange={(v) => set('spoilerProtection', v)} />
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
      <h2 className="settings-heading">{t('Header')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Display')} value={home.hero} options={[{ value: 'carousel', label: t('Rotating') }, { value: 'static', label: t('Fixed') }, { value: 'off', label: t('Off') }]} onChange={(v) => set({ hero: v })} />
        <ChoiceRow label={t('Rotate every')} value={home.heroSeconds} options={[5, 9, 15, 30].map((value) => ({ value, label: t('{value} seconds', { value }) }))} onChange={(v) => set({ heroSeconds: v })} />
        <ChoiceRow label={t('Content')} value={home.heroSource} options={[{ value: 'new', label: t('Recently added') }, { value: 'continue', label: t('Continue watching') }, { value: 'nextup', label: t('Next up') }, { value: 'mixed', label: t('Continue watching and next up') }]} onChange={(v) => set({ heroSource: v })} />
        <ChoiceRow label={t('Show description')} value={home.heroDetails} options={ON_OFF} onChange={(v) => set({ heroDetails: v })} />
        <ChoiceRow label={t('Card format')} value={home.cardStyle} options={[{ value: 'auto', label: t('Automatic') }, { value: 'poster', label: t('Portrait') }, { value: 'landscape', label: t('Landscape') }]} onChange={(v) => set({ cardStyle: v })} />
      </div>

      <h2 className="settings-heading">{t('Continue watching')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Row split')} value={home.continueMode} options={[{ value: 'combined', label: t('Together in one row') }, { value: 'separate', label: t('Two separate rows') }, { value: 'resume', label: t('Started only') }, { value: 'nextup', label: t('Next up only') }]} onChange={(v) => set({ continueMode: v })} />
        <ChoiceRow label={t('Next up from shows watched in the last')} value={home.nextUpDays} options={[{ value: 0, label: t('No limit') }, { value: 30, label: t('30 days') }, { value: 90, label: t('3 months') }, { value: 180, label: t('6 months') }, { value: 365, label: t('1 year') }]} onChange={(v) => set({ nextUpDays: v })} />
      </div>

      <h2 className="settings-heading">{t('Rows on the home screen')}</h2>
      <div className="list-group">
        {home.rows.map((row, index) => (
          <div key={row.id} className="pref-line" data-focus-group>
            <button type="button" className="list-row" data-focusable data-setting={t(HOME_ROW_LABELS[row.id])} onClick={() => set({ rows: home.rows.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)) })}>
              <span className="list-row-title">{t(HOME_ROW_LABELS[row.id])}</span>
              <span className="list-row-value">{row.enabled ? t('On') : t('Off')}</span>
            </button>
            <MoveButtons label={t(HOME_ROW_LABELS[row.id])} canUp={index > 0} canDown={index < home.rows.length - 1} onMove={(delta) => set({ rows: moveItem(home.rows, index, delta) })} />
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
      <h2 className="settings-heading">{t('Sections in the top bar')}</h2>
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
                <span className="list-row-value">{hidden ? t('Hidden') : t('Visible')}</span>
              </button>
              <ChoiceRow label={`${t('View')}: ${tab.label}`} value={prefsFor(settings, tab.id).view} options={VIEW_OPTIONS} onChange={(view) => setView(tab.id, view)} />
              <MoveButtons label={tab.label} canUp={index > 0} canDown={index < all.length - 1} onMove={(delta) => updateSettings({ tabs: { ...tabs, order: moveItem(ids, index, delta) } })} />
            </div>
          );
        })}
      </div>
      <h2 className="settings-heading">{t('Combine')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Merge all movie and TV libraries')} value={tabs.merge} options={ON_OFF} onChange={(merge) => updateSettings({ tabs: { ...tabs, merge } })} />
      </div>
    </>
  );
}

function LibraryPanel() {
  const { settings, updateSettings } = useApp();
  const own = Object.keys(settings.libraryOverrides).length;
  return (
    <>
      <h2 className="settings-heading">{t('Default for all sections')}</h2>
      <p className="settings-note">{t('Adjust single sections right there with the “View” button. Those adjustments take priority.')}</p>
      <LibraryPrefRows prefs={settings.library} onChange={(key, value) => updateSettings({ library: { ...settings.library, [key]: value } })} />
      {own > 0 && (
        <div className="list-group spaced">
          <button type="button" className="list-row danger" data-focusable onClick={() => updateSettings({ libraryOverrides: {} })}>
            <span className="list-row-title">{t('Clear adjustments of single sections')}</span>
            <span className="list-row-value">{own}</span>
          </button>
        </div>
      )}
    </>
  );
}

const SEEK_LENGTHS = [5, 10, 15, 30, 60].map((value) => ({ value, label: t('{value} seconds', { value }) }));
const SEGMENT_OPTIONS: Array<{ value: SegmentAction; label: string }> = [{ value: 'ask', label: 'Show button' }, { value: 'skip', label: 'Skip automatically' }, { value: 'off', label: 'Do nothing' }];
const SEGMENT_ROWS: Array<{ kind: SegmentKind; label: string }> = [
  { kind: 'Intro', label: 'Intro' },
  { kind: 'Recap', label: 'Recap' },
  { kind: 'Commercial', label: 'Commercials' },
  { kind: 'Preview', label: 'Preview' },
  { kind: 'Outro', label: 'Credits' },
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
      <h2 className="settings-heading">{t('Playback')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Quality on the home network')} value={settings.maxBitrate} options={QUALITIES} onChange={(maxBitrate) => updateSettings({ maxBitrate })} />
        <ChoiceRow label={t('Quality over the internet')} value={playback.maxBitrateInternet} options={QUALITIES} onChange={(maxBitrateInternet) => set({ maxBitrateInternet })} />
        <ChoiceRow label={t('Play next episode automatically')} value={settings.autoplayNext} options={ON_OFF} onChange={(autoplayNext) => updateSettings({ autoplayNext })} />
        {!isTV && <ChoiceRow label={t('Start player in full screen')} value={settings.fullscreenPlayback} options={ON_OFF} onChange={(fullscreenPlayback) => updateSettings({ fullscreenPlayback })} />}
        <ChoiceRow label={t('Skip back')} value={playback.seekBack} options={SEEK_LENGTHS} onChange={(seekBack) => set({ seekBack })} />
        <ChoiceRow label={t('Skip forward')} value={playback.seekForward} options={SEEK_LENGTHS} onChange={(seekForward) => set({ seekForward })} />
        <ChoiceRow label={t('Remember audio language')} value={playback.rememberAudio} options={ON_OFF} onChange={(rememberAudio) => set({ rememberAudio })} />
        <ChoiceRow label={t('Remember subtitle language')} value={playback.rememberSubtitles} options={ON_OFF} onChange={(rememberSubtitles) => set({ rememberSubtitles })} />
        <ChoiceRow label={t('Incognito')} hint={t('The server is not told anything; progress and watched state stay unchanged')} value={playback.incognito} options={ON_OFF} onChange={(incognito) => set({ incognito })} />
        <ChoiceRow label={t('Screensaver after 1 minute of pause')} value={playback.screensaver} options={[{ value: 'off', label: t('Off') }, { value: 'clock', label: t('Clock') }, { value: 'logo', label: 'Logo' }]} onChange={(screensaver) => set({ screensaver })} />
      </div>

      <h2 className="settings-heading">{t('Picture')}</h2>
      <div className="list-group">
        <ChoiceRow label={t('Picture fit')} value={playback.fit} options={[{ value: 'contain', label: t('Fit') }, { value: 'cover', label: t('Fill and crop') }, { value: 'fill', label: t('Stretch') }]} onChange={(fit) => set({ fit })} />
        {usesMpv && <ChoiceRow label={t('Hardware decoding')} value={playback.hardwareDecoding} options={ON_OFF} onChange={(hardwareDecoding) => set({ hardwareDecoding })} />}
        {usesMpv && <ChoiceRow label={t('Stream buffer')} value={playback.bufferMb} options={[64, 128, 256, 512, 1024, 2048].map((value) => ({ value, label: value >= 1024 ? `${value / 1024} GB` : `${value} MB` }))} onChange={(bufferMb) => set({ bufferMb })} />}
      </div>

      <h2 className="settings-heading">{t('Intro, credits and other segments')}</h2>
      <p className="settings-note">{t('Works when the server knows the segments, for example through Intro Skipper.')}</p>
      <div className="list-group">
        {SEGMENT_ROWS.map(({ kind, label }) => (
          <ChoiceRow key={kind} label={label} value={playback.segments[kind]} options={SEGMENT_OPTIONS} onChange={(action) => set({ segments: { ...playback.segments, [kind]: action } })} />
        ))}
      </div>

      {!isTV && (
        <>
          <h2 className="settings-heading">{t('Mouse and keyboard')}</h2>
          <div className="list-group">
            <ChoiceRow label={t('Speed while holding the mouse button')} value={playback.speedBoost} options={[{ value: 0, label: t('Off') }, { value: 1.5, label: '1,5×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }]} onChange={(speedBoost) => set({ speedBoost })} />
            <ChoiceRow label={t('Double-click on the picture')} hint={t('Seek: left back, right forward, middle full screen')} value={playback.doubleClick} options={[{ value: 'fullscreen', label: t('Full screen') }, { value: 'seek', label: t('Seek') }]} onChange={(doubleClick) => set({ doubleClick })} />
            <ChoiceRow label={t('Keyboard media keys')} value={playback.mediaKeys} options={ON_OFF} onChange={(mediaKeys) => set({ mediaKeys })} />
          </div>
        </>
      )}

      <AudioPanel />
    </>
  );
}

const SUBTITLE_COLORS = [
  { value: '#ffffff', label: 'White' },
  { value: '#ffe066', label: 'Yellow' },
  { value: '#cfcfcf', label: 'Light gray' },
  { value: '#7fdfff', label: 'Light blue' },
  { value: '#9fef9f', label: 'Light green' },
];

function SubtitlePanel() {
  const { settings, updateSettings } = useApp();
  const s = settings.subtitles;
  const set = (patch: Partial<SubtitleSettings>) => updateSettings({ subtitles: { ...s, ...patch } });
  return (
    <>
      <h2 className="settings-heading">{t('Appearance')}</h2>
      <p className="settings-note">{t('Applies to text subtitles. Image-based subtitles such as PGS bring their own look. For ASS subtitles, mpv keeps the style of the file.')}</p>
      <div className="list-group">
        <ChoiceRow label={t('Size')} value={s.size} options={[{ value: 32, label: t('Small') }, { value: 44, label: t('Medium') }, { value: 56, label: t('Large') }, { value: 72, label: t('Very large') }]} onChange={(size) => set({ size })} />
        <ChoiceRow label={t('Bold font')} value={s.bold} options={ON_OFF} onChange={(bold) => set({ bold })} />
        <ChoiceRow label={t('Color')} value={s.color} options={SUBTITLE_COLORS} onChange={(color) => set({ color })} />
        <ChoiceRow label={t('Outline')} value={s.outline} options={[{ value: 0, label: t('None') }, { value: 1, label: t('Thin') }, { value: 2, label: 'Normal' }, { value: 4, label: t('Thick') }]} onChange={(outline) => set({ outline })} />
        <ChoiceRow label={t('Background')} value={s.background} options={[{ value: 'none', label: t('None') }, { value: 'box', label: t('Dark box') }]} onChange={(background) => set({ background })} />
        <ChoiceRow label={t('Distance from the bottom')} hint={t('mpv only')} value={s.position} options={[{ value: 0, label: t('None') }, { value: 5, label: t('Small') }, { value: 10, label: t('Medium') }, { value: 20, label: t('Large') }]} onChange={(position) => set({ position })} />
      </div>
    </>
  );
}

/** Keys that already have a fixed job. */
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
      // If the key is taken, the two actions swap keys.
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
      <h2 className="settings-heading">{t('In the player')}</h2>
      <p className="settings-note">{t('Select an entry and press the new key. Escape cancels. Space, arrows, Enter and F stay reserved.')}</p>
      <div className="list-group">
        {(Object.keys(HOTKEY_LABELS) as HotkeyAction[]).map((action) => (
          <button key={action} type="button" className="list-row" data-focusable data-hotkey={action} onClick={() => setListening(action)}>
            <span className="list-row-title">{t(HOTKEY_LABELS[action])}</span>
            <span className="list-row-value">{listening === action ? t('Press a key …') : hotkeys[action].toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="list-group spaced">
        <button type="button" className="list-row" data-focusable onClick={() => updateSettings({ playback: { ...settings.playback, hotkeys: DEFAULT_SETTINGS.playback.hotkeys } })}>
          <span className="list-row-title">{t('Restore defaults')}</span>
        </button>
      </div>
    </>
  );
}

const PASSTHROUGH_LABELS: Array<{ format: PassthroughFormat; label: string; hint?: string }> = [
  { format: 'ac3', label: 'Dolby Digital (AC3)' },
  { format: 'eac3', label: 'Dolby Digital Plus (E-AC3)', hint: 'Also Atmos in E-AC3' },
  { format: 'truehd', label: 'Dolby TrueHD', hint: 'Also Atmos in TrueHD' },
  { format: 'dts', label: 'DTS' },
  { format: 'dts-hd', label: 'DTS-HD Master Audio', hint: 'Also DTS:X' },
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
  const deviceOptions = devices.length ? devices.map((d) => ({ value: d.id, label: d.id === 'auto' ? t('Automatic') : d.name })) : [{ value: 'auto', label: t('Automatic') }];
  const channelRow = (
    <ChoiceRow
      label={t('Audio channels')}
      value={settings.audioChannels}
      options={usesMpv ? [{ value: 6, label: t('As set up in the Windows device') }, { value: 2, label: 'Stereo' }] : [{ value: 6, label: t('Up to 5.1') }, { value: 2, label: 'Stereo' }]}
      onChange={(audioChannels) => updateSettings({ audioChannels })}
    />
  );

  return (
    <>
      {available && (
        <>
          <h2 className="settings-heading">Player</h2>
          <div className="list-group">
            <ChoiceRow label={t('Play with')} value={settings.playerBackend} options={[{ value: 'mpv', label: 'mpv' }, { value: 'builtin', label: t('Built-in player') }]} onChange={(playerBackend) => updateSettings({ playerBackend })} />
          </div>
        </>
      )}

      <h2 className="settings-heading">{t('Audio')}</h2>
      <div className="list-group">
        {usesMpv && <ChoiceRow label={t('Output device')} value={audio.device} options={deviceOptions} onChange={(device) => setAudio({ device })} />}
        <ChoiceRow label={t('Volume at start')} value={settings.playback.volume} options={[50, 60, 70, 80, 90, 100, 110, 120, 130].map((value) => ({ value, label: `${value} %` })).filter((option) => usesMpv || option.value <= 100)} onChange={(volume) => updateSettings({ playback: { ...settings.playback, volume } })} />
        {channelRow}
        {isTV && <ChoiceRow label={t('Play DTS directly')} hint={t('Only turn on if your TV supports DTS')} value={settings.tvDts} options={ON_OFF} onChange={(tvDts) => updateSettings({ tvDts })} />}
        {usesMpv && (
          <ChoiceRow
            label={t('Passthrough to the receiver')}
            hint={t('The receiver decodes the audio itself')}
            value={audio.mode}
            options={[{ value: 'pcm', label: t('Off') }, { value: 'passthrough', label: t('On') }]}
            onChange={(mode) => setAudio({ mode, exclusive: mode === 'passthrough' ? true : audio.exclusive })}
          />
        )}
      </div>

      {usesMpv && audio.mode === 'passthrough' && (
        <>
          <h2 className="settings-heading">{t('Passthrough formats')}</h2>
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
          <ChoiceRow label={t('Exclusive audio mode')} hint={t('Mutes other Windows sounds during playback')} value={audio.exclusive} options={ON_OFF} onChange={(exclusive) => setAudio({ exclusive })} />
        </div>
      )}

      <p className="settings-note below">
        {isTV
          ? t('The TV plays the files itself and outputs audio according to its own settings. Set up passthrough to a receiver in the TV’s sound settings (HDMI ARC or eARC).')
          : usesMpv
          ? t('Only turn on formats your receiver decodes. TrueHD and DTS-HD need exclusive mode. With passthrough off, mpv decodes the audio and sends uncompressed multichannel audio, without Atmos and DTS:X objects. The audio menu in the player shows the current output.')
          : client.isDemo
            ? t('Demo mode always uses the built-in player. The server converts Dolby and DTS to AAC for it.')
            : `${checked && window.native && !available ? `${t('mpv could not be loaded, so the built-in player is used.')} ` : ''}${t('The built-in player cannot do passthrough. The server converts Dolby and DTS to AAC.')}`}
        {' '}{t('Set the audio language in your Jellyfin profile.')}
      </p>
    </>
  );
}

function AccountPanel() {
  const { client, signOut, updateSettings } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <h2 className="settings-heading">{t('Connection')}</h2>
      <div className="list-group">
        <div className="list-row static">
          <ServerIcon />
          <span className="list-row-title">{client.serverName}</span>
          <span className="list-row-value">{client.isDemo ? t('Demo mode') : client.serverUrl}</span>
        </div>
        <button type="button" className="list-row danger" data-focusable onClick={signOut}>
          <span className="list-row-title">{client.isDemo ? t('Exit demo') : t('Sign out')}</span>
        </button>
      </div>

      <h2 className="settings-heading">{t('Settings')}</h2>
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
          <span className="list-row-title">{confirmReset ? t('Really reset everything?') : t('Reset all settings')}</span>
        </button>
      </div>

      <h2 className="settings-heading">{t('Keyboard and gamepad')}</h2>
      <dl className="shortcut-list">
        <div><dt>{t('Arrow keys / D-pad')}</dt><dd>{t('Navigate; in the player, skip 10 seconds')}</dd></div>
        <div><dt>Enter / A</dt><dd>{t('Select')}</dd></div>
        <div><dt>{t('Esc, Backspace / B')}</dt><dd>{t('Back')}</dd></div>
        <div><dt>{t('Space / Start')}</dt><dd>{t('Play and pause')}</dd></div>
        {!isTV && <div><dt>{t('F or F11')}</dt><dd>{t('Full screen')}</dd></div>}
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

  // Categories on the left, options on the right. Moving across works even without a row at the same height.
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
          <nav className="list-group" ref={nav} aria-label={t('Settings')} data-focus-group data-section="top">
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
                <span className="list-row-title">{t(entry.label)}</span>
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
