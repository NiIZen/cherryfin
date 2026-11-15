import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Item, PlaybackSession, Segment, Stream, TrickplayInfo } from '../api/types';
import { landscapeRef } from '../api/images';
import { useApp } from '../app/context';
import { isLocalServer, loadRemembered, pickRemembered, rememberTrack } from '../player/remember';
import { DEFAULT_SETTINGS, type HotkeyAction, type SegmentKind } from '../app/settings';
import { isTV } from '../tv/platform';
import logoUrl from '../../branding/cherryfin.svg';
import { episodeLabel, formatClock, formatEndTime, streamsOf, TICKS_PER_SECOND, trackLabel, trickplayTile } from '../app/format';
import { secondsToTicks } from '../api/jellyfin';
import { focusFirstIn, pushInterceptor, focusElement, setInputMode } from '../focus/engine';
import { isFullscreen, setFullscreen } from '../app/session';
import { Html5Engine, MpvEngine, type EngineEvents, type PlaybackEngine } from '../player/engines';
import { AudioIcon, CheckIcon, NextIcon, PauseIcon, PlayIcon, SpeedIcon, SubtitlesIcon } from '../ui/Icons';

const HIDE_AFTER_MS = 4000;
const LONG_SEEK_STEP = 30;
const NOTICE_MS = 7000;
const SAVER_DELAY_MS = 60_000;
const UP_NEXT_SECONDS = 25;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
/** So lange darf das Video ohne Fortschritt laden, bevor eine Meldung erscheint. */
const STALL_LIMIT_MS = 45_000;

type Menu = 'subtitles' | 'audio' | 'speed' | null;

const SEGMENT_LABELS: Record<string, string> = {
  Intro: 'Intro überspringen',
  Recap: 'Rückblick überspringen',
  Preview: 'Vorschau überspringen',
  Commercial: 'Werbung überspringen',
  Outro: 'Abspann überspringen',
};

/** Vorschaubild aus den Trickplay-Kacheln von Jellyfin. */
function TrickplayThumb({ item, info, mediaSourceId, seconds }: { item: Item; info: TrickplayInfo; mediaSourceId: string; seconds: number }) {
  const { client } = useApp();
  const tile = trickplayTile(info, seconds);
  const url = client.trickplayTileUrl(item.Id!, info.Width!, tile.sheet, mediaSourceId);
  const columns = info.TileWidth || 10;
  const rows = info.TileHeight || 10;
  return (
    <div
      className="trickplay"
      style={{
        height: `calc(20rem * ${(info.Height ?? 9) / (info.Width ?? 16)})`,
        backgroundImage: `url("${url}")`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${columns > 1 ? (tile.column / (columns - 1)) * 100 : 0}% ${rows > 1 ? (tile.row / (rows - 1)) * 100 : 0}%`,
      }}
    />
  );
}

/** external: Das Video zeigt mpv im Fenster darunter, hier liegt nur die Bedienung. */
export function PlayerScreen({ item: initialItem, startTicks, external = false }: { item: Item; startTicks: number; external?: boolean }) {
  const { client, pop, replaceTop, bumpData, settings } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<PlaybackEngine | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const disposed = useRef(false);

  const [item, setItem] = useState(initialItem);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [time, setTime] = useState(startTicks / TICKS_PER_SECOND);
  const [duration, setDuration] = useState((initialItem.RunTimeTicks ?? 0) / TICKS_PER_SECOND);
  const [buffered, setBuffered] = useState(0);
  const [overlay, setOverlay] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | undefined>();
  const [subtitleIndex, setSubtitleIndex] = useState<number>(-1);
  const [speed, setSpeed] = useState(1);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [nextEpisode, setNextEpisode] = useState<Item | null>(null);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [audioOutput, setAudioOutput] = useState('');
  const [notice, setNotice] = useState('');
  const { seekBack, seekForward, incognito, segments: segmentActions, rememberAudio, rememberSubtitles, mediaKeys, volume, speedBoost, doubleClick, screensaver, hotkeys } = settings.playback;
  const [saver, setSaver] = useState(false);
  const [clock, setClock] = useState('');
  const [saverSpot, setSaverSpot] = useState({ x: 50, y: 50 });
  const loudness = useRef({ volume, muted: false });
  const boost = useRef<{ timer?: ReturnType<typeof setTimeout>; active: boolean; ignoreClick: boolean }>({ active: false, ignoreClick: false });
  const skippedSegments = useRef(new Set<string>());

  // Spiegel des Zustands für Timer und Tastenbefehle, die nicht bei jedem Render neu entstehen sollen.
  const state = useRef({ session, audioIndex, subtitleIndex, menu, overlay, scrub, time, duration, paused, error });
  state.current = { session, audioIndex, subtitleIndex, menu, overlay, scrub, time, duration, paused, error };

  const report = useCallback((positionSeconds?: number) => {
    const s = state.current;
    const position = positionSeconds ?? engine.current?.position() ?? s.time;
    if (!s.session) return null;
    return {
      itemId: initialItem.Id!,
      session: s.session,
      positionTicks: secondsToTicks(position),
      isPaused: s.paused,
      audioIndex: s.audioIndex,
      subtitleIndex: s.subtitleIndex,
    };
  }, [initialItem.Id]);

  /* ---------- Quelle laden ---------- */

  const load = useCallback(async (options: { startSeconds: number; audioIndex?: number; subtitleIndex?: number; forceTranscode?: boolean }) => {
    setError('');
    const limit = isLocalServer(client.serverUrl) ? settings.maxBitrate : settings.playback.maxBitrateInternet;
    // Das Limit "Maximal" würde große Remux-Dateien in mpv grundlos umwandeln lassen.
    const effectiveBitrate = external && limit === DEFAULT_SETTINGS.maxBitrate ? 1_000_000_000 : limit;
    const previous = report();
    if (previous && !incognito) void client.reportStopped(previous).catch(() => undefined);
    try {
      const firstAudio = state.current.session ? streamsOf(state.current.session.source, 'Audio')[0]?.Index : undefined;
      // Chromium kann im Direct Play die Tonspur nicht wechseln. Eine andere Spur braucht deshalb einen Remux.
      const needsRemux = !external && options.audioIndex !== undefined && firstAudio !== undefined && options.audioIndex !== firstAudio;
      const playback = await client.getPlayback(initialItem.Id!, {
        mediaSourceId: state.current.session?.source.Id ?? undefined,
        audioIndex: options.audioIndex,
        subtitleIndex: options.subtitleIndex,
        forceTranscode: options.forceTranscode || needsRemux,
        maxBitrate: effectiveBitrate,
        maxAudioChannels: settings.audioChannels,
        external,
        dts: settings.tvDts,
      });
      // Der Player wurde geschlossen, während die Anfrage lief.
      if (disposed.current) return;
      setSession(playback);
      state.current.session = playback;
      // Beim ersten Laden gilt die zuletzt gewählte Sprache, sofern es sie in diesem Film gibt.
      const remembered = loadRemembered();
      const streams = playback.source.MediaStreams ?? [];
      const free = engine.current?.canChooseAtStart(playback) ?? false;
      const serverAudio = playback.source.DefaultAudioStreamIndex ?? undefined;
      const serverSubtitle = playback.source.DefaultSubtitleStreamIndex ?? -1;
      const audio = options.audioIndex ?? (free && rememberAudio ? pickRemembered(streams, 'Audio', remembered.audio, serverAudio) : serverAudio);
      const subtitle = options.subtitleIndex ?? (free && rememberSubtitles ? pickRemembered(streams, 'Subtitle', remembered.subtitle, serverSubtitle) ?? -1 : serverSubtitle);
      setAudioIndex(audio);
      setSubtitleIndex(subtitle);
      // Bei mpv erledigt das der Hauptprozess beim Laden.
      if (!external && window.native?.player) {
        await window.native.player.wakeAudio().catch(() => undefined);
        if (disposed.current) return;
      }
      engine.current?.load(playback, options.startSeconds, { audioIndex: audio, subtitleIndex: subtitle });
      const started = report(options.startSeconds);
      if (started && !incognito) void client.reportStart(started).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Wiedergabe konnte nicht gestartet werden.');
      setBuffering(false);
    }
  }, [client, external, incognito, initialItem.Id, rememberAudio, rememberSubtitles, report, settings.maxBitrate, settings.playback.maxBitrateInternet, settings.audioChannels, settings.tvDts]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    disposed.current = false;
    const events: EngineEvents = {
      onPlay: () => setPaused(false),
      onPause: () => setPaused(true),
      onBuffering: setBuffering,
      onTime: (seconds) => {
        setTime(seconds);
        setEnded(false);
      },
      onDuration: setDuration,
      onBuffered: setBuffered,
      onEnded: () => setEnded(true),
      onAudioOutput: setAudioOutput,
      onNotice: setNotice,
      onError: (kind, message) => {
        // Direct Play scheitert an der Datei: Der Server kann sie vielleicht trotzdem liefern.
        if (kind === 'media' && state.current.session?.method === 'DirectPlay') {
          void loadRef.current({ startSeconds: engine.current?.position() ?? 0, audioIndex: state.current.audioIndex, subtitleIndex: state.current.subtitleIndex, forceTranscode: true });
        } else {
          setError(message);
          setBuffering(false);
        }
      },
    };
    engine.current = external
      ? new MpvEngine(events, client, initialItem.Id!, settings.audio.mode === 'passthrough')
      : new Html5Engine(video.current!, events, client, initialItem.Id!);
    const resumeAt = startTicks / TICKS_PER_SECOND;
    const startSeconds = client.mapStartSeconds?.(initialItem.Id!, resumeAt) ?? resumeAt;
    setTime(startSeconds);
    void load({ startSeconds });
    client.getItem(initialItem.Id!).then(setItem).catch(() => undefined);
    client.getSegments(initialItem.Id!).then(setSegments).catch(() => undefined);
    if (initialItem.Type === 'Episode' && initialItem.SeriesId) {
      client.getEpisodes(initialItem.SeriesId, { startItemId: initialItem.Id!, limit: 2 })
        .then((list) => setNextEpisode(list.find((e) => e.Id !== initialItem.Id) ?? null))
        .catch(() => undefined);
    }
    return () => {
      disposed.current = true;
      const last = report();
      state.current.session = null;
      engine.current?.destroy();
      engine.current = null;
      if (last && !incognito) client.reportStopped(last).catch(() => undefined).finally(bumpData);
    };
    // Einmal pro Titel. Für die nächste Folge erzeugt die App eine neue Instanz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fortschritt alle 10 Sekunden melden.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = report();
      if (current && !incognito && !engine.current?.isSeeking()) client.reportProgress(current).catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [client, incognito, report]);

  // Optional in den Vollbildmodus und beim Verlassen zurück.
  useEffect(() => {
    if (external || !settings.fullscreenPlayback) return;
    let entered = false;
    isFullscreen().then((already) => {
      if (!already) {
        entered = true;
        void setFullscreen(true);
      }
    });
    return () => {
      if (entered) void setFullscreen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Untertitel ---------- */

  useEffect(() => {
    if (session) engine.current?.setSubtitle(session.source, subtitleIndex);
  }, [session, subtitleIndex]);

  /* ---------- Aktionen ---------- */

  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = useCallback(() => {
    setOverlay(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!state.current.menu && !state.current.paused) setOverlay(false);
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => clearTimeout(hideTimer.current);
  }, [wake]);

  useEffect(() => {
    if (paused || menu) {
      setOverlay(true);
      clearTimeout(hideTimer.current);
    } else {
      wake();
    }
  }, [paused, menu, wake]);

  const togglePlay = useCallback(() => {
    const current = engine.current;
    if (!current) return;
    if (current.isPaused()) current.play();
    else current.pause();
    wake();
  }, [wake]);

  const seekTo = useCallback((seconds: number) => {
    if (!engine.current) return;
    const limit = state.current.duration || seconds;
    const target = Math.max(0, Math.min(seconds, limit - 1));
    engine.current.seek(target);
    setTime(target);
    setEnded(false);
  }, []);

  // Sammelt Sprünge zuerst als Vorschau, damit schnelles Tippen nur einmal nachlädt.
  const scrubTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudge = useCallback((delta: number) => {
    const base = state.current.scrub ?? state.current.time;
    const limit = state.current.duration || base;
    const next = Math.max(0, Math.min(base + delta, Math.max(limit - 1, 0)));
    state.current.scrub = next;
    setScrub(next);
    wake();
    clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      seekTo(next);
      state.current.scrub = null;
      setScrub(null);
    }, 550);
  }, [seekTo, wake]);

  useEffect(() => () => clearTimeout(scrubTimer.current), []);

  const closeMenu = useCallback((focusButton?: Menu) => {
    setMenu(null);
    requestAnimationFrame(() => {
      const button = focusButton && root.current?.querySelector<HTMLElement>(`[data-menu-button="${focusButton}"]`);
      if (button) focusElement(button, false);
      else if (bar.current) focusElement(bar.current, false);
    });
  }, []);

  const chooseAudio = (stream: Stream) => {
    closeMenu('audio');
    if (stream.Index === audioIndex) return;
    if (rememberAudio && stream.Language) rememberTrack('audio', stream.Language);
    if (engine.current?.canSwitchTracks(session)) {
      engine.current.setAudio(stream.Index!);
      setAudioIndex(stream.Index);
      return;
    }
    void load({ startSeconds: engine.current?.position() ?? time, audioIndex: stream.Index, subtitleIndex });
  };

  const chooseSubtitle = (index: number) => {
    closeMenu('subtitles');
    if (index === subtitleIndex) return;
    const chosen = session?.source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === index);
    if (rememberSubtitles) rememberTrack('subtitle', index === -1 ? 'off' : chosen?.Language ?? 'off');
    if (engine.current?.canSwitchTracks(session)) {
      setSubtitleIndex(index);
      return;
    }
    const stream = session?.source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === index);
    const currentlyBurned = session?.source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === subtitleIndex && !s.IsTextSubtitleStream);
    if ((stream && !stream.IsTextSubtitleStream) || currentlyBurned) {
      // Bilduntertitel brennt der Server ein. Dafür muss der Stream neu gestartet werden.
      void load({ startSeconds: engine.current?.position() ?? time, audioIndex, subtitleIndex: index });
    } else {
      setSubtitleIndex(index);
      const current = report();
      if (current && !incognito) client.reportProgress({ ...current, subtitleIndex: index }).catch(() => undefined);
    }
  };

  const playNext = useCallback(() => {
    if (nextEpisode) replaceTop({ kind: 'player', item: nextEpisode, startTicks: nextEpisode.UserData?.PlaybackPositionTicks ?? 0 });
  }, [nextEpisode, replaceTop]);

  const activeSegment = useMemo(
    () => segments.find((s) => {
      const action = segmentActions[s.Type as SegmentKind];
      return action && action !== 'off' && SEGMENT_LABELS[s.Type ?? ''] && time >= (s.StartTicks ?? 0) / TICKS_PER_SECOND && time < (s.EndTicks ?? 0) / TICKS_PER_SECOND - 1;
    }),
    [segmentActions, segments, time],
  );
  const skipSegment = useCallback(() => {
    if (activeSegment) seekTo((activeSegment.EndTicks ?? 0) / TICKS_PER_SECOND);
  }, [activeSegment, seekTo]);

  // Automatisch überspringen, aber jedes Segment nur einmal: Wer zurückspult, will es sehen.
  useEffect(() => {
    // Beim Start erst warten, bis der Film läuft: Ein früherer Sprung geht im Player verloren.
    if (buffering || !activeSegment || segmentActions[activeSegment.Type as SegmentKind] !== 'skip') return;
    const key = String(activeSegment.StartTicks);
    if (skippedSegments.current.has(key)) return;
    skippedSegments.current.add(key);
    seekTo((activeSegment.EndTicks ?? 0) / TICKS_PER_SECOND);
    setNotice(SEGMENT_LABELS[activeSegment.Type ?? ''].replace('überspringen', 'übersprungen'));
  }, [activeSegment, buffering, seekTo, segmentActions]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const remaining = Math.max(0, duration - time);
  const creditsSegment = segments.find((s) => s.Type === 'Outro');
  const inCredits = creditsSegment ? time >= (creditsSegment.StartTicks ?? 0) / TICKS_PER_SECOND : false;
  const showUpNext = Boolean(nextEpisode) && !upNextDismissed && duration > 0 && (ended || inCredits || remaining < UP_NEXT_SECONDS);

  // Wiedergabeende: nächste Folge starten oder zurück zur Übersicht.
  useEffect(() => {
    if (!ended) return;
    if (nextEpisode && settings.autoplayNext && !upNextDismissed) {
      const timer = setTimeout(playNext, 6000);
      return () => clearTimeout(timer);
    }
    if (!nextEpisode || upNextDismissed) pop();
    return undefined;
  }, [ended, nextEpisode, playNext, pop, settings.autoplayNext, upNextDismissed]);

  /* ---------- Fernbedienungslogik ---------- */

  useEffect(() => pushInterceptor((command) => {
    const s = state.current;
    const inBar = document.activeElement === bar.current;

    if (s.error) {
      if (command === 'back') {
        pop();
        return true;
      }
      return false;
    }

    // Eigene Tasten der Fernbedienung wirken immer, auch bei offenem Menü.
    if (command === 'play') {
      engine.current?.play();
      wake();
      return true;
    }
    if (command === 'pause') {
      engine.current?.pause();
      wake();
      return true;
    }
    if (command === 'stop') {
      pop();
      return true;
    }
    if (command === 'forward' || command === 'rewind') {
      nudge(command === 'forward' ? LONG_SEEK_STEP : -LONG_SEEK_STEP);
      return true;
    }

    if (s.menu) {
      if (command === 'back') {
        closeMenu(s.menu);
        return true;
      }
      if (command === 'playpause') {
        togglePlay();
        return true;
      }
      return false; // Die Pfeile bewegen den Fokus innerhalb des Menüs.
    }

    if (command === 'back') {
      if (s.overlay && (s.paused === false)) {
        setOverlay(false);
        return true;
      }
      pop();
      return true;
    }
    if (command === 'playpause') {
      togglePlay();
      return true;
    }

    if (!s.overlay) {
      wake();
      if (bar.current) focusElement(bar.current, false);
      if (command === 'left') nudge(-seekBack);
      else if (command === 'right') nudge(seekForward);
      else if (command === 'select') {
        const skip = root.current?.querySelector<HTMLElement>('[data-skip-button]');
        if (skip) skip.click();
        else togglePlay();
      }
      return true;
    }

    wake();
    if (inBar) {
      if (command === 'left') { nudge(-seekBack); return true; }
      if (command === 'right') { nudge(seekForward); return true; }
      if (command === 'select') {
        if (s.scrub !== null) {
          clearTimeout(scrubTimer.current);
          seekTo(s.scrub);
          state.current.scrub = null;
          setScrub(null);
        } else {
          togglePlay();
        }
        return true;
      }
    }
    return false;
  }), [closeMenu, nudge, pop, seekBack, seekForward, seekTo, togglePlay, wake]);

  useEffect(() => {
    if (bar.current) focusElement(bar.current, false);
  }, []);

  useEffect(() => {
    if (menu) {
      requestAnimationFrame(() => {
        const list = root.current?.querySelector<HTMLElement>('.player-menu');
        if (list) focusFirstIn(list);
      });
    }
  }, [menu]);

  useEffect(() => {
    engine.current?.setSpeed(speed);
  }, [speed, session]);

  // Bei mpv setzt die Startoption die Lautstärke.
  useEffect(() => {
    if (!external && video.current) video.current.volume = Math.max(0, Math.min(1, volume / 100));
  }, [external, session, volume]);

  // Medientasten auf der Tastatur und das Windows-Overlay.
  useEffect(() => {
    if (!mediaKeys || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: initialItem.Name ?? '',
      artist: initialItem.SeriesName ?? '',
    });
    navigator.mediaSession.setActionHandler('play', () => engine.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => engine.current?.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => nudge(-seekBack));
    navigator.mediaSession.setActionHandler('seekforward', () => nudge(seekForward));
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    };
  }, [initialItem, mediaKeys, nudge, seekBack, seekForward]);

  /* ---------- Tastenkürzel (nur mit Tastatur, die Fernbedienung hat eigene Tasten) ---------- */

  const hotkeyActions = useRef<Record<HotkeyAction, () => void>>(null!);
  hotkeyActions.current = {
    mute: () => {
      loudness.current.muted = !loudness.current.muted;
      engine.current?.setMuted(loudness.current.muted);
      setNotice(loudness.current.muted ? 'Ton aus' : 'Ton an');
    },
    volumeUp: () => changeVolume(5),
    volumeDown: () => changeVolume(-5),
    speedUp: () => changeSpeed(0.25),
    speedDown: () => changeSpeed(-0.25),
    subtitles: () => {
      const first = streamsOf(session?.source, 'Subtitle')[0];
      if (subtitleIndex !== -1) chooseSubtitle(-1);
      else if (first?.Index !== undefined) chooseSubtitle(first.Index);
    },
    next: () => {
      if (nextEpisode) playNext();
    },
    skip: () => root.current?.querySelector<HTMLElement>('[data-skip-button]')?.click(),
  };
  const changeVolume = (delta: number) => {
    const next = Math.max(0, Math.min(130, loudness.current.volume + delta));
    loudness.current.volume = next;
    engine.current?.setVolume(next);
    setNotice(`Lautstärke ${next} %`);
  };
  const changeSpeed = (delta: number) => {
    const next = Math.max(0.25, Math.min(4, speed + delta));
    setSpeed(next);
    setNotice(`Tempo ${next.toLocaleString('de-DE')}×`);
  };

  useEffect(() => {
    if (isTV) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const action = (Object.keys(hotkeys) as HotkeyAction[]).find((name) => hotkeys[name] === key);
      if (!action) return;
      event.preventDefault();
      hotkeyActions.current[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);

  /* ---------- Maus auf dem Bild ---------- */

  const surfaceHandlers = {
    onClick: () => {
      if (boost.current.ignoreClick) {
        boost.current.ignoreClick = false;
        return;
      }
      togglePlay();
    },
    onDoubleClick: async (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const share = (event.clientX - rect.left) / rect.width;
      if (doubleClick === 'seek' && share < 1 / 3) nudge(-seekBack);
      else if (doubleClick === 'seek' && share > 2 / 3) nudge(seekForward);
      else setFullscreen(!(await isFullscreen()));
    },
    onPointerDown: (event: MouseEvent<HTMLElement>) => {
      if (!speedBoost || event.button !== 0) return;
      boost.current.timer = setTimeout(() => {
        boost.current.active = true;
        engine.current?.setSpeed(speedBoost);
        setNotice(`Tempo ${speedBoost.toLocaleString('de-DE')}×`);
      }, 400);
    },
    onPointerUp: () => endBoost(),
    onPointerLeave: () => endBoost(),
  };
  const endBoost = () => {
    clearTimeout(boost.current.timer);
    if (!boost.current.active) return;
    boost.current.active = false;
    boost.current.ignoreClick = true;
    engine.current?.setSpeed(speed);
    setNotice('');
  };

  /* ---------- Bildschirmschoner ---------- */

  useEffect(() => {
    if (screensaver === 'off' || !paused || error) {
      setSaver(false);
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      setSaver(false);
      clearTimeout(timer);
      timer = setTimeout(() => setSaver(true), SAVER_DELAY_MS);
    };
    restart();
    window.addEventListener('pointermove', restart);
    window.addEventListener('keydown', restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', restart);
      window.removeEventListener('keydown', restart);
    };
  }, [error, paused, screensaver]);

  // Uhr oder Logo wandern, damit sich auf OLED-Fernsehern nichts einbrennt.
  useEffect(() => {
    if (!saver) return undefined;
    const update = () => {
      setClock(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      setSaverSpot({ x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 });
    };
    update();
    const timer = setInterval(update, 20_000);
    return () => clearInterval(timer);
  }, [saver]);

  /* ---------- Unterbrechungen ---------- */

  const retry = () => {
    const position = engine.current?.position() ?? 0;
    void load({ startSeconds: position > 0 ? position : time, audioIndex, subtitleIndex });
  };

  useEffect(() => {
    if (error) {
      root.current?.querySelector<HTMLElement>('.player-error [data-autofocus]')?.focus({ preventScroll: true });
    } else if (bar.current && (!document.activeElement || document.activeElement === document.body)) {
      // Der Knopf "Neu laden" ist weg: Die Bedienung geht auf der Zeitleiste weiter.
      focusElement(bar.current, false);
    }
  }, [error]);

  // Lädt das Video gar nicht weiter, hängt der Stream. Pausiert darf es beliebig lange warten.
  useEffect(() => {
    if (!buffering || error || paused) return undefined;
    const timer = setTimeout(() => {
      setError('Der Server liefert das Video gerade nicht.');
      setBuffering(false);
    }, STALL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [buffering, error, paused]);

  /* ---------- Maus auf der Zeitleiste ---------- */

  const barTime = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1)) * duration;
  };

  /* ---------- Darstellung ---------- */

  const previewTime = scrub ?? hoverTime;
  const shownTime = scrub ?? time;
  const progress = duration > 0 ? (shownTime / duration) * 100 : 0;
  const source = session?.source;
  const audioTracks = streamsOf(source, 'Audio');
  const subtitleTracks = streamsOf(source, 'Subtitle');
  const trickplay = source?.Id ? item.Trickplay?.[source.Id] : undefined;
  const trickplayInfo = trickplay ? Object.values(trickplay).sort((a, b) => (a.Width ?? 0) - (b.Width ?? 0)).at(-1) : undefined;
  const isEpisode = item.Type === 'Episode';
  const heading = isEpisode ? item.SeriesName : item.Name;
  const subheading = isEpisode ? `${episodeLabel(item)} · ${item.Name}` : item.ProductionYear ? String(item.ProductionYear) : '';
  const nextThumb = nextEpisode ? landscapeRef(nextEpisode) : null;

  return (
    <div
      className={`player ${external ? 'external' : ''} ${overlay ? 'show-overlay' : 'hide-overlay'}`}
      ref={root}
      data-route-overlay
      onPointerMove={() => {
        setInputMode('mouse');
        wake();
      }}
    >
      {external ? (
        <div className="player-surface" {...surfaceHandlers} />
      ) : (
        <video
          ref={video}
          className="player-video"
          playsInline
          {...surfaceHandlers}
        />
      )}

      {notice && !error && <div className="player-notice" role="status">{notice}</div>}

      {saver && (
        <div className="player-saver" aria-hidden="true">
          <span style={{ left: `${saverSpot.x}%`, top: `${saverSpot.y}%` }}>{screensaver === 'clock' ? clock : <><img className="saver-logo" src={logoUrl} alt="" />Cherryfin</>}</span>
        </div>
      )}

      {buffering && !error && <div className="player-spinner" role="status" aria-label="Lädt"><span /></div>}

      {error && (
        <div className="player-error" role="alert" data-focus-scope>
          <h2>Wiedergabe nicht möglich</h2>
          <p>{error}</p>
          <div className="offline-actions">
            <button type="button" className="btn btn-primary" data-focusable data-autofocus onClick={retry}>Neu laden</button>
            <button type="button" className="btn btn-glass" data-focusable onClick={pop}>Zurück</button>
          </div>
        </div>
      )}

      <div className="player-chrome" aria-hidden={!overlay}>
        <div className="player-shade" />
        <div className="player-bottom">
          <div className="player-info-row">
            <div className="player-titles">
              {subheading && <div className="player-sub">{subheading}</div>}
              <div className="player-title">{heading}</div>
            </div>
            <div className="player-buttons" data-focus-group>
              {subtitleTracks.length > 0 && (
                <div className="menu-anchor">
                  {menu === 'subtitles' && (
                    <div className="player-menu" data-focus-scope role="menu" aria-label="Untertitel">
                      <div className="menu-title">Untertitel</div>
                      <button type="button" className="menu-item" role="menuitemradio" aria-checked={subtitleIndex === -1} data-focusable data-autofocus={subtitleIndex === -1 ? '' : undefined} onClick={() => chooseSubtitle(-1)}>
                        <span className="menu-check">{subtitleIndex === -1 && <CheckIcon />}</span>Aus
                      </button>
                      {subtitleTracks.map((track) => (
                        <button key={track.Index} type="button" className="menu-item" role="menuitemradio" aria-checked={subtitleIndex === track.Index} data-focusable data-autofocus={subtitleIndex === track.Index ? '' : undefined} onClick={() => chooseSubtitle(track.Index!)}>
                          <span className="menu-check">{subtitleIndex === track.Index && <CheckIcon />}</span>{trackLabel(track)}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className={`round-btn ${menu === 'subtitles' ? 'open' : ''}`} data-focusable data-menu-button="subtitles" aria-label="Untertitel" aria-expanded={menu === 'subtitles'} onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')}><SubtitlesIcon /></button>
                </div>
              )}
              {audioTracks.length > 0 && (
                <div className="menu-anchor">
                  {menu === 'audio' && (
                    <div className="player-menu" data-focus-scope role="menu" aria-label="Tonspur">
                      <div className="menu-title">Tonspur</div>
                      {audioTracks.map((track) => (
                        <button key={track.Index} type="button" className="menu-item" role="menuitemradio" aria-checked={audioIndex === track.Index} data-focusable data-autofocus={audioIndex === track.Index ? '' : undefined} onClick={() => chooseAudio(track)}>
                          <span className="menu-check">{audioIndex === track.Index && <CheckIcon />}</span>{trackLabel(track)}
                        </button>
                      ))}
                      {audioOutput && <div className="menu-note" data-audio-output>{audioOutput}</div>}
                    </div>
                  )}
                  <button type="button" className={`round-btn ${menu === 'audio' ? 'open' : ''}`} data-focusable data-menu-button="audio" aria-label="Tonspur" aria-expanded={menu === 'audio'} onClick={() => setMenu(menu === 'audio' ? null : 'audio')}><AudioIcon /></button>
                </div>
              )}
              <div className="menu-anchor">
                {menu === 'speed' && (
                  <div className="player-menu" data-focus-scope role="menu" aria-label="Geschwindigkeit">
                    <div className="menu-title">Geschwindigkeit</div>
                    {SPEEDS.map((value) => (
                      <button key={value} type="button" className="menu-item" role="menuitemradio" aria-checked={speed === value} data-focusable data-autofocus={speed === value ? '' : undefined} onClick={() => { setSpeed(value); closeMenu('speed'); }}>
                        <span className="menu-check">{speed === value && <CheckIcon />}</span>{value === 1 ? 'Normal' : `${value.toLocaleString('de-DE')}×`}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className={`round-btn ${menu === 'speed' ? 'open' : ''}`} data-focusable data-menu-button="speed" aria-label="Geschwindigkeit" aria-expanded={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')}><SpeedIcon /></button>
              </div>
              {nextEpisode && (
                <button type="button" className="round-btn" data-focusable aria-label="Nächste Folge" onClick={playNext}><NextIcon /></button>
              )}
            </div>
          </div>

          <div
            className="scrubber"
            ref={bar}
            tabIndex={0}
            role="slider"
            aria-label="Wiedergabeposition"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(shownTime)}
            aria-valuetext={formatClock(shownTime)}
            data-focusable
            onPointerMove={(e) => setHoverTime(barTime(e))}
            onPointerLeave={() => setHoverTime(null)}
            onClick={(e) => seekTo(barTime(e))}
          >
            {previewTime !== null && duration > 0 && (
              <div className="scrub-preview" style={{ left: `clamp(7rem, ${(previewTime / duration) * 100}%, calc(100% - 7rem))` }}>
                {trickplayInfo && source?.Id && <TrickplayThumb item={item} info={trickplayInfo} mediaSourceId={source.Id} seconds={previewTime} />}
                <span>{formatClock(previewTime)}</span>
              </div>
            )}
            <div className="scrub-track">
              <div className="scrub-buffered" style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }} />
              <div className="scrub-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="scrub-thumb" style={{ left: `${progress}%` }} />
          </div>

          <div className="player-times">
            <span className="player-state">{paused ? <PauseIcon /> : <PlayIcon />}{formatClock(shownTime)}</span>
            <span className="player-ends">{duration > 0 ? `Endet um ${formatEndTime(remaining / speed)}` : ''}</span>
            <span>-{formatClock(Math.max(0, duration - shownTime))}</span>
          </div>
        </div>
      </div>

      {activeSegment && !showUpNext && (
        <button type="button" className="skip-button" data-focusable data-skip-button onClick={skipSegment}>
          {SEGMENT_LABELS[activeSegment.Type ?? '']}
        </button>
      )}

      {showUpNext && nextEpisode && (
        <div className="up-next" role="group" aria-label="Als Nächstes">
          <button type="button" className="up-next-card" data-focusable onClick={playNext}>
            {nextThumb && <img src={client.imageUrl(nextThumb, 480)} alt="" />}
            <span className="up-next-play"><PlayIcon /></span>
          </button>
          <div className="up-next-text">
            <div className="up-next-label">Als Nächstes</div>
            <div className="up-next-title">{nextEpisode.Name}</div>
            <div className="up-next-sub">{episodeLabel(nextEpisode)}</div>
            <button type="button" className="link-btn" data-focusable onClick={() => setUpNextDismissed(true)}>Abspann ansehen</button>
          </div>
        </div>
      )}
    </div>
  );
}
