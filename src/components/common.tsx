import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../data/DbContext';
import { displayName, subName, textIn } from '../data/i18n-data';
import { personPath, type Staleness } from '../data/queries';
import { t } from '../i18n/ko';
import { updateSettings, useSettings } from '../state/settings';
import type { Episodes, Image, Name, Source, Text, VerificationStatus, Wikipedia } from '../types/data';

export function NameView({ name, sub = true }: { name: Name; sub?: boolean }) {
  const s = sub ? subName(name) : '';
  return (
    <span className="name">
      {displayName(name)}
      {s && <span className="name-sub"> {s}</span>}
    </span>
  );
}

export function TextView({ text }: { text: Text }) {
  const [orig, setOrig] = useState(false);
  const r = textIn(text, 'ko');
  if (!r.translated) return <span>{r.text}</span>;
  return (
    <span>
      {orig ? r.original : r.text}{' '}
      <button className="chip-btn" onClick={() => setOrig(!orig)} title={orig ? t.hideOriginal : t.showOriginal}>
        {orig ? t.hideOriginal : `${t.translated} · ${t.showOriginal}`}
      </button>
    </span>
  );
}

/** 스포일러 가림. 클릭/Enter로 펼침. 전역 설정이 켜져 있으면 바로 표시 */
export function Spoiler({ active, children }: { active: boolean | undefined; children: ReactNode }) {
  const { showSpoilers } = useSettings();
  const [open, setOpen] = useState(false);
  if (!active || showSpoilers || open) return <>{children}</>;
  return (
    <button
      className="spoiler"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
      title="눌러서 표시"
    >
      {t.spoiler}
    </button>
  );
}

export function ExternalImage({ image, alt, size = 'md' }: { image: Image; alt: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`img-placeholder img-${size}`}>{alt.slice(0, 1)}</div>;
  return (
    <figure className={`ext-img img-${size}`}>
      <img src={image.url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      {size === 'md' && (
        <figcaption>
          <a href={image.page_url} target="_blank" rel="noreferrer">
            {image.credit}
          </a>
        </figcaption>
      )}
    </figure>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus | undefined }) {
  if (!status || status === 'verified') return null;
  return <span className={`badge badge-${status}`}>{t.verification[status]}</span>;
}

export function StalenessBanner({ s }: { s: Staleness }) {
  if (s.kind === 'stale')
    return (
      <div className="banner banner-warn" role="status">
        ⚠ {t.staleBanner(s.researchedAt, s.lastRelease)}
      </div>
    );
  if (s.kind === 'ongoing')
    return (
      <div className="banner banner-info" role="status">
        ℹ {t.ongoingBanner(s.researchedAt)}
      </div>
    );
  return null;
}

export function SourceList({ sources, researchedAt }: { sources: Source[]; researchedAt: string }) {
  return (
    <details className="sources">
      <summary>
        {t.sources} {sources.length}건 · {t.researchedAt} {researchedAt}
      </summary>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <span className={`tier tier-${s.tier}`}>{t.tier(s.tier)}</span>{' '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{' '}
            <span className="muted">({s.accessed_at})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function WikiLinks({ wiki }: { wiki: Wikipedia | undefined }) {
  if (!wiki) return null;
  return (
    <span className="wiki-links">
      {Object.entries(wiki).map(([lang, url]) => (
        <a key={lang} href={url} target="_blank" rel="noreferrer" className="chip">
          Wikipedia {lang}
        </a>
      ))}
    </span>
  );
}

export function episodesLabel(e: Episodes | undefined): string {
  if (!e) return '';
  // 게임 패치 범위("6.1-6.5")와 회차("1-12, 15")를 구분해 표시
  if (typeof e === 'string') return /^\d+\.\d/.test(e) ? `패치 ${e}` : `${e}화`;
  if (e.from && e.to) return e.from === e.to ? `${e.from}화` : `${e.from}–${e.to}화`;
  if (e.from) return `${e.from}화~`;
  if (e.to) return `~${e.to}화`;
  return '';
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function SpoilerSettingToggle() {
  const s = useSettings();
  return (
    <Toggle label="스포일러 항상 표시" checked={s.showSpoilers} onChange={(v) => updateSettings({ showSpoilers: v })} />
  );
}

export function PersonLink({ id, name }: { id: string; name: Name }) {
  return (
    <Link to={personPath(useDb(), id)}>
      <NameView name={name} sub={false} />
    </Link>
  );
}

export function yearOf(d: string | undefined): string {
  return d ? d.slice(0, 4) : '';
}
