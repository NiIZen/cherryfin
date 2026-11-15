import { useApp } from '../app/context';

/** Meldung für einen Inhalt, der nicht geladen werden konnte, oder eine leere Seite. */
export function RetryMessage({ title, message }: { title: string; message?: string }) {
  const { reload } = useApp();
  return (
    <div className="screen-message">
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      <button type="button" className="btn btn-primary" data-focusable onClick={reload}>Neu laden</button>
    </div>
  );
}
