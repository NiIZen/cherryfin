import { useState } from 'react';
import { BackspaceIcon, SpaceIcon } from './Icons';

const ROWS = ['1234567890', 'qwertzuiop', 'asdfghjkl', 'yxcvbnm', '.:/-_@'];

/**
 * Tastatur auf dem Bildschirm für die Eingabe per Fernbedienung. Sie bleibt in der App, statt
 * das System-Keyboard des Fernsehers zu öffnen, dessen Verhalten sich je nach Modell unterscheidet.
 */
export function TvKeyboard({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [upper, setUpper] = useState(false);

  return (
    <div className="tv-keyboard" data-focus-group aria-label="Bildschirmtastatur">
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
        <button type="button" className="key key-space" data-focusable aria-label="Leerzeichen" onClick={() => onChange(`${value} `)}><SpaceIcon /></button>
        <button type="button" className="key key-wide" data-focusable data-key="backspace" aria-label="Löschen" onClick={() => onChange(value.slice(0, -1))}><BackspaceIcon /></button>
      </div>
    </div>
  );
}
