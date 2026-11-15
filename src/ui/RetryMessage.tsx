import { useApp } from '../app/context';
import { t } from '../i18n';

/** Message for content that could not be loaded, or an empty page. Callers pass translated texts. */
export function RetryMessage({ title, message }: { title: string; message?: string }) {
  const { reload } = useApp();
  return (
    <div className="screen-message">
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      <button type="button" className="btn btn-primary" data-focusable onClick={reload}>{t('Reload')}</button>
    </div>
  );
}
