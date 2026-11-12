import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CharacterRef, CreditMeta } from '../components/CreditView';
import { Spoiler, Toggle } from '../components/common';
import { SearchBox } from '../components/Search';
import { useDb } from '../data/DbContext';
import { displayName, langLabel } from '../data/i18n-data';
import {
  compareWithFavorites,
  comparePersons,
  compareWorks,
  resolveId,
  type OverlapRow,
  type ResolvedCredit,
} from '../data/queries';
import { t } from '../i18n/ko';
import { useFavorites } from '../state/favorites';
import { NotFound } from './NotFound';

function CreditList({ list, showWork = false }: { list: ResolvedCredit[]; showWork?: boolean }) {
  return (
    <ul className="plain">
      {list.map((c) => (
        <li key={`${c.ref.work}-${c.ref.vi}-${c.ref.ci}`}>
          <Spoiler active={c.credit.spoiler}>
            {showWork && (
              <>
                <Link to={`/work/${c.work.id}`} className="muted">
                  {displayName(c.work.title)}
                </Link>
                {' › '}
              </>
            )}
            <CharacterRef rc={c} /> <CreditMeta credit={c.credit} />
          </Spoiler>
        </li>
      ))}
    </ul>
  );
}

function OverlapTable({
  rows,
  aLabel,
  bLabel,
  showWorkB,
}: {
  rows: OverlapRow[];
  aLabel: string;
  bLabel: string;
  showWorkB?: boolean;
}) {
  const db = useDb();
  return (
    <table className="simple">
      <thead>
        <tr>
          <th>성우</th>
          <th>{aLabel}</th>
          <th>{bLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.person}>
            <td>
              <Link to={`/person/${r.person}`}>{displayName(db.persons[r.person].name)}</Link>
            </td>
            <td>
              <CreditList list={r.a} />
            </td>
            <td>
              <CreditList list={r.b} showWork={showWorkB} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Picker({
  label,
  value,
  kind,
  onPick,
}: {
  label: string;
  value?: string;
  kind: 'work' | 'person';
  onPick: (id: string) => void;
}) {
  const db = useDb();
  const current = value ? (kind === 'work' ? db.works[value]?.title : db.persons[value]?.name) : undefined;
  return (
    <div className="picker">
      <div className="picker-label">{label}</div>
      {current && <div className="picker-current">{displayName(current)}</div>}
      <SearchBox
        kinds={[kind]}
        placeholder={kind === 'work' ? '작품 검색' : '성우 검색'}
        onSelect={(e) => onPick(e.id)}
      />
    </div>
  );
}

export function CompareWorksPage() {
  const db = useDb();
  const [sp, setSp] = useSearchParams();
  const a = resolveId(db, 'works', sp.get('a') ?? '');
  const b = resolveId(db, 'works', sp.get('b') ?? '');
  const set = (k: 'a' | 'b', v: string) => {
    const n = new URLSearchParams(sp);
    n.set(k, v);
    setSp(n);
  };
  const sections = a && b ? compareWorks(db, a, b) : [];
  return (
    <article className="page">
      <h1>작품 비교</h1>
      <div className="pickers">
        <Picker label="작품 A" kind="work" value={a} onPick={(v) => set('a', v)} />
        <button
          className="btn"
          onClick={() => setSp(new URLSearchParams({ ...(b ? { a: b } : {}), ...(a ? { b: a } : {}) }))}
        >
          ⇄ 바꾸기
        </button>
        <Picker label="작품 B" kind="work" value={b} onPick={(v) => set('b', v)} />
      </div>
      {a && b && (
        <>
          <p className="muted">같은 언어의 성우끼리만 비교합니다.</p>
          {sections.map((s) => (
            <section key={s.lang} className="lang-section">
              <h2>
                {langLabel(s.lang)} <span className="muted">— {s.rows.length}명</span>
              </h2>
              {s.rows.length === 0 ? (
                <p className="muted">{t.noOverlap}</p>
              ) : (
                <OverlapTable
                  rows={s.rows}
                  aLabel={displayName(db.works[a].title)}
                  bLabel={displayName(db.works[b].title)}
                />
              )}
            </section>
          ))}
        </>
      )}
    </article>
  );
}

export function ComparePersonsPage() {
  const db = useDb();
  const [sp, setSp] = useSearchParams();
  const a = resolveId(db, 'persons', sp.get('a') ?? '');
  const b = resolveId(db, 'persons', sp.get('b') ?? '');
  const other = sp.get('other') === '1';
  const fav = useFavorites();
  const favFr = new Set(fav.franchises.map((f) => f.id));
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null) n.delete(k);
    else n.set(k, v);
    setSp(n);
  };
  const rows = a && b ? comparePersons(db, a, b, { includeOtherVersions: other }) : [];
  return (
    <article className="page">
      <h1>성우 비교</h1>
      <div className="pickers">
        <Picker label="성우 A" kind="person" value={a} onPick={(v) => set('a', v)} />
        <Picker label="성우 B" kind="person" value={b} onPick={(v) => set('b', v)} />
      </div>
      {a && b && (
        <>
          <div className="filters">
            <Toggle
              label="다른 버전(언어) 출연도 포함"
              checked={other}
              onChange={(v) => set('other', v ? '1' : null)}
            />
          </div>
          <h2>공동 출연 작품 ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="muted">함께 출연한 작품이 없습니다.</p>
          ) : (
            <table className="simple">
              <thead>
                <tr>
                  <th>작품</th>
                  <th>{displayName(db.persons[a].name)}</th>
                  <th>{displayName(db.persons[b].name)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.work.id} className={favFr.has(r.work.franchise_id) ? 'fav-row' : ''}>
                    <td>
                      {favFr.has(r.work.franchise_id) && <span className="star">★ </span>}
                      <Link to={`/work/${r.work.id}`}>{displayName(r.work.title)}</Link>
                      {!r.sameVersion && <div className="muted small">서로 다른 버전</div>}
                    </td>
                    <td>
                      <CreditList list={r.a} />
                    </td>
                    <td>
                      <CreditList list={r.b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </article>
  );
}

export function VsFavoritesPage() {
  const db = useDb();
  const { id = '' } = useParams();
  const wid = resolveId(db, 'works', id);
  const fav = useFavorites();
  if (!wid) return <NotFound />;
  const w = db.works[wid];
  const favIds = fav.franchises.map((f) => f.id);
  const others = favIds.filter((f) => f !== w.franchise_id && db.franchises[f]);
  const sections = compareWithFavorites(db, wid, favIds);
  return (
    <article className="page">
      <p className="crumb">
        <Link to={`/work/${wid}`}>{displayName(w.title)}</Link>
      </p>
      <h1>내가 좋아하는 작품과 비교</h1>
      {others.length === 0 ? (
        <p className="muted">{t.favoritesEmpty} (현재 작품의 시리즈는 비교 대상에서 제외됩니다.)</p>
      ) : (
        <>
          <p className="muted">즐겨찾기한 시리즈 {others.length}개와 성우가 겹치는지 언어별로 비교합니다.</p>
          {sections.map((s) => (
            <section key={s.lang} className="lang-section">
              <h2>{langLabel(s.lang)}</h2>
              {s.rows.length === 0 && <p className="muted">{t.noOverlap}</p>}
              {s.rows.map((f) => (
                <details key={f.franchise} open className="fav-overlap">
                  <summary>
                    <span className="star">★</span>{' '}
                    <Link to={`/franchise/${f.franchise}`}>「{displayName(db.franchises[f.franchise].title)}」</Link> —
                    겹치는 성우 {f.rows.length}명
                  </summary>
                  <OverlapTable
                    rows={f.rows}
                    aLabel={`${displayName(w.title)} (현재 작품)`}
                    bLabel="즐겨찾기 시리즈"
                    showWorkB
                  />
                </details>
              ))}
            </section>
          ))}
        </>
      )}
    </article>
  );
}
