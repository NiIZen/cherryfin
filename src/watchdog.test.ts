import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineEvents, MpvEngine as MpvEngineType } from './player/engines';
// @ts-expect-error Der Hauptprozess ist reines CommonJS ohne Typen.
import { wakeArgs } from '../electron/mpv.cjs';

type Listener = (event: Record<string, unknown>) => void;

/** Nachgestellte Brücke zum Hauptprozess. Sie merkt sich die Befehle und reicht mpv-Ereignisse weiter. */
function setup() {
  const commands: string[] = [];
  const loads: Array<[string, number]> = [];
  let emit: Listener = () => undefined;
  vi.stubGlobal('window', {
    native: {
      player: {
        onEvent: (listener: Listener) => {
          emit = listener;
          return () => undefined;
        },
        command: async (name: string) => {
          commands.push(name);
        },
        load: async (url: string, start: number) => {
          loads.push([url, start]);
          return true;
        },
      },
    },
    location: { href: 'http://test/' },
  });
  const events = {
    onPlay: vi.fn(), onPause: vi.fn(), onBuffering: vi.fn(), onTime: vi.fn(), onDuration: vi.fn(),
    onBuffered: vi.fn(), onEnded: vi.fn(), onError: vi.fn(), onAudioOutput: vi.fn(), onNotice: vi.fn(),
  } satisfies EngineEvents;
  return { commands, loads, events, emit: (event: Record<string, unknown>) => emit(event) };
}

const property = (name: string, value: unknown) => ({ type: 'property', name, value });

describe('Wächter gegen die stehende Audio-Uhr', () => {
  let engine: MpvEngineType;
  let t: ReturnType<typeof setup>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = setup();
    const { MpvEngine } = await import('./player/engines');
    engine = new MpvEngine(t.events, {} as never, 'item');
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const restart = () => t.emit({ type: 'playback-restart' });

  it('greift vor dem Start des Films nicht ein', () => {
    vi.advanceTimersByTime(10_000);
    expect(t.commands).toEqual([]);
  });

  it('startet bei stehender Zeit die Audioausgabe neu und wechselt zuletzt auf exklusiv', () => {
    restart();
    vi.advanceTimersByTime(2600);
    expect(t.commands).toEqual(['reload-audio']);
    vi.advanceTimersByTime(4100);
    expect(t.commands).toEqual(['reload-audio', 'reload-audio', 'exclusive-audio']);
    expect(t.events.onNotice).toHaveBeenCalledOnce();
  });

  it('meldet einen Fehler, wenn nichts hilft, und gibt dann Ruhe', () => {
    restart();
    vi.advanceTimersByTime(30_000);
    expect(t.commands).toHaveLength(4);
    expect(t.events.onError).toHaveBeenCalledOnce();
    expect(t.events.onError.mock.calls[0][0]).toBe('fatal');
  });

  it('bleibt still, solange die Zeit läuft', () => {
    restart();
    for (let second = 1; second <= 20; second++) {
      t.emit(property('time-pos', second));
      vi.advanceTimersByTime(1000);
    }
    expect(t.commands).toEqual([]);
  });

  it('zählt von vorn, wenn der Film wieder läuft', () => {
    restart();
    vi.advanceTimersByTime(2600);
    t.emit(property('time-pos', 1));
    vi.advanceTimersByTime(2600);
    t.emit(property('time-pos', 2));
    vi.advanceTimersByTime(2600);
    expect(t.commands).toEqual(['reload-audio', 'reload-audio', 'reload-audio']);
  });

  it('wertet Pause nicht als Hänger', () => {
    restart();
    t.emit(property('pause', true));
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });

  it('wertet Nachladen nicht als Hänger', () => {
    restart();
    t.emit(property('paused-for-cache', true));
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });

  it('hört am Ende des Films auf', () => {
    restart();
    t.emit({ type: 'end-file', reason: 'eof' });
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });
});

describe('Passthrough auf einem Gerät, das es nicht kann', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lädt nach einem gescheiterten Start mit PCM neu und nennt den Grund', async () => {
    vi.useFakeTimers();
    const t = setup();
    const { MpvEngine } = await import('./player/engines');
    const engine = new MpvEngine(t.events, {} as never, 'item', true);
    engine.load({ url: 'http://server/film', source: {}, method: 'DirectPlay' } as never, 12, { subtitleIndex: -1 });
    t.emit({ type: 'audio-failed' });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.commands).toContain('pcm-audio');
    expect(t.loads.at(-1)).toEqual(['http://server/film', 12]);
    expect(t.events.onNotice.mock.calls[0][0]).toContain('Passthrough');
    // Ein zweites Mal gibt es keinen Grund: Passthrough ist für diesen Film aus.
    t.emit({ type: 'audio-failed' });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.commands.filter((name) => name === 'pcm-audio')).toHaveLength(1);
    engine.destroy();
  });

  it('lässt laufendes Passthrough in Ruhe', async () => {
    vi.useFakeTimers();
    const t = setup();
    const { MpvEngine } = await import('./player/engines');
    const engine = new MpvEngine(t.events, {} as never, 'item', true);
    t.emit({ type: 'playback-restart' });
    t.emit({ type: 'property', name: 'audio-out-params', value: { format: 'spdif-ac3', 'hr-channels': 'stereo', samplerate: 48000 } });
    vi.advanceTimersByTime(2600);
    expect(t.commands).toEqual(['reload-audio']);
    engine.destroy();
  });
});

describe('Aufwecken des Audiogeräts', () => {
  it('öffnet das gewählte Gerät mit Stille', () => {
    const args = wakeArgs('wasapi/{abc-123}');
    expect(args).toContain('--audio-device=wasapi/{abc-123}');
    expect(args).toContain('--vo=null');
    expect(args.at(-1)).toContain('anullsrc');
  });
  it('lässt fremde Gerätenamen nicht durch', () => {
    expect(wakeArgs('--script=boese.lua').join(' ')).not.toContain('boese');
  });
});
