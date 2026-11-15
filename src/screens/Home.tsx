import type { Item, Recommendation } from '../api/types';
import { mergeContinue } from '../app/homeRows';
import { useApp, useData, useInitialFocus } from '../app/context';
import type { HomeRowId } from '../app/settings';
import { Hero } from '../ui/Hero';
import { RetryMessage } from '../ui/RetryMessage';
import { Row } from '../ui/Row';

interface HomeData {
  resume: Item[];
  nextUp: Item[];
  movies: Item[];
  series: Item[];
  favorites: Item[];
  views: Item[];
  recommendations: Recommendation[];
  failedAll: boolean;
}

export function HomeScreen() {
  const { client, dataVersion, play, settings } = useApp();
  const { hero: heroMode, cardStyle, rows: rowPrefs, heroSource, continueMode, nextUpDays } = settings.home;
  const heroEnabled = heroMode !== 'off';

  const hero = useData(
    async () => {
      if (!heroEnabled) return { items: [], total: 0 };
      const fresh = () => client.getItems({ includeItemTypes: ['Movie', 'Series'], sortBy: ['DateCreated'], sortOrder: 'Descending', limit: 7, hasBackdrop: true });
      if (heroSource === 'new') return fresh();
      const resume = heroSource === 'nextup' ? [] : await client.getResume(7).catch(() => []);
      const next = heroSource === 'continue' ? [] : await client.getNextUp(7, undefined, nextUpDays).catch(() => []);
      const items = mergeContinue(resume, next).slice(0, 7);
      // Ist noch nichts angefangen, bleibt der Bereich nicht leer.
      return items.length ? { items, total: items.length } : fresh();
    },
    [client, heroEnabled, heroSource, nextUpDays],
  );

  const rows = useData<HomeData>(async () => {
    // Eine einzelne fehlende Reihe stört nicht. Scheitert alles, zeigt die Seite eine Meldung.
    let failures = 0;
    const settled = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await promise;
      } catch (error) {
        failures += 1;
        console.warn(error);
        return fallback;
      }
    };
    const [resume, nextUp, movies, series, favorites, views, recommendations] = await Promise.all([
      settled(client.getResume(), []),
      settled(client.getNextUp(16, undefined, nextUpDays), []),
      settled(client.getItems({ includeItemTypes: ['Movie'], sortBy: ['DateCreated'], sortOrder: 'Descending', limit: 16 }).then((p) => p.items), []),
      settled(client.getItems({ includeItemTypes: ['Series'], sortBy: ['DateCreated'], sortOrder: 'Descending', limit: 16 }).then((p) => p.items), []),
      settled(client.getItems({ includeItemTypes: ['Movie', 'Series'], filters: ['IsFavorite'], sortBy: ['SortName'], limit: 16 }).then((p) => p.items), []),
      settled(client.getViews(), []),
      settled(client.getRecommendations(), []),
    ]);
    return { resume, nextUp, movies, series, favorites, views, recommendations, failedAll: failures === 7 };
  }, [client, dataVersion, nextUpDays]);

  const page = useInitialFocus(!hero.loading && !rows.loading);
  const data = rows.data;
  const showHero = heroEnabled && Boolean(hero.data?.items.length);

  const failed = !rows.loading && (Boolean(rows.error) || Boolean(data?.failedAll));
  const empty = !hero.loading && !rows.loading && !hero.data?.items.length && !data?.resume.length && !data?.nextUp.length && !data?.movies.length && !data?.series.length;

  const posterOr = (fallback: 'poster' | 'landscape') => (cardStyle === 'auto' ? fallback : cardStyle);

  const renderRow = (id: HomeRowId) => {
    switch (id) {
      case 'continue':
        if (continueMode === 'separate') {
          return [
            <Row key="resume" title="Weiter ansehen" items={data?.resume} onSelect={(item) => play(item)} />,
            <Row key="nextup" title="Nächste Folgen" items={data?.nextUp} onSelect={(item) => play(item)} />,
          ];
        }
        if (continueMode === 'resume') return <Row key={id} title="Weiter ansehen" items={data?.resume} onSelect={(item) => play(item)} />;
        if (continueMode === 'nextup') return <Row key={id} title="Nächste Folgen" items={data?.nextUp} onSelect={(item) => play(item)} />;
        return <Row key={id} title="Weiter ansehen" items={data ? mergeContinue(data.resume, data.nextUp) : undefined} onSelect={(item) => play(item)} />;
      case 'movies':
        return <Row key={id} title="Neue Filme" items={data?.movies} variant={posterOr('poster')} more={{ title: 'Alle Filme', query: { includeItemTypes: ['Movie'], sortBy: ['SortName'] } }} />;
      case 'series':
        return <Row key={id} title="Neue Serien" items={data?.series} variant={posterOr('landscape')} more={{ title: 'Alle Serien', query: { includeItemTypes: ['Series'], sortBy: ['SortName'] } }} />;
      case 'recommendations':
        return data?.recommendations.map((group) => (
          <Row key={`${group.RecommendationType}-${group.CategoryId}`} title={`Weil du „${group.BaselineItemName}“ gesehen hast`} items={group.Items ?? []} variant={posterOr('poster')} />
        ));
      case 'favorites':
        return <Row key={id} title="Meine Merkliste" items={data?.favorites} variant={posterOr('poster')} />;
      case 'libraries':
        return <Row key={id} title="Mediatheken" items={data?.views} />;
      default:
        return null;
    }
  };

  return (
    <div className="page" data-vscroll ref={page}>
      {showHero && <Hero items={hero.data!.items} autoFocus />}
      {failed && <RetryMessage title="Laden fehlgeschlagen" message="Die Startseite konnte nicht geladen werden." />}
      {empty && !failed && <RetryMessage title="Noch nichts zu sehen" message="Auf diesem Server gibt es noch keine Filme oder Serien." />}
      <div className={showHero ? 'rows rows-overlap' : 'rows rows-plain'}>
        {rowPrefs.filter((row) => row.enabled).map((row) => renderRow(row.id))}
      </div>
    </div>
  );
}
