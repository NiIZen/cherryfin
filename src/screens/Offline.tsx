import { useEffect, useRef, useState } from 'react';
import { pushInterceptor } from '../focus/engine';
import { ServerIcon } from '../ui/Icons';
import { t } from '../i18n';

interface OfflineScreenProps {
  serverName: string;
  serverUrl: string;
  onRetry: () => Promise<boolean>;
  onSignOut: () => void;
}

/** Lies on top of everything while the server does not respond. Checking continues in the background. */
export function OfflineScreen({ serverName, serverUrl, onRetry, onSignOut }: OfflineScreenProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus({ preventScroll: true });
    const release = pushInterceptor((command) => command === 'back');
    return () => {
      release();
      if (previous && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const retry = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onRetry();
    // On success this screen disappears by itself.
    if (!ok) {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div className="offline" data-focus-scope role="alertdialog" aria-labelledby="offline-title">
      <div className="offline-icon"><ServerIcon /></div>
      <h1 id="offline-title">{t('No connection')}</h1>
      <p>{t('“{name}” is not responding right now. Check your network and whether the server is running.', { name: serverName })}</p>
      <p className="offline-hint">{failed ? `${t('Still no response.')} ` : ''}{t('Cherryfin keeps trying automatically.')}</p>
      <div className="offline-actions">
        <button type="button" className="btn btn-primary" ref={button} data-focusable disabled={busy} onClick={retry}>
          {busy ? t('Connecting …') : t('Reload')}
        </button>
        <button type="button" className="btn btn-glass" data-focusable onClick={onSignOut}>{t('Sign out')}</button>
      </div>
      <p className="offline-url">{serverUrl}</p>
    </div>
  );
}
