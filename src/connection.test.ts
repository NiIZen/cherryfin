import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, JellyfinClient } from './api/jellyfin';
import { buildDeviceProfile } from './api/profile';

const session = { serverUrl: 'http://srv:8096', serverName: 'Test', token: 'tok', user: { Id: 'u1', Name: 'Test' } };

describe('Connection errors', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => 'geraet', setItem: () => undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports a network error and throws an understandable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const client = new JellyfinClient(session);
    const issue = vi.fn();
    client.onConnectionIssue = issue;
    const error = await client.getViews().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain('cannot be reached');
    expect(issue).toHaveBeenCalledOnce();
  });

  it('reports a request that hangs too long before the timeout', async () => {
    vi.useFakeTimers();
    let finish: (value: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const client = new JellyfinClient(session);
    const issue = vi.fn();
    client.onConnectionIssue = issue;
    const pending = client.getViews();
    await vi.advanceTimersByTimeAsync(5900);
    expect(issue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(issue).toHaveBeenCalledOnce();
    finish(new Response(JSON.stringify({ Items: [] })));
    await expect(pending).resolves.toEqual([]);
  });

  it('reports no connection error for fast responses', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ Items: [] }))));
    const client = new JellyfinClient(session);
    const issue = vi.fn();
    client.onConnectionIssue = issue;
    await client.getViews();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(issue).not.toHaveBeenCalled();
  });

  it('treats 401 as an expired sign-in, not as a connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const client = new JellyfinClient(session);
    const issue = vi.fn();
    const unauthorized = vi.fn();
    client.onConnectionIssue = issue;
    client.onUnauthorized = unauthorized;
    await expect(client.getViews()).rejects.toThrow();
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(issue).not.toHaveBeenCalled();
  });

  it('cancels hanging requests without reporting an outage', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const client = new JellyfinClient(session);
    const issue = vi.fn();
    client.onConnectionIssue = issue;
    const pending = client.getViews().catch((e) => e);
    client.cancelPending();
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain('cancelled');
    expect(issue).not.toHaveBeenCalled();
  });

  it('does not cancel reports to the server', async () => {
    let settled = false;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => { settled = true; reject(new DOMException('aborted', 'AbortError')); });
      setTimeout(() => resolve(new Response(null, { status: 204 })), 20);
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new JellyfinClient(session);
    const pending = client.setFavorite('i1', true);
    client.cancelPending();
    await pending;
    expect(settled).toBe(false);
  });

  it('reports successful responses so an outage message can disappear right away', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ Items: [] }))));
    const client = new JellyfinClient(session);
    const ok = vi.fn();
    client.onConnectionOk = ok;
    await client.getViews();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('does not take data from the browser cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await new JellyfinClient(session).getViews();
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('checks reachability', async () => {
    const client = new JellyfinClient(session);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.checkConnection()).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(client.checkConnection()).resolves.toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(client.checkConnection()).resolves.toBe(false);
  });

  it('sends the chosen channel count to the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ PlaySessionId: 'p', MediaSources: [{ Id: 'm', SupportsDirectPlay: true }] })));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => '' }) });
    await new JellyfinClient(session).getPlayback('i1', { maxAudioChannels: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.MaxAudioChannels).toBe(2);
    expect(body.DeviceProfile.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
  });
});

describe('Audio channels in the device profile', () => {
  it('allows up to 5.1 by default', () => {
    expect(buildDeviceProfile(1, () => false).TranscodingProfiles?.every((p) => p.MaxAudioChannels === '6')).toBe(true);
  });
  it('limits to stereo', () => {
    expect(buildDeviceProfile(1, () => false, 2).TranscodingProfiles?.every((p) => p.MaxAudioChannels === '2')).toBe(true);
  });
});
