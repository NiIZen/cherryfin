import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models';

type CanPlay = (mime: string) => boolean;

/** Fragt Chromium, was dieses Gerät wirklich dekodieren kann (HEVC und AV1 hängen an der Hardware). */
export function browserCanPlay(mime: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.createElement('video').canPlayType(mime) !== '';
}

/**
 * Profil für webOS: Der Fernseher spielt über seine eigene Hardware auch MKV, HEVC und Dolby ab.
 * DTS fehlt vielen LG-Modellen, darum nur auf Wunsch. Ohne Unterstützung wandelt der Server den Ton um.
 */
export function buildWebOSProfile(maxBitrate: number, maxAudioChannels = 6, dts = false): DeviceProfile {
  const video = 'h264,hevc,vp9,av1';
  const audio = ['aac', 'mp3', 'ac3', 'eac3', 'opus', 'flac', 'vorbis', ...(dts ? ['dts', 'dca'] : [])].join(',');
  return {
    Name: 'Cherryfin (webOS)',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: maxBitrate,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mov,mkv,webm,ts,m2ts', Type: 'Video', VideoCodec: video, AudioCodec: audio },
    ],
    TranscodingProfiles: [
      {
        Container: 'ts',
        Type: 'Video',
        Protocol: 'hls',
        Context: 'Streaming',
        VideoCodec: 'h264,hevc',
        AudioCodec: 'ac3,eac3,aac',
        MaxAudioChannels: String(maxAudioChannels),
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      ...['vtt', 'srt', 'subrip', 'ass', 'ssa', 'mov_text', 'webvtt'].map((Format) => ({ Format, Method: 'External' as const })),
      ...['pgs', 'pgssub', 'dvdsub', 'dvbsub', 'sub', 'idx'].map((Format) => ({ Format, Method: 'Encode' as const })),
    ],
  };
}

/**
 * Profil für mpv: Es spielt praktisch jeden Container und Codec direkt ab, auch MKV, DTS und
 * TrueHD. Der Server wandelt nur noch um, wenn die Bitrate über dem eingestellten Limit liegt.
 */
export function buildExternalPlayerProfile(maxBitrate: number, maxAudioChannels = 8): DeviceProfile {
  return {
    Name: 'Cherryfin (mpv)',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: maxBitrate,
    DirectPlayProfiles: [{ Type: 'Video' }],
    TranscodingProfiles: [
      {
        Container: 'ts',
        Type: 'Video',
        Protocol: 'hls',
        Context: 'Streaming',
        VideoCodec: 'h264,hevc',
        AudioCodec: 'eac3,ac3,aac',
        MaxAudioChannels: String(maxAudioChannels),
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    // Eingebettete Untertitel liest mpv selbst, auch Bildformate. Eingebrannt wird nichts.
    SubtitleProfiles: [
      ...['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'mov_text', 'pgs', 'pgssub', 'dvdsub', 'dvbsub', 'sub', 'idx'].map((Format) => ({ Format, Method: 'Embed' as const })),
      ...['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt'].map((Format) => ({ Format, Method: 'External' as const })),
    ],
  };
}

/**
 * Beschreibt dem Server, was der Player kann. Der Server entscheidet damit über Direct Play,
 * Remux oder Transkodierung. MKV spielt Chromium nicht direkt ab, solche Dateien kommen deshalb
 * als HLS an und werden, wenn möglich, nur umverpackt (Stream-Copy).
 */
export function buildDeviceProfile(maxBitrate: number, canPlay: CanPlay = browserCanPlay, maxAudioChannels = 6): DeviceProfile {
  const videoCodecs = ['h264'];
  if (canPlay('video/mp4; codecs="hvc1.1.6.L120.90"')) videoCodecs.push('hevc');
  if (canPlay('video/mp4; codecs="av01.0.08M.08"')) videoCodecs.push('av1');
  if (canPlay('video/webm; codecs="vp9"')) videoCodecs.push('vp9');

  const mp4Audio = ['aac', 'mp3', 'flac', 'opus'];
  const hlsVideo = videoCodecs.filter((codec) => codec === 'h264' || codec === 'hevc');

  return {
    Name: 'Cherryfin',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: maxBitrate,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mov', Type: 'Video', VideoCodec: videoCodecs.filter((c) => c !== 'vp9').join(','), AudioCodec: mp4Audio.join(',') },
      { Container: 'webm', Type: 'Video', VideoCodec: videoCodecs.filter((c) => c === 'vp9' || c === 'av1').join(','), AudioCodec: 'opus,vorbis' },
    ],
    TranscodingProfiles: [
      {
        Container: 'mp4',
        Type: 'Video',
        Protocol: 'hls',
        Context: 'Streaming',
        VideoCodec: hlsVideo.join(','),
        AudioCodec: 'aac,mp3',
        MaxAudioChannels: String(maxAudioChannels),
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: 'ts',
        Type: 'Video',
        Protocol: 'hls',
        Context: 'Streaming',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
        MaxAudioChannels: String(maxAudioChannels),
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      // Textformate liefert der Server als WebVTT aus, Bildformate brennt er beim Transkodieren ein.
      ...['vtt', 'srt', 'subrip', 'ass', 'ssa', 'mov_text', 'webvtt'].map((Format) => ({ Format, Method: 'External' as const })),
      ...['pgs', 'pgssub', 'dvdsub', 'dvbsub', 'sub', 'idx'].map((Format) => ({ Format, Method: 'Encode' as const })),
    ],
  };
}
