import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CreditMeta } from '../components/CreditView';
import {
  ExternalImage,
  NameView,
  SourceList,
  Spoiler,
  StalenessBanner,
  Toggle,
  VerificationBadge,
  WikiLinks,
} from '../components/common';
import { FavoriteToggle } from '../components/FavoriteToggle';
import { useDb } from '../data/DbContext';
import { displayName, displayText, langOrder } from '../data/i18n-data';
import { castTable, personPath, resolveId, staleness } from '../data/queries';
import { t } from '../i18n/ko';
import { updateSettings, useSettings } from '../state/settings';
import { NotFound } from './NotFound';

export function WorkPage() {
  const db = useDb();
  const { id = '' } = useParams();
  const wid = resolveId(db, 'works', id);
  const settings = useSettings();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const rows = useMemo(() => (wid ? castTable(db, wid) : []), [db, wid]);
  if (!wid) return <NotFound />;
  const w = db.works[wid];
  const fr = db.franchises[w.franchise_id];
  const siblings = (db.idx.worksByFranchise[fr.id] ?? []).filter((x) => x !== wid);
  const versions = w.versions
    .map((v, vi) => ({ v, vi }))
    .sort((a, b) => langOrder(a.v.language, b.v.language) || a.vi - b.vi);
  const visibleVersions = versions.filter((x) => !hidden.has(x.vi));
  const shown = settings.showMinorRoles ? rows : rows.filter((r) => r.role !== 'minor');
  const minorCount = rows.length - rows.filter((r) => r.role !== 'minor').length;
  const companies = [
    ['제작', w.studios],
    ['개발', w.developers],
    ['배급/퍼블리셔', w.publishers],
  ] as const;

  return (
    <article className="page">
      <StalenessBanner s={staleness(db, wid)} />
      <header>
        <p className="crumb">
          <Link to={`/franchise/${fr.id}`}>{displayName(fr.title)}</Link> 시리즈
        </p>
        <h1>
          <NameView name={w.title} />
        </h1>
        <dl className="facts">
          <dt>유형</dt>
          <dd>{t.workType[w.type]}</dd>
          <dt>상태</dt>
          <dd>{t.status[w.status]}</dd>
          {w.start_date && (
            <>
              <dt>{w.type === 'game' ? '출시' : w.type === 'anime_movie' ? '개봉' : '방영'}</dt>
              <dd>
                {w.start_date}
                {w.end_date && w.end_date !== w.start_date ? ` ~ ${w.end_date}` : ''}
              </dd>
            </>
          )}
          {w.episodes && (
            <>
              <dt>화수</dt>
              <dd>{w.episodes}화</dd>
            </>
          )}
          {w.runtime_min && (
            <>
              <dt>상영시간</dt>
              <dd>{w.runtime_min}분</dd>
            </>
          )}
          {companies.map(([label, list]) =>
            list?.length ? (
              <span key={label} className="contents">
                <dt>{label}</dt>
                <dd>{list.map((n) => displayName(n)).join(', ')}</dd>
              </span>
            ) : null,
          )}
          {w.platforms && (
            <>
              <dt>플랫폼</dt>
              <dd>{w.platforms.join(', ')}</dd>
            </>
          )}
        </dl>
        <div className="actions">
          <FavoriteToggle kind="franchises" id={fr.id} label={t.favoriteSeries(displayName(fr.title))} />
          <Link className="btn primary" to={`/work/${wid}/vs-favorites`}>
            {t.compareWithFavorites}
          </Link>
          <Link className="btn" to={`/compare/works?a=${wid}`}>
            {t.compareWithOther}
          </Link>
          <WikiLinks wiki={w.wikipedia} />
          <VerificationBadge status={w.meta.verification.status} />
        </div>
        {siblings.length > 0 && (
          <p className="siblings">
            같은 시리즈:{' '}
            {siblings.map((s, i) => (
              <span key={s}>
                {i > 0 && ' · '}
                <Link to={`/work/${s}`}>{displayName(db.works[s].title)}</Link>
              </span>
            ))}
          </p>
        )}
      </header>

      <section>
        <h2>캐스팅</h2>
        <div className="filters">
          <Toggle
            label={t.showMinor}
            checked={settings.showMinorRoles}
            onChange={(v) => updateSettings({ showMinorRoles: v })}
          />
          <Toggle
            label={t.showImages}
            checked={settings.showCharacterImages}
            onChange={(v) => updateSettings({ showCharacterImages: v })}
          />
          {versions.length > 1 &&
            versions.map(({ v, vi }) => (
              <Toggle
                key={vi}
                label={displayText(v.label)}
                checked={!hidden.has(vi)}
                onChange={(on) => {
                  const next = new Set(hidden);
                  if (on) next.delete(vi);
                  else next.add(vi);
                  setHidden(next);
                }}
              />
            ))}
        </div>
        <div className="table-wrap">
          <table className="cast">
            <thead>
              <tr>
                <th>캐릭터</th>
                {visibleVersions.map(({ v, vi }) => (
                  <th key={vi}>
                    {displayText(v.label)}
                    {v.release_date && <div className="muted small">{v.release_date}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.character.id} className={`role-row-${r.role}`}>
                  <th scope="row" data-label="캐릭터">
                    <div className="char-cell">
                      {settings.showCharacterImages && r.character.image && (
                        <Spoiler active={r.character.spoiler}>
                          <ExternalImage image={r.character.image} alt={displayName(r.character.name)} size="sm" />
                        </Spoiler>
                      )}
                      <div>
                        <Link to={`/franchise/${fr.id}/character/${r.character.id}`}>
                          <Spoiler active={r.character.spoiler}>
                            <NameView name={r.character.name} sub={false} />
                          </Spoiler>
                        </Link>
                        <div className="muted small">{t.role[r.role]}</div>
                      </div>
                    </div>
                  </th>
                  {visibleVersions.map(({ v, vi }) => (
                    <td key={vi} data-label={displayText(v.label)}>
                      {(r.byVersion[vi] ?? []).map((c, i) => (
                        <div key={i} className="cast-cell">
                          <Spoiler active={c.spoiler}>
                            <Link to={personPath(db, c.person)}>{displayName(db.persons[c.person].name)}</Link>{' '}
                            <CreditMeta credit={c} />
                          </Spoiler>
                        </div>
                      ))}
                      {!r.byVersion[vi] && <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!settings.showMinorRoles && minorCount > 0 && (
          <button className="btn" onClick={() => updateSettings({ showMinorRoles: true })}>
            {t.moreMinor(minorCount)}
          </button>
        )}
      </section>
      <SourceList sources={w.sources} researchedAt={w.meta.researched_at} />
    </article>
  );
}
