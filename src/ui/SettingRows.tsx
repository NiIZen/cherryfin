import type { LibraryPrefs, SortKey } from '../app/settings';
import { t } from '../i18n';

export interface Choice<T> {
  value: T;
  label: string;
}

/** A row that steps to the next value when selected, like in the tvOS settings. Translates its texts itself. */
export function ChoiceRow<T>({ label, value, options, onChange, hint }: { label: string; value: T; options: Choice<NoInfer<T>>[]; onChange: (value: T) => void; hint?: string }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <button type="button" className="list-row" data-focusable data-setting={t(label)} onClick={() => onChange(options[(index + 1) % options.length].value)}>
      <span className="list-row-title">{t(label)}{hint && <small>{t(hint)}</small>}</span>
      <span className="list-row-value">{t(options[index].label)}</span>
    </button>
  );
}

export const ON_OFF: Choice<boolean>[] = [{ value: true, label: 'On' }, { value: false, label: 'Off' }];

export const SIZE_LABELS = ['Very small', 'Small', 'Medium', 'Large', 'Very large'];

export const SORT_LABELS: Record<SortKey, string> = {
  SortName: 'A–Z',
  DateCreated: 'Recently added',
  CommunityRating: 'Rating',
  ProductionYear: 'Release year',
};

export const VIEW_OPTIONS: Choice<LibraryPrefs['view']>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'rows', label: 'Rows' },
];

/** All display options of a library. Used in the settings and in the View menu. */
export function LibraryPrefRows({ prefs, onChange }: { prefs: LibraryPrefs; onChange: <K extends keyof LibraryPrefs>(key: K, value: LibraryPrefs[K]) => void }) {
  return (
    <div className="list-group">
      <ChoiceRow label={t('View')} value={prefs.view} options={VIEW_OPTIONS} onChange={(v) => onChange('view', v)} />
      <ChoiceRow label={t('Layout')} value={prefs.layout} options={[{ value: 'grid', label: t('Grid') }, { value: 'list', label: t('List') }]} onChange={(v) => onChange('layout', v)} />
      <ChoiceRow label={t('Image format')} value={prefs.image} options={[{ value: 'poster', label: t('Portrait') }, { value: 'landscape', label: t('Landscape') }]} onChange={(v) => onChange('image', v)} />
      <ChoiceRow label={t('Size')} value={prefs.size} options={SIZE_LABELS.map((label, value) => ({ value, label }))} onChange={(v) => onChange('size', v)} />
      <ChoiceRow label={t('Show titles')} value={prefs.labels} options={[{ value: 'focus', label: t('Only when focused') }, { value: 'always', label: t('Always') }, { value: 'off', label: t('Never') }]} onChange={(v) => onChange('labels', v)} />
      <ChoiceRow label={t('Sort by')} value={prefs.sort} options={(Object.keys(SORT_LABELS) as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }))} onChange={(v) => onChange('sort', v)} />
      <ChoiceRow label={t('Order')} value={prefs.descending} options={[{ value: false, label: t('Ascending') }, { value: true, label: t('Descending') }]} onChange={(v) => onChange('descending', v)} />
      <ChoiceRow label={t('Sections with headings')} hint={t('Hidden automatically when there are very few titles')} value={prefs.group} options={ON_OFF} onChange={(v) => onChange('group', v)} />
      <ChoiceRow label={t('A–Z bar')} value={prefs.rail} options={ON_OFF} onChange={(v) => onChange('rail', v)} />
      <ChoiceRow label={t('Header image')} value={prefs.hero} options={ON_OFF} onChange={(v) => onChange('hero', v)} />
      <ChoiceRow label={t('Unwatched only')} value={prefs.unwatched} options={ON_OFF} onChange={(v) => onChange('unwatched', v)} />
    </div>
  );
}
