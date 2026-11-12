import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Db, SearchEntry } from '../data/db';
import { useDb } from '../data/DbContext';
import { displayName, subName } from '../data/i18n-data';
import { getCharacter, search, type SearchHit } from '../data/queries';
import { t } from '../i18n/ko';
import { Spoiler } from './common';

export function entryPath(e: SearchEntry): string {
  if (e.kind === 'character') {
    const [f, c] = e.id.split('/');
    return `/franchise/${f}/character/${c}`;
  }
  return `/${e.kind}/${e.id}`;
}

export function entryLabel(db: Db, e: SearchEntry): { label: string; sub: string } {
  switch (e.kind) {
    case 'person': {
      const n = db.persons[e.id].name;
      return { label: displayName(n), sub: subName(n) };
    }
    case 'work': {
      const w = db.works[e.id];
      return { label: displayName(w.title), sub: `${t.workType[w.type]} · ${w.start_date?.slice(0, 4) ?? ''}` };
    }
    case 'franchise': {
      const f = db.franchises[e.id];
      return { label: displayName(f.title), sub: '시리즈' };
    }
    case 'character': {
      const [f, c] = e.id.split('/');
      const ch = getCharacter(db, f, c)!;
      return { label: displayName(ch.name), sub: displayName(db.franchises[f].title) };
    }
  }
}

export function HitLabel({ hit }: { hit: SearchHit }) {
  const db = useDb();
  const { label, sub } = entryLabel(db, hit.entry);
  return (
    <>
      <span className={`kind kind-${hit.entry.kind}`}>{t.kind[hit.entry.kind]}</span>{' '}
      <Spoiler active={hit.masked}>
        <strong>{label}</strong>
      </Spoiler>{' '}
      <span className="muted">{hit.masked ? displayName(db.franchises[hit.entry.id.split('/')[0]].title) : sub}</span>
    </>
  );
}

/** 자동완성 입력. onSelect가 없으면 선택 시 해당 페이지로 이동 */
export function SearchBox({
  kinds,
  placeholder = t.searchPlaceholder,
  onSelect,
  onSubmit,
  autoFocus,
  initial = '',
}: {
  kinds?: SearchEntry['kind'][];
  placeholder?: string;
  onSelect?: (e: SearchEntry) => void;
  onSubmit?: (q: string) => void;
  autoFocus?: boolean;
  initial?: string;
}) {
  const db = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(db, q, { kinds, limit: 12 }).filter((h) => !h.masked), [db, q, kinds]);

  const choose = (h: SearchHit) => {
    setOpen(false);
    if (onSelect) {
      onSelect(h.entry);
      setQ('');
    } else {
      nav(entryPath(h.entry));
      setQ('');
      inputRef.current?.blur();
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      setActive((a) => Math.min(a + 1, hits.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (open && hits[active]) choose(hits[active]);
      else if (onSubmit && q.trim()) onSubmit(q.trim());
      e.preventDefault();
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="searchbox">
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && q && (
        <ul className="suggest" role="listbox">
          {hits.length === 0 && <li className="muted">{t.noResults}</li>}
          {hits.map((h, i) => (
            <li
              key={h.entry.kind + h.entry.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <HitLabel hit={h} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
