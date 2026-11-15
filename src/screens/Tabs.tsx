import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { useApp } from '../app/context';
import { useLibraryTabs, type LibraryTab } from '../app/tabs';
import { animateScroll, focusFirstIn, inputMode, pushInterceptor } from '../focus/engine';
import { SearchIcon } from '../ui/Icons';
import { HomeScreen } from './Home';
import { LibraryScreen } from './Library';
import { SearchScreen } from './Search';
import { SettingsScreen } from './Settings';

type Tab =
  | { kind: 'search'; id: 'search'; label: string }
  | { kind: 'home'; id: 'home'; label: string }
  | LibraryTab
  | { kind: 'settings'; id: 'settings'; label: string };

export function TabsRoot() {
  const { client } = useApp();
  const library = useLibraryTabs();
  const [activeId, setActiveId] = useState('home');
  const [visited, setVisited] = useState(() => new Set(['home']));
  const [barHidden, setBarHidden] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const tabs = useMemo<Tab[]>(() => [
    { kind: 'search', id: 'search', label: 'Suche' },
    { kind: 'home', id: 'home', label: 'Startseite' },
    ...library.visible,
    { kind: 'settings', id: 'settings', label: 'Einstellungen' },
  ], [library.visible]);

  // Wird der aktive Bereich in den Einstellungen ausgeblendet, geht es zurück zur Startseite.
  useEffect(() => {
    if (!library.loading && !tabs.some((tab) => tab.id === activeId)) setActiveId('home');
  }, [activeId, library.loading, tabs]);

  const activate = (id: string) => {
    setActiveId(id);
    setBarHidden(false);
    setVisited((set) => (set.has(id) ? set : new Set(set).add(id)));
  };

  const pageOf = (id: string) => root.current?.querySelector<HTMLElement>(`[data-tab-page="${id}"] [data-vscroll]`) ?? null;

  // Zurück scrollt erst nach oben und führt dann in die Tab-Leiste, wie auf dem Apple TV.
  useEffect(() => pushInterceptor((command) => {
    if (command !== 'back') return false;
    // Liegt eine Detailseite oder der Player darüber, ist diese Ansicht nicht zuständig.
    if (!root.current?.checkVisibility()) return false;
    const bar = root.current.querySelector<HTMLElement>('.tabbar');
    if (!bar || bar.contains(document.activeElement)) return false;
    const page = pageOf(activeId);
    if (page) animateScroll(page, { top: 0 });
    const current = bar.querySelector<HTMLElement>('[aria-current="page"]');
    if (current) current.focus({ preventScroll: true });
    else focusFirstIn(bar);
    return true;
  }), [activeId]);

  const initials = (client.user.Name ?? '?').charAt(0).toUpperCase();
  const avatar = client.userImageUrl(client.user, 96);

  return (
    <div
      className="tabs-root"
      ref={root}
      onScrollCapture={(event: UIEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.matches?.('[data-vscroll]')) setBarHidden(target.scrollTop > 60);
      }}
    >
      <div className={`tabbar-wrap ${barHidden ? 'bar-hidden' : ''}`}>
        <nav className="tabbar" aria-label="Hauptnavigation" data-focus-group>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${tab.kind === 'search' ? 'tab-icon' : ''} ${tab.kind === 'settings' ? 'tab-avatar' : ''}`}
              data-focusable
              data-focus-fallback
              aria-label={tab.label}
              aria-current={activeId === tab.id ? 'page' : undefined}
              onClick={() => activate(tab.id)}
              onFocus={() => {
                if (inputMode() !== 'keyboard') return;
                activate(tab.id);
                const page = pageOf(tab.id);
                if (page) animateScroll(page, { top: 0 });
              }}
            >
              {tab.kind === 'search' && <SearchIcon />}
              {tab.kind === 'settings' && (avatar ? <img src={avatar} alt="" /> : <span>{initials}</span>)}
              {tab.kind !== 'search' && tab.kind !== 'settings' && tab.label}
            </button>
          ))}
        </nav>
      </div>

      {tabs.map((tab) => visited.has(tab.id) && (
        <div key={tab.id} className="tab-page" data-tab-page={tab.id} hidden={tab.id !== activeId}>
          {tab.kind === 'home' && <HomeScreen />}
          {tab.kind === 'library' && <LibraryScreen tab={tab} />}
          {tab.kind === 'search' && <SearchScreen active={tab.id === activeId} />}
          {tab.kind === 'settings' && <SettingsScreen />}
        </div>
      ))}
    </div>
  );
}
