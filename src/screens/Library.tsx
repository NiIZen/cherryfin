import type { ItemQuery } from '../api/types';
import { useApp, useData } from '../app/context';
import { prefsFor } from '../app/settings';
import type { LibraryTab } from '../app/tabs';
import { Hero } from '../ui/Hero';
import { RetryMessage } from '../ui/RetryMessage';
import { Row } from '../ui/Row';
import { Overview } from './Overview';

function LibraryRows({ tab }: { tab: LibraryTab }) {
  const { client, dataVersion, play, settings } = useApp();
  const scope: ItemQuery = { includeItemTypes: tab.types, parentId: tab.parentId, genres: tab.genres };
  const prefs = prefsFor(settings, tab.id);

  const hero = useData(
    () => (prefs.hero ? client.getItems({ ...scope, sortBy: ['Random'], limit: 6, hasBackdrop: true }) : Promise.resolve({ items: [], total: 0 })),
    [client, tab.id, prefs.hero],
  );

  const rows = useData(async () => {
    const resumeTypes = tab.types.includes('Series') ? (['Episode'] as const) : tab.types;
    const [resume, latest, rated, genres] = await Promise.all([
      client.getResume(16, [...resumeTypes]).catch(() => []),
      client.getItems({ ...scope, sortBy: ['DateCreated'], sortOrder: 'Descending', limit: 16 }),
      client.getItems({ ...scope, sortBy: ['CommunityRating'], sortOrder: 'Descending', limit: 16 }),
      tab.genres ? Promise.resolve([]) : client.getGenres(tab.types, tab.parentId, 8).catch(() => []),
    ]);
    const byGenre = await Promise.all(
      genres.map(async (genre) => ({
        genre,
        items: (await client.getItems({ ...scope, genres: [genre], sortBy: ['Random'], limit: 16 }).catch(() => ({ items: [] }))).items,
      })),
    );
    return { resume, latest: latest.items, rated: rated.items, byGenre };
  }, [client, tab.id, dataVersion]);

  const data = rows.data;
  const allQuery: ItemQuery = { ...scope, sortBy: ['SortName'] };
  const variant = prefs.image;
  const showHero = prefs.hero && hero.data && hero.data.items.length > 0;

  return (
    <div className="page" data-vscroll>
      {showHero && <Hero items={hero.data!.items} />}
      {rows.error && !data && <RetryMessage title="Laden fehlgeschlagen" message={rows.error.message} />}
      <div className={showHero ? 'rows rows-overlap' : 'rows rows-plain'}>
        <Row title="Weiter ansehen" items={data?.resume} onSelect={(item) => play(item)} />
        <Row title="Neu hinzugefügt" items={data?.latest} variant={variant} more={{ title: `Alle: ${tab.label}`, query: allQuery }} />
        <Row title="Bestbewertet" items={data?.rated} variant={variant} more={{ title: `${tab.label}: bestbewertet`, query: { ...scope, sortBy: ['CommunityRating'], sortOrder: 'Descending' } }} />
        {data?.byGenre.map(({ genre, items }) => (
          <Row key={genre} title={genre} items={items} variant={variant} more={{ title: genre, query: { ...scope, genres: [genre], sortBy: ['SortName'] } }} />
        ))}
      </div>
    </div>
  );
}

export function LibraryScreen({ tab }: { tab: LibraryTab }) {
  const { settings } = useApp();
  if (prefsFor(settings, tab.id).view === 'rows') return <LibraryRows tab={tab} />;
  return (
    <Overview
      title={tab.label}
      tabId={tab.id}
      scope={{ includeItemTypes: tab.types, parentId: tab.parentId, genres: tab.genres }}
    />
  );
}
