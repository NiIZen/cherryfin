import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Item, ItemQuery } from '../api/types';
import { useApp } from '../app/context';
import { animateScroll } from '../focus/engine';
import { Card, MoreCard, type CardVariant } from './Card';
import { ChevronLeft, ChevronRight, GridIcon } from './Icons';

export function RowFrame({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setCanScroll((old) => (old.left === left && old.right === right ? old : { left, right }));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [measure, children]);

  // Die Pfeile sind nur für die Maus da. Tastatur und Gamepad scrollen über den Fokus.
  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    animateScroll(el, { left: Math.max(0, Math.min(el.scrollLeft + direction * el.clientWidth * 0.8, max)) });
  };

  return (
    <section className={`row ${className ?? ''}`} data-section="row">
      {title && <h2 className="row-title">{title}</h2>}
      <div className="row-viewport">
        {canScroll.left && <button type="button" className="row-arrow left" tabIndex={-1} aria-label="Zurück blättern" onClick={() => page(-1)}><ChevronLeft /></button>}
        <div className="row-scroller" ref={scroller} data-hscroll data-focus-group onScroll={measure}>
          {children}
        </div>
        {canScroll.right && <button type="button" className="row-arrow right" tabIndex={-1} aria-label="Weiter blättern" onClick={() => page(1)}><ChevronRight /></button>}
      </div>
    </section>
  );
}

interface RowProps {
  title: string;
  items?: Item[];
  variant?: CardVariant;
  onSelect?: (item: Item) => void;
  more?: { title: string; query: ItemQuery };
}

export function Row({ title, items, variant = 'landscape', onSelect, more }: RowProps) {
  const { push } = useApp();
  if (!items?.length) return null;
  return (
    <RowFrame title={title}>
      {items.map((item) => <Card key={item.Id} item={item} variant={variant} onSelect={onSelect} />)}
      {more && (
        <MoreCard
          variant={variant}
          label="Alle anzeigen"
          icon={<GridIcon />}
          onSelect={() => push({ kind: 'grid', title: more.title, query: more.query, variant })}
        />
      )}
    </RowFrame>
  );
}
