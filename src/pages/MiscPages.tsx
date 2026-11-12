import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SpoilerSettingToggle } from '../components/common';
import { entryPath, HitLabel, SearchBox } from '../components/Search';
import { useDb } from '../data/DbContext';
import { displayName } from '../data/i18n-data';
import { search } from '../data/queries';
import { t } from '../i18n/ko';
import { favoritesStore, mergeFavorites, toggleFavorite, useFavorites, validateFavorites } from '../state/favorites';
import { storageAvailable } from '../state/storage';

export function HomePage() {
  const db = useDb();
  const nav = useNavigate();
  const fav = useFavorites();
  const works = Object.values(db.works).slice().reverse();
  return (
    <article className="page home">
      <h1>{t.appName}</h1>
      <p className="muted">{t.tagline}</p>
      <SearchBox autoFocus onSubmit={(q) => nav(`/search?q=${encodeURIComponent(q)}`)} />
      <div className="actions">
        <Link className="btn" to="/compare/works">
          작품 2개 비교
        </Link>
        <Link className="btn" to="/compare/persons">
          성우 2명 비교
        </Link>
        <Link className="btn" to="/favorites">
          즐겨찾기 ({fav.franchises.length + fav.persons.length})
        </Link>
      </div>
      <section>
        <h2>수록 작품 ({works.length})</h2>
        <ul className="cards">
          {works.map((w) => (
            <li key={w.id}>
              <Link to={`/work/${w.id}`}>
                <strong>{displayName(w.title)}</strong>
                <span className="muted">
                  {t.workType[w.type]} · {w.start_date?.slice(0, 4)} · 배역{' '}
                  {w.versions.reduce((n, v) => n + v.credits.length, 0)}건
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export function SearchPage() {
  const db = useDb();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get('q') ?? '';
  const hits = search(db, q);
  const groups = (['person', 'work', 'franchise', 'character'] as const).map((k) => ({
    k,
    list: hits.filter((h) => h.entry.kind === k),
  }));
  return (
    <article className="page">
      <h1>검색</h1>
      <SearchBox key={q} initial={q} onSubmit={(nq) => nav(`/search?q=${encodeURIComponent(nq)}`)} />
      {q && hits.length === 0 && <p className="muted">{t.noResults}</p>}
      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <section key={g.k}>
            <h2>
              {t.kind[g.k]} ({g.list.length})
            </h2>
            <ul className="list">
              {g.list.slice(0, 50).map((h) => (
                <li key={h.entry.id}>
                  <Link to={entryPath(h.entry)}>
                    <HitLabel hit={h} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </article>
  );
}

export function FavoritesPage() {
  const db = useDb();
  const fav = useFavorites();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>('');
  const [pending, setPending] = useState<ReturnType<typeof validateFavorites> | null>(null);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(fav, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `va-archive-favorites-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(validateFavorites(JSON.parse(await f.text())));
      setMsg('');
    } catch (e) {
      setPending(null);
      setMsg(`가져오기 실패: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    favoritesStore.set(
      mode === 'merge' ? mergeFavorites(fav, pending) : { ...pending, updatedAt: new Date().toISOString() },
    );
    setMsg(mode === 'merge' ? '병합했습니다.' : '덮어썼습니다.');
    setPending(null);
  };

  return (
    <article className="page">
      <h1>즐겨찾기</h1>
      {!storageAvailable() && <div className="banner banner-warn">{t.storageUnavailable}</div>}
      <section>
        <h2>시리즈 ({fav.franchises.length})</h2>
        {fav.franchises.length === 0 && <p className="muted">{t.favoritesEmpty}</p>}
        <ul className="list">
          {fav.franchises.map((f) => {
            const fr = db.franchises[f.id] ?? db.franchises[db.redirects.franchises[f.id]];
            return (
              <li key={f.id}>
                {fr ? (
                  <Link to={`/franchise/${fr.id}`}>{displayName(fr.title)}</Link>
                ) : (
                  <span className="muted">{f.id} (데이터에서 찾을 수 없음)</span>
                )}{' '}
                <button className="chip-btn" onClick={() => toggleFavorite('franchises', f.id)}>
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2>성우 ({fav.persons.length})</h2>
        <ul className="list">
          {fav.persons.map((f) => {
            const p = db.persons[f.id] ?? db.persons[db.redirects.persons[f.id]];
            return (
              <li key={f.id}>
                {p ? (
                  <Link to={`/person/${p.id}`}>{displayName(p.name)}</Link>
                ) : (
                  <span className="muted">{f.id} (데이터에서 찾을 수 없음)</span>
                )}{' '}
                <button className="chip-btn" onClick={() => toggleFavorite('persons', f.id)}>
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2>백업</h2>
        <div className="actions">
          <button className="btn" onClick={exportFile}>
            내보내기 (JSON)
          </button>
          <label className="btn">
            가져오기…
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        </div>
        {pending && (
          <div className="banner banner-info">
            시리즈 {pending.franchises.length}개, 성우 {pending.persons.length}명을 가져옵니다.{' '}
            <button className="btn" onClick={() => apply('merge')}>
              병합
            </button>{' '}
            <button className="btn" onClick={() => apply('replace')}>
              덮어쓰기
            </button>
          </div>
        )}
        {msg && <p role="status">{msg}</p>}
      </section>
    </article>
  );
}

export function AboutPage() {
  const db = useDb();
  return (
    <article className="page">
      <h1>이 사이트에 대해</h1>
      <p>
        성우·작품·배역 정보를 브라우저 안에서만 조회하는 정적 사이트입니다. 모든 데이터는 GitHub 레포에 포함되어
        있습니다.
      </p>
      <h2>출처 등급</h2>
      <ul>
        <li>등급 1: 공식 사이트·공식 SNS·방송사·소속사 등 1차 출처</li>
        <li>등급 2: 위키백과, Anime News Network, 주요 매체 기사</li>
        <li>등급 3: 나무위키, MyAnimeList, 팬 위키 등 보조 출처 (등급 3만 있는 배역은 "미검증"으로 표시)</li>
      </ul>
      <h2>설정</h2>
      <SpoilerSettingToggle />
      <h2>데이터</h2>
      <p className="muted">
        스키마 {db.schemaVersion} · 빌드 {db.builtAt.slice(0, 16).replace('T', ' ')} · 성우{' '}
        {Object.keys(db.persons).length}명 · 작품 {Object.keys(db.works).length}개
      </p>
    </article>
  );
}
