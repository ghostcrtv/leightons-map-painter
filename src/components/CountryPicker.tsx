import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { IconChevronDown, IconClose, IconSearch } from './icons';

export interface PickerExtra {
  value: string;
  label: string;
}

export interface PickerItem {
  id: string;
  /** Text shown in the list (defaults to the country's name). */
  label?: string;
}

/**
 * A country chooser with a search box. Tap it to open a list; type to narrow
 * the list down instead of scrolling through every country.
 */
export function CountryPicker(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  items: PickerItem[];
  /** Special choices shown at the top, like "🎲 Random". */
  extras?: PickerExtra[];
  placeholder?: string;
  /** Show the chosen country in the button (false = a plain "add" button). */
  showValue?: boolean;
  className?: string;
}) {
  const byId = useGame((s) => s.countryById);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showValue = props.showValue !== false;

  const nameOf = (it: PickerItem) => it.label ?? byId.get(it.id)?.name ?? it.id;

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const extras = (props.extras ?? []).map((e) => ({ value: e.value, text: e.label, name: e.label, flag: null as string | null, extra: true }));
    const all = props.items.map((it) => {
      const c = byId.get(it.id);
      return { value: it.id, text: nameOf(it), name: c?.name ?? it.id, flag: c ? mapController.flagUrl(c.flag) : null, extra: false };
    });
    if (!q) return [...extras, ...all];
    const starts = all.filter((r) => normalize(r.name).startsWith(q));
    const contains = all.filter((r) => !normalize(r.name).startsWith(q) && normalize(r.text).includes(q));
    return [...starts, ...contains];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.items, props.extras, query, byId]);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const openUp = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
    // Put the cursor in the search box (the iPad may wait for a tap before showing its keyboard).
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const choose = (v: string) => {
    props.onChange(v);
    setOpen(false);
    setQuery('');
  };

  const extra = props.extras?.find((e) => e.value === props.value);
  const chosen = showValue ? byId.get(props.value) : undefined;
  const chosenItem = props.items.find((it) => it.id === props.value);
  const chosenFlag = chosen ? mapController.flagUrl(chosen.flag) : null;
  const buttonText = !showValue
    ? props.placeholder
    : extra
      ? extra.label
      : chosenItem
        ? nameOf(chosenItem)
        : chosen
          ? chosen.name
          : props.placeholder ?? 'Choose a country…';

  return (
    <div className={`picker${open ? ' open' : ''}${props.className ? ` ${props.className}` : ''}`} ref={boxRef}>
      <button
        type="button"
        id={props.id}
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openUp())}
      >
        {chosenFlag && <img src={chosenFlag} alt="" className="mini-flag" />}
        <span className="picker-text">{buttonText}</span>
        <IconChevronDown width={18} height={18} className="picker-chevron" />
      </button>
      {open && (
        <div className="picker-panel">
          <div className="picker-search">
            <IconSearch className="picker-search-icon" width={18} height={18} />
            <input
              ref={inputRef}
              type="search"
              placeholder="Type to search…"
              aria-label="Search countries"
              value={query}
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, rows.length - 1));
                else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                else if (e.key === 'Enter' && rows[active]) choose(rows[active].value);
                else if (e.key === 'Escape') setOpen(false);
                else return;
                e.preventDefault();
              }}
            />
            {query && (
              <button type="button" className="picker-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                <IconClose width={16} height={16} />
              </button>
            )}
          </div>
          <ul className="picker-list" role="listbox">
            {rows.length === 0 && <li className="picker-empty">No country called “{query}”</li>}
            {rows.map((r, i) => (
              <li key={r.value} role="option" aria-selected={r.value === props.value}>
                <button
                  type="button"
                  className={`${i === active ? 'active' : ''}${r.value === props.value ? ' chosen' : ''}`}
                  onClick={() => choose(r.value)}
                >
                  {r.flag ? <img src={r.flag} alt="" className="mini-flag" /> : !r.extra && <span className="mini-flag disputed" />}
                  {r.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
