import { useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { IconClose, IconSearch } from './icons';

/** Find a country by typing its name; picking one selects it and flies the map there. */
export function CountrySearch() {
  const countries = useGame((s) => s.countries);
  const select = useGame((s) => s.select);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const starts = countries.filter((c) => normalize(c.name).startsWith(q));
    const contains = countries.filter((c) => !normalize(c.name).startsWith(q) && normalize(c.name).includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [countries, query]);

  const choose = (id: string) => {
    select(id);
    mapController.flyTo(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="search">
      <IconSearch className="search-icon" width={18} height={18} />
      <input
        ref={inputRef}
        type="search"
        placeholder={typeof window !== 'undefined' && window.innerWidth < 500 ? 'Search…' : 'Find a country…'}
        aria-label="Find a country"
        value={query}
        enterKeyHint="go"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) choose(results[active].id);
          else if (e.key === 'Escape') {
            setQuery('');
            inputRef.current?.blur();
          } else return;
          e.preventDefault();
        }}
      />
      {query && (
        <button className="search-clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery('')}>
          <IconClose width={16} height={16} />
        </button>
      )}
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((c, i) => {
            const url = mapController.flagUrl(c.flag);
            return (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  className={i === active ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(c.id)}
                >
                  {url ? <img src={url} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
