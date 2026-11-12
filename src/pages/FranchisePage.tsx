import { Link, useParams } from 'react-router-dom';
import { NameView, SourceList, Spoiler, WikiLinks, yearOf } from '../components/common';
import { FavoriteToggle } from '../components/FavoriteToggle';
import { useDb } from '../data/DbContext';
import { displayName } from '../data/i18n-data';
import { resolveId } from '../data/queries';
import { t } from '../i18n/ko';
import { NotFound } from './NotFound';

export function FranchisePage() {
  const db = useDb();
  const { id = '' } = useParams();
  const fid = resolveId(db, 'franchises', id);
  if (!fid) return <NotFound />;
  const fr = db.franchises[fid];
  const works = db.idx.worksByFranchise[fid] ?? [];
  const named = fr.characters.filter((c) => !c.nameless);
  return (
    <article className="page">
      <h1>
        <NameView name={fr.title} />
      </h1>
      <div className="actions">
        <FavoriteToggle kind="franchises" id={fid} label={t.favoriteSeries(displayName(fr.title))} />
        <WikiLinks wiki={fr.wikipedia} />
      </div>
      <section>
        <h2>작품</h2>
        <ul className="list">
          {works.map((w) => (
            <li key={w}>
              <Link to={`/work/${w}`}>{displayName(db.works[w].title)}</Link>{' '}
              <span className="muted">
                {t.workType[db.works[w].type]} · {yearOf(db.works[w].start_date)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>캐릭터 ({named.length})</h2>
        <ul className="chips">
          {named.map((c) => (
            <li key={c.id}>
              <Link to={`/franchise/${fid}/character/${c.id}`}>
                <Spoiler active={c.spoiler}>{displayName(c.name)}</Spoiler>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <SourceList sources={fr.sources} researchedAt={fr.meta.researched_at} />
    </article>
  );
}
