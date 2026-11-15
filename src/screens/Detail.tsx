import { useEffect, useState } from 'react';
import type { Item } from '../api/types';
import { backdropRef, landscapeRef } from '../api/images';
import { useApp, useData, useInitialFocus } from '../app/context';
import { episodeLabel, formatRuntime, mediaBadges, metaLine, streamsOf, trackLabel } from '../app/format';
import { PersonCard, Picture, tiltHandlers } from '../ui/Card';
import { TitleArt } from '../ui/Hero';
import { CheckIcon, PlayIcon, PlusIcon, RestartIcon } from '../ui/Icons';
import { RetryMessage } from '../ui/RetryMessage';
import { Row, RowFrame } from '../ui/Row';

function EpisodeCard({ episode, onSelect }: { episode: Item; onSelect: () => void }) {
  const { client } = useApp();
  const ref = landscapeRef(episode);
  const percent = episode.UserData?.PlayedPercentage ?? 0;
  return (
    <button type="button" className={`card card-episode ${episode.UserData?.Played || percent > 0 ? '' : 'unwatched'}`} data-focusable aria-label={episode.Name ?? undefined} onClick={onSelect} {...tiltHandlers()}>
      <div className="card-media">
        <Picture src={ref ? client.imageUrl(ref, 720) : null} alt={episode.Name ?? ''} />
        <div className="card-shine" />
        {episode.UserData?.Played && <span className="card-check"><CheckIcon /></span>}
        {percent > 0 && percent < 100 && <span className="card-progress"><span style={{ width: `${percent}%` }} /></span>}
      </div>
      <div className="card-caption">
        <div className="card-sub upper">Folge {episode.IndexNumber}{episode.RunTimeTicks ? ` · ${formatRuntime(episode.RunTimeTicks)}` : ''}</div>
        <div className="card-title">{episode.Name}</div>
        {episode.Overview && <div className="card-overview spoiler-text">{episode.Overview}</div>}
      </div>
    </button>
  );
}

function Episodes({ series, preferredSeasonId }: { series: Item; preferredSeasonId?: string | null }) {
  const { client, dataVersion, play } = useApp();
  const seasons = useData(() => client.getSeasons(series.Id!), [series.Id, dataVersion]);
  const [chosen, setChosen] = useState<string | null>(null);
  const seasonId = chosen ?? preferredSeasonId ?? seasons.data?.[0]?.Id ?? null;
  const episodes = useData(
    () => (seasonId ? client.getEpisodes(series.Id!, { seasonId }) : Promise.resolve([])),
    [series.Id, seasonId, dataVersion],
  );

  if (!seasons.data?.length) return null;

  return (
    <section className="detail-section" data-section="row">
      <div className="pill-row season-pills" data-focus-group data-hscroll>
        {seasons.data.map((season) => (
          <button
            key={season.Id}
            type="button"
            className={`pill ${season.Id === seasonId ? 'selected' : ''}`}
            data-focusable
            aria-pressed={season.Id === seasonId}
            onClick={() => setChosen(season.Id!)}
          >
            {season.Name}
          </button>
        ))}
      </div>
      <RowFrame className="row-flush">
        {episodes.data?.map((episode) => (
          <EpisodeCard key={episode.Id} episode={episode} onSelect={() => play(episode)} />
        ))}
      </RowFrame>
    </section>
  );
}

function InfoGrid({ item }: { item: Item }) {
  const directors = item.People?.filter((p) => p.Type === 'Director').map((p) => p.Name) ?? [];
  const writers = item.People?.filter((p) => p.Type === 'Writer').map((p) => p.Name) ?? [];
  const studios = item.Studios?.map((s) => s.Name) ?? [];
  const source = item.MediaSources?.[0];
  const audio = [...new Set(streamsOf(source, 'Audio').map(trackLabel))];
  const subtitles = [...new Set(streamsOf(source, 'Subtitle').map(trackLabel))];

  const entries: Array<[string, string]> = [
    ['Genre', item.Genres?.join(', ') ?? ''],
    ['Regie', directors.join(', ')],
    ['Drehbuch', writers.join(', ')],
    ['Studio', studios.join(', ')],
    ['Erschienen', item.ProductionYear ? String(item.ProductionYear) : ''],
    ['Laufzeit', formatRuntime(item.RunTimeTicks)],
    ['Bewertung', item.CommunityRating ? `${item.CommunityRating.toFixed(1)} / 10` : ''],
    ['Tonspuren', audio.join(', ')],
    ['Untertitel', subtitles.join(', ')],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (!entries.length) return null;
  return (
    <section className="detail-section info-section">
      <h2 className="row-title">Informationen</h2>
      <dl className="info-grid">
        {entries.map(([term, value]) => (
          <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}

export function DetailScreen({ id }: { id: string }) {
  const { client, dataVersion, bumpData, play, push, open } = useApp();
  const { data: loaded, error } = useData(() => client.getItem(id), [id, dataVersion]);
  const [item, setItem] = useState<Item | undefined>();
  useEffect(() => setItem(loaded), [loaded]);

  const isSeries = item?.Type === 'Series';
  const nextUp = useData(
    () => (isSeries ? client.getNextUp(1, id).then((list) => list[0] ?? null) : Promise.resolve(null)),
    [id, isSeries, dataVersion],
  );
  const firstEpisode = useData(
    () => (isSeries ? client.getEpisodes(id, { limit: 1 }).then((list) => list[0] ?? null) : Promise.resolve(null)),
    [id, isSeries],
  );
  const similar = useData(() => client.getSimilar(id).catch(() => []), [id]);
  const children = useData(
    () => (item?.Type === 'BoxSet' ? client.getItems({ parentId: id, recursive: false, sortBy: ['ProductionYear'] }).then((p) => p.items) : Promise.resolve([])),
    [id, item?.Type],
  );

  // Bei Serien erst fokussieren, wenn feststeht, welche Folge der Abspielknopf startet.
  const page = useInitialFocus(Boolean(item) && (!isSeries || Boolean(nextUp.data ?? firstEpisode.data)));

  if (error && !item) {
    return <div className="page"><RetryMessage title="Laden fehlgeschlagen" message={error.message} /></div>;
  }
  if (!item) return <div className="page" ref={page} />;

  const target = isSeries ? nextUp.data ?? firstEpisode.data ?? null : item;
  const position = target?.UserData?.PlaybackPositionTicks ?? 0;
  const percent = target?.UserData?.PlayedPercentage ?? 0;
  const canResume = position > 0;
  const remaining = canResume && target?.RunTimeTicks ? target.RunTimeTicks - position : 0;
  const isPlayable = item.Type !== 'BoxSet' && Boolean(target);

  let playLabel = 'Abspielen';
  if (canResume) playLabel = 'Fortsetzen';
  else if (isSeries && target) playLabel = `${episodeLabel(target)} abspielen`;

  const toggleFavorite = async () => {
    const next = !item.UserData?.IsFavorite;
    setItem({ ...item, UserData: { Key: '', ...item.UserData, IsFavorite: next } });
    await client.setFavorite(item.Id!, next);
    bumpData();
  };

  const togglePlayed = async () => {
    const next = !item.UserData?.Played;
    setItem({ ...item, UserData: { Key: '', ...item.UserData, Played: next } });
    await client.setPlayed(item.Id!, next);
    bumpData();
  };

  const backdrop = backdropRef(item);
  const badges = mediaBadges(item);
  const people = item.People?.filter((p) => p.Type === 'Actor' || p.Type === 'Director' || p.Type === 'GuestStar').slice(0, 24) ?? [];
  const tagline = item.Taglines?.[0];
  const isEpisode = item.Type === 'Episode';

  return (
    <div className="detail">
      <div className="detail-bg" aria-hidden="true">
        {backdrop && <img src={client.imageUrl(backdrop, 1920)} alt="" draggable={false} />}
      </div>
      <div className="page" data-vscroll ref={page}>
        <section className="detail-hero" data-section="top">
          <div className="detail-hero-content">
            <TitleArt item={item} />
            {isEpisode && <div className="detail-episode">{episodeLabel(item)} · {item.Name}</div>}
            {tagline && <div className="detail-tagline">{tagline}</div>}
            <div className="hero-meta">
              {metaLine(item)}
              {badges.map((badge) => <span key={badge} className="badge">{badge}</span>)}
            </div>
            {item.Overview && <p className="hero-overview">{item.Overview}</p>}
            <div className="hero-actions" data-focus-group>
              {isPlayable && target && (
                <button type="button" className="btn btn-primary btn-play" data-focusable data-autofocus onClick={() => play(target)}>
                  <PlayIcon />
                  <span>{playLabel}</span>
                  {canResume && (
                    <span className="btn-progress"><span style={{ width: `${percent}%` }} /></span>
                  )}
                  {remaining > 0 && <span className="btn-note">noch {formatRuntime(remaining)}</span>}
                </button>
              )}
              {canResume && target && (
                <button type="button" className="btn btn-glass" data-focusable onClick={() => play(target, { fromStart: true })}>
                  <RestartIcon /><span>Von vorn</span>
                </button>
              )}
              {isEpisode && item.SeriesId && (
                <button type="button" className="btn btn-glass" data-focusable onClick={() => push({ kind: 'detail', id: item.SeriesId! })}>
                  <span>Zur Serie</span>
                </button>
              )}
              <button type="button" className="btn btn-glass btn-round" data-focusable aria-label={item.UserData?.IsFavorite ? 'Von der Merkliste entfernen' : 'Zur Merkliste hinzufügen'} onClick={toggleFavorite}>
                {item.UserData?.IsFavorite ? <CheckIcon /> : <PlusIcon />}
              </button>
              <button type="button" className={`btn btn-glass ${item.UserData?.Played ? 'btn-on' : ''}`} data-focusable onClick={togglePlayed}>
                <CheckIcon /><span>{item.UserData?.Played ? 'Gesehen' : 'Als gesehen markieren'}</span>
              </button>
            </div>
          </div>
        </section>

        <div className="detail-body">
          {isSeries && <Episodes series={item} preferredSeasonId={nextUp.data?.SeasonId ?? firstEpisode.data?.SeasonId} />}
          {item.Type === 'BoxSet' && <Row title="In dieser Sammlung" items={children.data} variant="poster" />}
          {people.length > 0 && (
            <RowFrame title="Besetzung und Crew">
              {people.map((person) => (
                <PersonCard
                  key={`${person.Id}-${person.Role ?? person.Type}`}
                  name={person.Name ?? ''}
                  role={person.Type === 'Director' ? 'Regie' : person.Role}
                  src={person.PrimaryImageTag ? client.imageUrl({ itemId: person.Id!, type: 'Primary', tag: person.PrimaryImageTag }, 300) : null}
                  onSelect={() => push({ kind: 'grid', title: person.Name ?? 'Person', query: { personIds: [person.Id!], includeItemTypes: ['Movie', 'Series'], sortBy: ['ProductionYear'], sortOrder: 'Descending' } })}
                />
              ))}
            </RowFrame>
          )}
          <Row title="Das könnte dir auch gefallen" items={similar.data} variant="poster" onSelect={open} />
          <InfoGrid item={item} />
        </div>
      </div>
    </div>
  );
}
