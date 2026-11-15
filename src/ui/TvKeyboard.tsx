import { useState } from 'react';
import { BackspaceIcon, SpaceIcon } from './Icons';
import { t } from '../i18n';

const ROWS = ['1234567890', 'qwertzuiop', 'asdfghjkl', 'yxcvbnm', '.:/-_@'];

/**
 * On-screen keyboard for typing with the remote. It stays inside the app instead of opening the
 * TV's system keyboard, whose behavior differs from model to model.
 */
export function TvKeyboard({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [upper, setUpper] = useState(false);

  return (
    <div className="tv-keyboard" data-focus-group aria-label={t('On-screen keyboard')}>
      {ROWS.map((row) => (
        <div key={row} className="tv-keyboard-row">
          {row.split('').map((char) => {
            const shown = upper ? char.toUpperCase() : char;
            return (
              <button key={char} type="button" className="key" data-focusable data-key={char} onClick={() => onChange(value + shown)}>
                {shown}
              </button>
            );
          })}
        </div>
      ))}
      <div className="tv-keyboard-row">
        <button type="button" className={`key key-wide ${upper ? 'key-on' : ''}`} data-focusable aria-pressed={upper} onClick={() => setUpper((v) => !v)}>
          ABC
        </button>
        <button type="button" className="key key-space" data-focusable aria-label={t('Space')} onClick={() => onChange(`${value} `)}><SpaceIcon /></button>
        <button type="button" className="key key-wide" data-focusable data-key="backspace" aria-label={t('Delete')} onClick={() => onChange(value.slice(0, -1))}><BackspaceIcon /></button>
      </div>
    </div>
  );
}
