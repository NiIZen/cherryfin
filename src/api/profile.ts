import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models';

type CanPlay = (mime: string) => boolean;

/** Asks Chromium what this device can really decode (HEVC and AV1 depend on the hardware). */
export function browserCanPlay(mime: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.createElement('video').canPlayType(mime) !== '';
}

/**
 * Profile for webOS: the TV plays MKV, HEVC and Dolby through its own hardware.
 * Many LG models lack DTS, so it is opt-in. Without support the server converts the audio.
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
 * Profile for mpv: it plays practically every container and codec directly, including MKV, DTS and
 * TrueHD. The server only converts when the bitrate is above the configured limit.
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
    // mpv reads embedded subtitles itself, image formats included. Nothing is burned in.
    SubtitleProfiles: [
      ...['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'mov_text', 'pgs', 'pgssub', 'dvdsub', 'dvbsub', 'sub', 'idx'].map((Format) => ({ Format, Method: 'Embed' as const })),
      ...['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt'].map((Format) => ({ Format, Method: 'External' as const })),
    ],
  };
}

/**
 * Tells the server what the player can do. The server uses it to choose direct play, remux or
 * transcoding. Chromium does not play MKV directly, so such files arrive as HLS and are only
 * repackaged (stream copy) when possible.
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
      // The server delivers text formats as WebVTT and burns image formats in when transcoding.
      ...['vtt', 'srt', 'subrip', 'ass', 'ssa', 'mov_text', 'webvtt'].map((Format) => ({ Format, Method: 'External' as const })),
      ...['pgs', 'pgssub', 'dvdsub', 'dvbsub', 'sub', 'idx'].map((Format) => ({ Format, Method: 'Encode' as const })),
    ],
  };
}
