import { Link, useParams } from 'react-router-dom';
import { CreditMeta } from '../components/CreditView';
import { ExternalImage, NameView, Spoiler, TextView, WikiLinks } from '../components/common';
import { useDb } from '../data/DbContext';
import { displayName, displayText, langLabel, langOrder } from '../data/i18n-data';
import { getCharacter, personPath, resolveCredit } from '../data/queries';
import { useSettings } from '../state/settings';
import { useEffect } from 'react';
import { NotFound } from './NotFound';

export function CharacterPage() {
  const db = useDb();
  const { id = '', cid = '' } = useParams();
  const ch = getCharacter(db, id, cid);
  const { showSpoilers } = useSettings();
  useEffect(() => {
    if (ch) document.title = `${ch.spoiler && !showSpoilers ? '스포일러' : displayName(ch.name)} — VA Archive`;
  }, [ch, showSpoilers]);
  if (!ch) return <NotFound />;
  const fr = db.franchises[id];
  const key = `${id}/${cid}`;
  const credits = (db.idx.creditsByCharacter[key] ?? []).map((r) => resolveCredit(db, r));
  const byWork = new Map<string, typeof credits>();
  for (const c of credits) byWork.set(c.work.id, [...(byWork.get(c.work.id) ?? []), c]);
  const fv = db.idx.firstVoicedByCharacter[key] ?? {};
  const fa = ch.first_appearance;

  return (
    <article className="page">
      <p className="crumb">
        <Link to={`/franchise/${fr.id}`}>{displayName(fr.title)}</Link> 시리즈 · 캐릭터
      </p>
      <header className="profile">
        {ch.image && (
          <Spoiler active={ch.spoiler}>
            <ExternalImage image={ch.image} alt={displayName(ch.name)} />
          </Spoiler>
        )}
        <div>
          <h1>
            <Spoiler active={ch.spoiler}>
              <NameView name={ch.name} />
            </Spoiler>
          </h1>
          {ch.description && (
            <p>
              <Spoiler active={ch.spoiler}>
                <TextView text={ch.description} />
              </Spoiler>
            </p>
          )}
          <dl className="facts">
            {(db.idx.franchisesByCharacter[key]?.length ?? 0) > 1 && (
              <>
                <dt>등장 시리즈</dt>
                <dd>
                  {db.idx.franchisesByCharacter[key].map((f, i) => (
                    <span key={f}>
                      {i > 0 && ' · '}
                      <Link to={`/franchise/${f}`}>{displayName(db.franchises[f].title)}</Link>
                    </span>
                  ))}
                </dd>
              </>
            )}
            {fa && (
              <>
                <dt>첫 등장</dt>
                <dd>
                  <Link to={`/work/${fa.work}`}>{displayName(db.works[fa.work].title)}</Link>
                </dd>
              </>
            )}
            {Object.keys(fv)
              .sort(langOrder)
              .map((lang) => {
                const f = fv[lang];
                const same = fa && fa.work === f.work;
                return (
                  <span key={lang} className="contents">
                    <dt>첫 음성 ({langLabel(lang)})</dt>
                    <dd>
                      {same ? (
                        <span className="muted">첫 등장과 같음</span>
                      ) : (
                        <>
                          <Link to={`/work/${f.work}`}>{displayName(db.works[f.work].title)}</Link>
                        </>
                      )}
                    </dd>
                  </span>
                );
              })}
          </dl>
          <WikiLinks wiki={ch.wikipedia} />
        </div>
      </header>
      <section>
        <h2>성우</h2>
        <table className="simple">
          <thead>
            <tr>
              <th>작품</th>
              <th>버전</th>
              <th>성우</th>
            </tr>
          </thead>
          <tbody>
            {[...byWork.entries()].flatMap(([wid, list]) =>
              list
                .sort((a, b) => langOrder(a.version.language, b.version.language))
                .map((c, i) => (
                  <tr key={`${wid}-${c.ref.vi}-${c.ref.ci}`}>
                    <td>{i === 0 && <Link to={`/work/${wid}`}>{displayName(c.work.title)}</Link>}</td>
                    <td>{displayText(c.version.label)}</td>
                    <td>
                      <Spoiler active={c.credit.spoiler}>
                        <Link to={personPath(db, c.credit.person)}>
                          {displayName(db.persons[c.credit.person].name)}
                        </Link>{' '}
                        <CreditMeta credit={c.credit} showRole />
                      </Spoiler>
                    </td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </section>
    </article>
  );
}
