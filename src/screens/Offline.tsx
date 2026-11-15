import { useEffect, useRef, useState } from 'react';
import { pushInterceptor } from '../focus/engine';
import { ServerIcon } from '../ui/Icons';

interface OfflineScreenProps {
  serverName: string;
  serverUrl: string;
  onRetry: () => Promise<boolean>;
  onSignOut: () => void;
}

/** Liegt über allem, solange der Server nicht antwortet. Im Hintergrund läuft die Prüfung weiter. */
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
    // Bei Erfolg verschwindet dieser Screen von selbst.
    if (!ok) {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div className="offline" data-focus-scope role="alertdialog" aria-labelledby="offline-title">
      <div className="offline-icon"><ServerIcon /></div>
      <h1 id="offline-title">Keine Verbindung</h1>
      <p>„{serverName}“ antwortet gerade nicht. Prüfe dein Netzwerk und ob der Server läuft.</p>
      <p className="offline-hint">{failed ? 'Immer noch keine Antwort. ' : ''}Cherryfin versucht es automatisch weiter.</p>
      <div className="offline-actions">
        <button type="button" className="btn btn-primary" ref={button} data-focusable disabled={busy} onClick={retry}>
          {busy ? 'Verbinde …' : 'Neu laden'}
        </button>
        <button type="button" className="btn btn-glass" data-focusable onClick={onSignOut}>Abmelden</button>
      </div>
      <p className="offline-url">{serverUrl}</p>
    </div>
  );
}
