import type { Item, Recommendation } from '../api/types';
import { mergeContinue } from '../app/homeRows';
import { useApp, useData, useInitialFocus } from '../app/context';
import type { HomeRowId } from '../app/settings';
import { Hero } from '../ui/Hero';
import { RetryMessage } from '../ui/RetryMessage';
import { Row } from '../ui/Row';
import { t } from '../i18n';

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
      // If nothing has been started yet, the header still shows something.
      return items.length ? { items, total: items.length } : fresh();
    },
    [client, heroEnabled, heroSource, nextUpDays],
  );

  const rows = useData<HomeData>(async () => {
    // A single missing row does not matter. If everything fails, the page shows a message.
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
            <Row key="resume" title={t('Continue watching')} items={data?.resume} onSelect={(item) => play(item)} />,
            <Row key="nextup" title={t('Next up')} items={data?.nextUp} onSelect={(item) => play(item)} />,
          ];
        }
        if (continueMode === 'resume') return <Row key={id} title={t('Continue watching')} items={data?.resume} onSelect={(item) => play(item)} />;
        if (continueMode === 'nextup') return <Row key={id} title={t('Next up')} items={data?.nextUp} onSelect={(item) => play(item)} />;
        return <Row key={id} title={t('Continue watching')} items={data ? mergeContinue(data.resume, data.nextUp) : undefined} onSelect={(item) => play(item)} />;
      case 'movies':
        return <Row key={id} title={t('New movies')} items={data?.movies} variant={posterOr('poster')} more={{ title: t('All movies'), query: { includeItemTypes: ['Movie'], sortBy: ['SortName'] } }} />;
      case 'series':
        return <Row key={id} title={t('New shows')} items={data?.series} variant={posterOr('landscape')} more={{ title: t('All shows'), query: { includeItemTypes: ['Series'], sortBy: ['SortName'] } }} />;
      case 'recommendations':
        return data?.recommendations.map((group) => (
          <Row key={`${group.RecommendationType}-${group.CategoryId}`} title={t('Because you watched “{name}”', { name: group.BaselineItemName ?? '' })} items={group.Items ?? []} variant={posterOr('poster')} />
        ));
      case 'favorites':
        return <Row key={id} title={t('My list')} items={data?.favorites} variant={posterOr('poster')} />;
      case 'libraries':
        return <Row key={id} title={t('Libraries')} items={data?.views} />;
      default:
        return null;
    }
  };

  return (
    <div className="page" data-vscroll ref={page}>
      {showHero && <Hero items={hero.data!.items} autoFocus />}
      {failed && <RetryMessage title={t('Loading failed')} message={t('The home screen could not be loaded.')} />}
      {empty && !failed && <RetryMessage title={t('Nothing to see yet')} message={t('There are no movies or shows on this server yet.')} />}
      <div className={showHero ? 'rows rows-overlap' : 'rows rows-plain'}>
        {rowPrefs.filter((row) => row.enabled).map((row) => renderRow(row.id))}
      </div>
    </div>
  );
}
