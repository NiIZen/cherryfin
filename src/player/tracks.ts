import type { Stream } from '../api/types';

export interface MpvTrack {
  id: number;
  type: 'video' | 'audio' | 'sub' | string;
  external?: boolean;
  'ff-index'?: number;
}

const TYPE_NAMES: Record<string, string> = { Audio: 'audio', Subtitle: 'sub' };

/**
 * Findet zu einer Jellyfin-Spur die passende mpv-Spur. Jellyfin zählt alle Streams der Datei
 * durch, mpv zählt je Typ. Am sichersten ist der FFmpeg-Index, sonst zählt die Reihenfolge.
 */
export function findMpvTrack(stream: Stream, tracks: MpvTrack[], streams: Stream[]): number | null {
  const type = TYPE_NAMES[stream.Type ?? ''];
  if (!type || stream.IsExternal) return null;
  const embedded = tracks.filter((track) => track.type === type && !track.external);
  const exact = embedded.find((track) => track['ff-index'] === stream.Index);
  if (exact) return exact.id;
  const position = streams.filter((s) => s.Type === stream.Type && !s.IsExternal).findIndex((s) => s.Index === stream.Index);
  return embedded[position]?.id ?? null;
}

const PASSTHROUGH_NAMES: Record<string, string> = {
  ac3: 'Dolby Digital',
  eac3: 'Dolby Digital Plus',
  truehd: 'Dolby TrueHD',
  dts: 'DTS',
  'dts-hd': 'DTS-HD',
  dtshd: 'DTS-HD',
};

export interface AudioParams {
  format?: string;
  'hr-channels'?: string;
  channels?: string;
  'channel-count'?: number;
}

/** Klartext für das Tonspur-Menü: Geht der Ton unverändert an den Receiver oder als PCM? */
export function describeAudioOutput(output: AudioParams | null | undefined): string {
  if (!output?.format) return '';
  if (output.format.startsWith('spdif-')) {
    const codec = output.format.slice('spdif-'.length);
    return `Passthrough: ${PASSTHROUGH_NAMES[codec] ?? codec}`;
  }
  const layout = output['hr-channels'] ?? output.channels ?? '';
  return `PCM${layout ? `: ${layout}` : ''}`;
}
