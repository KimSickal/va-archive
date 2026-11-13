import { Link, useParams } from 'react-router-dom';
import { NameView, SourceList, Spoiler, WikiLinks, yearOf } from '../components/common';
import { FavoriteToggle } from '../components/FavoriteToggle';
import { useDb } from '../data/DbContext';
import { displayName } from '../data/i18n-data';
import { getCharacter, resolveId } from '../data/queries';
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
  const guests = (db.idx.guestCharactersByFranchise[fid] ?? []).map((k) => k.split('/') as [string, string]);
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
      {guests.length > 0 && (
        <section>
          <h2>다른 시리즈에서 온 캐릭터 ({guests.length})</h2>
          <ul className="chips">
            {guests.map(([gf, gc]) => {
              const ch = getCharacter(db, gf, gc);
              return (
                <li key={`${gf}/${gc}`}>
                  <Link to={`/franchise/${gf}/character/${gc}`}>
                    <Spoiler active={ch?.spoiler}>{ch ? displayName(ch.name) : gc}</Spoiler>
                  </Link>{' '}
                  <span className="muted small">{displayName(db.franchises[gf].title)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <SourceList sources={fr.sources} researchedAt={fr.meta.researched_at} />
    </article>
  );
}
