import { useEffect, useRef, useState } from 'react';
import logoUrl from '../../branding/cherryfin.svg';
import { findServer, getPublicUsers, publicUserImage, signIn, type Session } from '../api/jellyfin';
import type { User } from '../api/types';
import { focusWhenReady } from '../focus/engine';
import { Picture, tiltHandlers } from '../ui/Card';
import { ChevronRight, PlusIcon, ServerIcon } from '../ui/Icons';
import { TvKeyboard } from '../ui/TvKeyboard';
import { isTV } from '../tv/platform';

type Step = 'server' | 'users' | 'password';
interface Server { url: string; name: string }
interface Discovered { id: string; name: string; address: string }

function errorText(error: unknown): string {
  if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')) {
    return 'Der Server ist nicht erreichbar. Stimmen Adresse und Port?';
  }
  return error instanceof Error ? error.message : 'Unbekannter Fehler';
}

/** Am Computer ein normales Eingabefeld. Auf dem Fernseher ein Knopf, die Eingabe läuft über die Bildschirmtastatur. */
function Field({ value, placeholder, label, secret, autoFocus, active, autoComplete, onChange, onActivate }: {
  value: string;
  placeholder: string;
  label: string;
  secret?: boolean;
  autoFocus?: boolean;
  active?: boolean;
  autoComplete?: string;
  onChange: (value: string) => void;
  onActivate?: () => void;
}) {
  if (isTV) {
    return (
      <button type="button" className={`text-field tv-field ${active ? 'active' : ''}`} data-focusable data-autofocus={autoFocus ? '' : undefined} aria-label={label} onClick={onActivate} onFocus={onActivate}>
        {value ? (secret ? '•'.repeat(value.length) : value) : <span className="tv-placeholder">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      className="text-field"
      data-focusable
      data-autofocus={autoFocus ? '' : undefined}
      type={secret ? 'password' : 'text'}
      placeholder={placeholder}
      aria-label={label}
      value={value}
      autoComplete={autoComplete ?? 'off'}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ConnectScreen({ onSession, onDemo }: { onSession: (session: Session) => void | Promise<void>; onDemo: () => void }) {
  const [step, setStep] = useState<Step>('server');
  const [address, setAddress] = useState(() => localStorage.getItem('jellytv.lastServer') ?? '');
  const [server, setServer] = useState<Server | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [field, setField] = useState<'username' | 'password'>('username');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.native?.discover().then(setDiscovered).catch(() => undefined);
  }, []);

  useEffect(() => (root.current ? focusWhenReady(root.current) : undefined), [step]);

  const connect = async (input: string) => {
    setBusy(true);
    setError('');
    try {
      const found = await findServer(input);
      localStorage.setItem('jellytv.lastServer', found.url);
      setServer(found);
      const list = await getPublicUsers(found.url);
      setUsers(list);
      if (list.length) {
        setStep('users');
      } else {
        setUsernameLocked(false);
        setStep('password');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const login = async (name: string, pass: string) => {
    if (!server) return;
    setBusy(true);
    setError('');
    try {
      await onSession(await signIn(server.url, server.name, name, pass));
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const chooseUser = (user: User) => {
    setUsername(user.Name ?? '');
    setPassword('');
    setError('');
    if (user.HasPassword === false) {
      void login(user.Name ?? '', '');
    } else {
      setUsernameLocked(true);
      setStep('password');
    }
  };

  return (
    <div className="connect" ref={root}>
      <div className="connect-glow" aria-hidden="true" />

      {step === 'server' && (
        <form className="connect-panel" onSubmit={(e) => { e.preventDefault(); void connect(address); }}>
          <img className="connect-logo" src={logoUrl} alt="" />
          <h1>Cherryfin</h1>
          <p className="connect-lead">Verbinde dich mit deinem Jellyfin-Server.</p>
          {discovered.length > 0 && (
            <div className="connect-list">
              {discovered.map((d) => (
                <button key={d.id} type="button" className="list-row" data-focusable onClick={() => void connect(d.address)}>
                  <ServerIcon /><span className="list-row-title">{d.name}</span><span className="list-row-value">{d.address}</span><ChevronRight />
                </button>
              ))}
            </div>
          )}
          <Field value={address} placeholder="z. B. 192.168.1.20:8096" label="Serveradresse" autoFocus active onChange={setAddress} />
          {isTV && <TvKeyboard value={address} onChange={setAddress} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="connect-actions">
            <button type="submit" className="btn btn-primary" data-focusable disabled={busy}>{busy ? 'Verbinde …' : 'Verbinden'}</button>
            <button type="button" className="btn btn-glass" data-focusable onClick={onDemo}>Demo ansehen</button>
          </div>
        </form>
      )}

      {step === 'users' && server && (
        <div className="connect-panel wide">
          <h1>Wer schaut gerade?</h1>
          <p className="connect-lead">{server.name}</p>
          <div className="user-grid" data-focus-group>
            {users.map((user) => (
              <button key={user.Id} type="button" className="card card-user" data-focusable aria-label={user.Name ?? undefined} onClick={() => chooseUser(user)} {...tiltHandlers()}>
                <div className="card-media">
                  {user.PrimaryImageTag
                    ? <Picture src={publicUserImage(server.url, user, 320)} alt={user.Name ?? ''} />
                    : <div className="avatar-letter">{(user.Name ?? '?').charAt(0).toUpperCase()}</div>}
                  <div className="card-shine" />
                </div>
                <div className="card-caption"><div className="card-title">{user.Name}</div></div>
              </button>
            ))}
            <button type="button" className="card card-user" data-focusable aria-label="Anderer Benutzer" onClick={() => { setUsername(''); setPassword(''); setUsernameLocked(false); setStep('password'); }} {...tiltHandlers()}>
              <div className="card-media"><div className="avatar-letter muted"><PlusIcon /></div><div className="card-shine" /></div>
              <div className="card-caption"><div className="card-title">Anderer</div></div>
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-glass connect-back" data-focusable onClick={() => setStep('server')}>Anderer Server</button>
        </div>
      )}

      {step === 'password' && server && (
        <form className="connect-panel" onSubmit={(e) => { e.preventDefault(); void login(username, password); }}>
          <h1>{usernameLocked ? username : 'Anmelden'}</h1>
          <p className="connect-lead">{server.name}</p>
          {!usernameLocked && (
            <Field value={username} placeholder="Benutzername" label="Benutzername" autoComplete="username" autoFocus active={field === 'username'} onChange={setUsername} onActivate={() => setField('username')} />
          )}
          <Field value={password} placeholder="Passwort" label="Passwort" secret autoComplete="current-password" autoFocus={usernameLocked} active={usernameLocked || field === 'password'} onChange={setPassword} onActivate={() => setField('password')} />
          {isTV && (usernameLocked || field === 'password'
            ? <TvKeyboard value={password} onChange={setPassword} />
            : <TvKeyboard value={username} onChange={setUsername} />)}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="connect-actions">
            <button type="submit" className="btn btn-primary" data-focusable disabled={busy}>{busy ? 'Melde an …' : 'Anmelden'}</button>
            <button type="button" className="btn btn-glass" data-focusable onClick={() => { setError(''); setStep(users.length ? 'users' : 'server'); }}>Zurück</button>
          </div>
        </form>
      )}
    </div>
  );
}
