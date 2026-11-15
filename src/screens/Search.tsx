import { useEffect, useRef, useState } from 'react';
import type { Item } from '../api/types';
import { useApp, useData } from '../app/context';
import { BackspaceIcon, SpaceIcon } from '../ui/Icons';
import { RetryMessage } from '../ui/RetryMessage';
import { Row } from '../ui/Row';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ'.split('');

export function SearchScreen({ active }: { active: boolean }) {
  const { client, play } = useApp();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Tippen auf der echten Tastatur geht direkt ins Suchfeld.
  // Läuft in der Capture-Phase, damit die Rücktaste hier löscht statt zurückzuspringen.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (document.querySelector('.route:not([hidden]) [data-route-overlay]')) return;
      if (event.key === 'Backspace' && queryRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setQuery((q) => q.slice(0, -1));
      } else if (event.key.length === 1 && event.key !== ' ' && /\S/.test(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setQuery((q) => q + event.key);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  const results = useData(async () => {
    if (!debounced) {
      const suggestions = await client.getItems({ includeItemTypes: ['Movie', 'Series'], sortBy: ['Random'], limit: 18 });
      return { suggestions: suggestions.items, movies: [] as Item[], series: [] as Item[], episodes: [] as Item[], total: 0 };
    }
    const page = await client.getItems({ searchTerm: debounced, includeItemTypes: ['Movie', 'Series', 'Episode', 'BoxSet', 'Video'], limit: 60, sortBy: ['SortName'] });
    return {
      suggestions: [] as Item[],
      movies: page.items.filter((i) => i.Type === 'Movie' || i.Type === 'BoxSet' || i.Type === 'Video'),
      series: page.items.filter((i) => i.Type === 'Series'),
      episodes: page.items.filter((i) => i.Type === 'Episode'),
      total: page.total,
    };
  }, [client, debounced]);

  const data = results.data;

  return (
    <div className="page search-page" data-vscroll data-search-active={active ? '' : undefined}>
      <section className="search-head" data-section="top">
        <div className={`search-query ${query ? '' : 'empty'}`} aria-live="polite">{query || 'Filme und Serien suchen'}<i className="caret" /></div>
        <div className="keyboard" data-focus-group>
          <button type="button" className="key key-wide" data-focusable aria-label="Leerzeichen" onClick={() => setQuery((q) => `${q} `)}><SpaceIcon /></button>
          {LETTERS.map((letter) => (
            <button key={letter} type="button" className="key" data-focusable onClick={() => setQuery((q) => (q ? q + letter.toLowerCase() : letter))}>{letter}</button>
          ))}
          <button type="button" className="key key-wide" data-focusable aria-label="Löschen" onClick={() => setQuery((q) => q.slice(0, -1))}><BackspaceIcon /></button>
        </div>
      </section>
      <div className="rows rows-plain">
        {results.error && <RetryMessage title="Suche fehlgeschlagen" message={results.error.message} />}
        {debounced && data && data.total === 0 && !results.loading && (
          <div className="screen-message"><h2>Keine Treffer</h2><p>Für „{debounced}“ wurde nichts gefunden.</p></div>
        )}
        <Row title="Vorschläge" items={data?.suggestions} variant="poster" />
        <Row title="Filme" items={data?.movies} variant="poster" />
        <Row title="Serien" items={data?.series} />
        <Row title="Folgen" items={data?.episodes} onSelect={(item) => play(item)} />
      </div>
    </div>
  );
}
