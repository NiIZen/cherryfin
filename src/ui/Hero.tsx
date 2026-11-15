import { useEffect, useRef, useState } from 'react';
import type { Item } from '../api/types';
import { backdropRef, logoRef } from '../api/images';
import { useApp } from '../app/context';
import { metaLine } from '../app/format';
import { PlayIcon, PlusIcon, CheckIcon } from './Icons';

export function TitleArt({ item, className }: { item: Item; className?: string }) {
  const { client } = useApp();
  const ref = logoRef(item);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [ref?.itemId]);
  const name = item.Type === 'Episode' ? item.SeriesName ?? item.Name : item.Name;
  if (ref && !failed) {
    return <img className={`title-logo ${className ?? ''}`} src={client.imageUrl(ref, 900)} alt={name ?? ''} draggable={false} onError={() => setFailed(true)} />;
  }
  return <h1 className={`title-text ${className ?? ''}`}>{name}</h1>;
}

/** Vollflächiger Hero-Bereich mit Überblendung, wie das obere Regal der Apple-TV-App. */
export function Hero({ items, autoFocus }: { items: Item[]; autoFocus?: boolean }) {
  const { client, open, play, bumpData, settings } = useApp();
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const root = useRef<HTMLDivElement>(null);
  const count = items.length;
  const item = items[Math.min(index, count - 1)];

  useEffect(() => {
    if (count < 2 || hovering || settings.home.hero === 'static') return;
    const timer = setInterval(() => {
      // Nur weiterdrehen, solange der Hero sichtbar ist.
      const box = root.current?.getBoundingClientRect();
      if (box && box.bottom > box.height * 0.6 && box.width > 0) setIndex((i) => (i + 1) % count);
    }, settings.home.heroSeconds * 1000);
    return () => clearInterval(timer);
  }, [count, hovering, index, settings.home.hero, settings.home.heroSeconds]);

  // Am Rand der Knopfreihe blättert links/rechts durch den Hero.
  useEffect(() => {
    const el = root.current;
    if (!el || count < 2) return;
    const onEdge = (event: Event) => {
      const dir = (event as CustomEvent).detail;
      if (dir === 'left' || dir === 'right') {
        event.preventDefault();
        setIndex((i) => (i + (dir === 'right' ? 1 : -1) + count) % count);
      }
    };
    el.addEventListener('focus-edge', onEdge);
    return () => el.removeEventListener('focus-edge', onEdge);
  }, [count]);

  if (!item) return null;

  const isFavorite = favorites[item.Id!] ?? item.UserData?.IsFavorite ?? false;
  const toggleFavorite = async () => {
    setFavorites((f) => ({ ...f, [item.Id!]: !isFavorite }));
    await client.setFavorite(item.Id!, !isFavorite);
    bumpData();
  };

  return (
    <section className="hero" ref={root} data-section="top" onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)}>
      <div className="hero-backdrops" aria-hidden="true">
        {items.map((entry, i) => {
          const ref = backdropRef(entry);
          // Nur aktuelles und benachbarte Bilder laden.
          const near = i === index || i === (index + 1) % count || i === (index - 1 + count) % count;
          return (
            <div key={entry.Id} className={`hero-backdrop ${i === index ? 'active' : ''}`}>
              {ref && near && <img src={client.imageUrl(ref, 1920)} alt="" draggable={false} />}
            </div>
          );
        })}
      </div>
      <div className="hero-scrim" />
      <div className="hero-content" key={item.Id}>
        <TitleArt item={item} />
        <div className="hero-meta">{metaLine(item)}</div>
        {item.Overview && <p className="hero-overview">{item.Overview}</p>}
        <div className="hero-actions" data-focus-group>
          <button type="button" className="btn btn-primary" data-focusable data-autofocus={autoFocus ? '' : undefined} onClick={() => (item.Type === 'Series' ? open(item) : play(item))}>
            <PlayIcon /><span>{item.Type === 'Series' ? 'Ansehen' : 'Abspielen'}</span>
          </button>
          <button type="button" className="btn btn-glass" data-focusable onClick={() => open(item)}>
            <span>Details</span>
          </button>
          <button type="button" className="btn btn-glass btn-round" data-focusable aria-label={isFavorite ? 'Von der Merkliste entfernen' : 'Zur Merkliste hinzufügen'} onClick={toggleFavorite}>
            {isFavorite ? <CheckIcon /> : <PlusIcon />}
          </button>
        </div>
      </div>
      {count > 1 && (
        <div className="hero-dots" aria-hidden="true">
          {items.map((entry, i) => <span key={entry.Id} className={i === index ? 'active' : ''} />)}
        </div>
      )}
    </section>
  );
}
