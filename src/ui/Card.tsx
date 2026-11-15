import { useState, type PointerEvent, type ReactNode } from 'react';
import type { ImageRef, Item } from '../api/types';
import { landscapeRef, posterRef } from '../api/images';
import { useApp } from '../app/context';
import { episodeLabel } from '../app/format';
import { CheckIcon } from './Icons';

export type CardVariant = 'landscape' | 'poster';

/** Parallax: Die Karte kippt zum Mauszeiger, der Glanz läuft mit. */
export function tiltHandlers() {
  return {
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
      el.style.setProperty('--rx', `${(0.5 - y) * 9}deg`);
      el.style.setProperty('--sx', `${x * 100}%`);
      el.style.setProperty('--sy', `${y * 100}%`);
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      const el = event.currentTarget;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--sx', '50%');
      el.style.setProperty('--sy', '0%');
    },
  };
}

export function Picture({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`picture ${className ?? ''}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={loaded ? 'loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="picture-fallback"><span>{alt}</span></div>
      )}
    </div>
  );
}

interface CardProps {
  item: Item;
  variant?: CardVariant;
  onSelect?: (item: Item) => void;
  autoFocus?: boolean;
  /** Position in einer virtualisierten Liste. */
  index?: number;
}

export function Card({ item, variant = 'landscape', onSelect, autoFocus, index }: CardProps) {
  const { client, open } = useApp();
  const ref: ImageRef | null = variant === 'poster' ? posterRef(item) : landscapeRef(item);
  const src = ref ? client.imageUrl(ref, variant === 'poster' ? 420 : 720) : null;

  const percent = item.UserData?.PlayedPercentage ?? 0;
  const isEpisode = item.Type === 'Episode';
  const title = isEpisode ? item.SeriesName ?? item.Name : item.Name;
  const label = isEpisode ? `${episodeLabel(item)}${item.Name ? ` · ${item.Name}` : ''}` : item.ProductionYear ? String(item.ProductionYear) : '';

  return (
    <button
      type="button"
      className={`card card-${variant}`}
      data-focusable
      data-autofocus={autoFocus ? '' : undefined}
      data-index={index}
      aria-label={title ?? undefined}
      onClick={() => (onSelect ?? open)(item)}
      {...tiltHandlers()}
    >
      <div className="card-media">
        <Picture src={src} alt={title ?? ''} />
        <div className="card-shine" />
        {item.UserData?.Played && <span className="card-check"><CheckIcon /></span>}
        {percent > 0 && percent < 100 && (
          <span className="card-progress"><span style={{ width: `${percent}%` }} /></span>
        )}
      </div>
      <div className="card-caption">
        <div className="card-title">{title}</div>
        {label && <div className="card-sub">{label}</div>}
      </div>
    </button>
  );
}

export function PersonCard({ name, role, src, onSelect }: { name: string; role?: string | null; src: string | null; onSelect: () => void }) {
  return (
    <button type="button" className="card card-person" data-focusable aria-label={name} onClick={onSelect} {...tiltHandlers()}>
      <div className="card-media"><Picture src={src} alt={name} /><div className="card-shine" /></div>
      <div className="card-caption">
        <div className="card-title">{name}</div>
        {role && <div className="card-sub">{role}</div>}
      </div>
    </button>
  );
}

/** Abschlusskachel einer Reihe. */
export function MoreCard({ variant, label, icon, onSelect }: { variant: CardVariant; label: string; icon: ReactNode; onSelect: () => void }) {
  return (
    <button type="button" className={`card card-${variant} card-more`} data-focusable aria-label={label} onClick={onSelect} {...tiltHandlers()}>
      <div className="card-media">
        <div className="card-more-inner">{icon}<span>{label}</span></div>
        <div className="card-shine" />
      </div>
    </button>
  );
}
