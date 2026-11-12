import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CharacterRef, CreditMeta } from '../components/CreditView';
import {
  ExternalImage,
  NameView,
  SourceList,
  Spoiler,
  Toggle,
  VerificationBadge,
  WikiLinks,
  yearOf,
} from '../components/common';
import { FavoriteToggle } from '../components/FavoriteToggle';
import { useDb } from '../data/DbContext';
import { displayName, langLabel, langOrder } from '../data/i18n-data';
import { personCredits, resolveId } from '../data/queries';
import { t } from '../i18n/ko';
import { useFavorites } from '../state/favorites';
import { NotFound } from './NotFound';

export function PersonPage() {
  const db = useDb();
  const { id = '' } = useParams();
  const pid = resolveId(db, 'persons', id);
  const fav = useFavorites();
  const [onlyFav, setOnlyFav] = useState(false);
  const [lang, setLang] = useState('all');
  const [kind, setKind] = useState<'all' | 'anime' | 'game'>('all');
  const [mainOnly, setMainOnly] = useState(false);
  const groups = useMemo(() => (pid ? personCredits(db, pid) : []), [db, pid]);
  if (!pid) return <NotFound />;
  const p = db.persons[pid];
  const favFr = new Set(fav.franchises.map((f) => f.id));
  const langs = [...new Set(groups.flatMap((g) => g.credits.map((c) => c.ref.lang)))].sort(langOrder);
  const favCount = new Set(groups.filter((g) => favFr.has(g.work.franchise_id)).map((g) => g.work.franchise_id)).size;

  const filtered = groups
    .filter((g) => !onlyFav || favFr.has(g.work.franchise_id))
    .filter((g) => kind === 'all' || (kind === 'game' ? g.work.type === 'game' : g.work.type !== 'game'))
    .map((g) => ({
      ...g,
      credits: g.credits.filter(
        (c) => (lang === 'all' || c.ref.lang === lang) && (!mainOnly || c.credit.role === 'main'),
      ),
    }))
    .filter((g) => g.credits.length > 0);

  return (
    <article className="page">
      <header className="profile">
        {p.image && <ExternalImage image={p.image} alt={displayName(p.name)} />}
        <div>
          <h1>
            <NameView name={p.name} />
          </h1>
          <dl className="facts">
            {p.gender && (
              <>
                <dt>성별</dt>
                <dd>{t.gender[p.gender]}</dd>
              </>
            )}
            {p.nationality && (
              <>
                <dt>국적</dt>
                <dd>{p.nationality.join(', ')}</dd>
              </>
            )}
            {p.birth && (
              <>
                <dt>출생</dt>
                <dd>{p.birth}</dd>
              </>
            )}
            {p.death && (
              <>
                <dt>사망</dt>
                <dd>{p.death}</dd>
              </>
            )}
            {p.agencies && (
              <>
                <dt>소속</dt>
                <dd>{p.agencies.map((a) => displayName(a.name)).join(' → ')}</dd>
              </>
            )}
          </dl>
          <div className="actions">
            <FavoriteToggle kind="persons" id={pid} label={t.favoritePerson} />
            <Link className="btn" to={`/compare/persons?a=${pid}`}>
              {t.compareWithOtherPerson}
            </Link>
            <WikiLinks wiki={p.wikipedia} />
            {p.links?.map((l) => (
              <a key={l.url} className="chip" href={l.url} target="_blank" rel="noreferrer">
                {l.kind}
              </a>
            ))}
            <VerificationBadge status={p.meta.verification.status} />
          </div>
        </div>
      </header>

      <section>
        <h2>출연작 ({groups.length})</h2>
        {favCount > 0 && <p className="fav-summary">★ 즐겨찾기 시리즈 {favCount}개 출연</p>}
        <div className="filters">
          <Toggle label="즐겨찾기만 보기" checked={onlyFav} onChange={setOnlyFav} />
          <Toggle label="주연만" checked={mainOnly} onChange={setMainOnly} />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="유형">
            <option value="all">전체 유형</option>
            <option value="anime">애니</option>
            <option value="game">게임</option>
          </select>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="언어">
            <option value="all">전체 언어</option>
            {langs.map((l) => (
              <option key={l} value={l}>
                {langLabel(l)}
              </option>
            ))}
          </select>
        </div>
        <ul className="credit-groups">
          {filtered.map((g) => {
            const isFav = favFr.has(g.work.franchise_id);
            return (
              <li key={g.work.id} className={isFav ? 'fav-row' : ''}>
                <div className="group-head">
                  {isFav && (
                    <span className="star" aria-label="즐겨찾기">
                      ★
                    </span>
                  )}
                  <Link to={`/work/${g.work.id}`}>{displayName(g.work.title)}</Link>{' '}
                  <span className="muted">
                    {t.workType[g.work.type]} · {yearOf(g.work.start_date)}
                  </span>
                </div>
                <ul>
                  {g.credits.map((c) => (
                    <li key={`${c.ref.vi}-${c.ref.ci}`}>
                      <Spoiler active={c.credit.spoiler}>
                        <span className={`role role-${c.credit.role}`}>{t.role[c.credit.role]}</span>{' '}
                        <CharacterRef rc={c} /> <CreditMeta credit={c.credit} />
                      </Spoiler>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>
      <SourceList sources={p.sources} researchedAt={p.meta.researched_at} />
    </article>
  );
}
