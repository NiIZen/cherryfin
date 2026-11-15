import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineEvents, MpvEngine as MpvEngineType } from './player/engines';
// @ts-expect-error The main process is plain CommonJS without types.
import { wakeArgs } from '../electron/mpv.cjs';

type Listener = (event: Record<string, unknown>) => void;

/** Stand-in for the bridge to the main process. It records commands and passes mpv events on. */
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

describe('Watchdog for a stalled audio clock', () => {
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

  it('does not step in before playback starts', () => {
    vi.advanceTimersByTime(10_000);
    expect(t.commands).toEqual([]);
  });

  it('restarts audio output when the time stands still and switches to exclusive last', () => {
    restart();
    vi.advanceTimersByTime(2600);
    expect(t.commands).toEqual(['reload-audio']);
    vi.advanceTimersByTime(4100);
    expect(t.commands).toEqual(['reload-audio', 'reload-audio', 'exclusive-audio']);
    expect(t.events.onNotice).toHaveBeenCalledOnce();
  });

  it('reports an error when nothing helps, then stays quiet', () => {
    restart();
    vi.advanceTimersByTime(30_000);
    expect(t.commands).toHaveLength(4);
    expect(t.events.onError).toHaveBeenCalledOnce();
    expect(t.events.onError.mock.calls[0][0]).toBe('fatal');
  });

  it('stays quiet while the time runs', () => {
    restart();
    for (let second = 1; second <= 20; second++) {
      t.emit(property('time-pos', second));
      vi.advanceTimersByTime(1000);
    }
    expect(t.commands).toEqual([]);
  });

  it('starts counting again once playback runs', () => {
    restart();
    vi.advanceTimersByTime(2600);
    t.emit(property('time-pos', 1));
    vi.advanceTimersByTime(2600);
    t.emit(property('time-pos', 2));
    vi.advanceTimersByTime(2600);
    expect(t.commands).toEqual(['reload-audio', 'reload-audio', 'reload-audio']);
  });

  it('does not count pause as a stall', () => {
    restart();
    t.emit(property('pause', true));
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });

  it('does not count buffering as a stall', () => {
    restart();
    t.emit(property('paused-for-cache', true));
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });

  it('stops at the end of the title', () => {
    restart();
    t.emit({ type: 'end-file', reason: 'eof' });
    vi.advanceTimersByTime(20_000);
    expect(t.commands).toEqual([]);
  });
});

describe('Passthrough on a device that cannot do it', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reloads with PCM after a failed start and states the reason', async () => {
    vi.useFakeTimers();
    const t = setup();
    const { MpvEngine } = await import('./player/engines');
    const engine = new MpvEngine(t.events, {} as never, 'item', true);
    engine.load({ url: 'http://server/film', source: {}, method: 'DirectPlay' } as never, 12, { subtitleIndex: -1 });
    t.emit({ type: 'audio-failed' });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.commands).toContain('pcm-audio');
    expect(t.loads.at(-1)).toEqual(['http://server/film', 12]);
    expect(t.events.onNotice.mock.calls[0][0]).toContain('passthrough');
    // No reason a second time: passthrough is off for this title.
    t.emit({ type: 'audio-failed' });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.commands.filter((name) => name === 'pcm-audio')).toHaveLength(1);
    engine.destroy();
  });

  it('leaves running passthrough alone', async () => {
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

describe('Waking the audio device', () => {
  it('opens the chosen device with silence', () => {
    const args = wakeArgs('wasapi/{abc-123}');
    expect(args).toContain('--audio-device=wasapi/{abc-123}');
    expect(args).toContain('--vo=null');
    expect(args.at(-1)).toContain('anullsrc');
  });
  it('lets no foreign device names through', () => {
    expect(wakeArgs('--script=evil.lua').join(' ')).not.toContain('evil');
  });
});
