import type { LibraryPrefs, SortKey } from '../app/settings';

export interface Choice<T> {
  value: T;
  label: string;
}

/** Eine Zeile, die beim Auswählen zum nächsten Wert weiterschaltet, wie in den tvOS-Einstellungen. */
export function ChoiceRow<T>({ label, value, options, onChange, hint }: { label: string; value: T; options: Choice<NoInfer<T>>[]; onChange: (value: T) => void; hint?: string }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <button type="button" className="list-row" data-focusable data-setting={label} onClick={() => onChange(options[(index + 1) % options.length].value)}>
      <span className="list-row-title">{label}{hint && <small>{hint}</small>}</span>
      <span className="list-row-value">{options[index].label}</span>
    </button>
  );
}

export const ON_OFF: Choice<boolean>[] = [{ value: true, label: 'Ein' }, { value: false, label: 'Aus' }];

export const SIZE_LABELS = ['Sehr klein', 'Klein', 'Mittel', 'Groß', 'Sehr groß'];

export const SORT_LABELS: Record<SortKey, string> = {
  SortName: 'A–Z',
  DateCreated: 'Zuletzt hinzugefügt',
  CommunityRating: 'Bewertung',
  ProductionYear: 'Erscheinungsjahr',
};

export const VIEW_OPTIONS: Choice<LibraryPrefs['view']>[] = [
  { value: 'overview', label: 'Übersicht' },
  { value: 'rows', label: 'Reihen' },
];

/** Alle Anzeigeoptionen einer Mediathek. Wird in den Einstellungen und im Ansicht-Menü verwendet. */
export function LibraryPrefRows({ prefs, onChange }: { prefs: LibraryPrefs; onChange: <K extends keyof LibraryPrefs>(key: K, value: LibraryPrefs[K]) => void }) {
  return (
    <div className="list-group">
      <ChoiceRow label="Ansicht" value={prefs.view} options={VIEW_OPTIONS} onChange={(v) => onChange('view', v)} />
      <ChoiceRow label="Darstellung" value={prefs.layout} options={[{ value: 'grid', label: 'Raster' }, { value: 'list', label: 'Liste' }]} onChange={(v) => onChange('layout', v)} />
      <ChoiceRow label="Bildformat" value={prefs.image} options={[{ value: 'poster', label: 'Hochformat' }, { value: 'landscape', label: 'Querformat' }]} onChange={(v) => onChange('image', v)} />
      <ChoiceRow label="Größe" value={prefs.size} options={SIZE_LABELS.map((label, value) => ({ value, label }))} onChange={(v) => onChange('size', v)} />
      <ChoiceRow label="Titel anzeigen" value={prefs.labels} options={[{ value: 'focus', label: 'Nur im Fokus' }, { value: 'always', label: 'Immer' }, { value: 'off', label: 'Nie' }]} onChange={(v) => onChange('labels', v)} />
      <ChoiceRow label="Sortierung" value={prefs.sort} options={(Object.keys(SORT_LABELS) as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }))} onChange={(v) => onChange('sort', v)} />
      <ChoiceRow label="Reihenfolge" value={prefs.descending} options={[{ value: false, label: 'Aufsteigend' }, { value: true, label: 'Absteigend' }]} onChange={(v) => onChange('descending', v)} />
      <ChoiceRow label="Abschnitte mit Überschrift" hint="Bei sehr wenigen Titeln automatisch ausgeblendet" value={prefs.group} options={ON_OFF} onChange={(v) => onChange('group', v)} />
      <ChoiceRow label="A–Z-Leiste" value={prefs.rail} options={ON_OFF} onChange={(v) => onChange('rail', v)} />
      <ChoiceRow label="Titelbild oben" value={prefs.hero} options={ON_OFF} onChange={(v) => onChange('hero', v)} />
      <ChoiceRow label="Nur Ungesehenes" value={prefs.unwatched} options={ON_OFF} onChange={(v) => onChange('unwatched', v)} />
    </div>
  );
}
