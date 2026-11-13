import { Link } from 'react-router-dom';
import { useDb } from '../data/DbContext';
import { displayName, displayText } from '../data/i18n-data';
import type { ResolvedCredit } from '../data/queries';
import { t } from '../i18n/ko';
import type { Credit } from '../types/data';
import { Spoiler, TextView, VerificationBadge } from './common';

/** part · 비고를 한 줄로 */
export function CreditMeta({ credit, showRole = false }: { credit: Credit; showRole?: boolean }) {
  const bits = [showRole ? t.role[credit.role] : '', credit.part ? t.part[credit.part] : ''].filter(Boolean);
  return (
    <span className="credit-meta">
      {bits.length > 0 && <span className="muted">{bits.join(' · ')}</span>}
      {credit.credited_as && <span className="muted"> (크레딧: {credit.credited_as})</span>}
      {credit.note && (
        <span className="note">
          {' '}
          — <TextView text={credit.note} />
        </span>
      )}
      <VerificationBadge status={credit.verification} />
    </span>
  );
}

/** "캐릭터 (버전)" 링크 */
export function CharacterRef({ rc, showVersion = true }: { rc: ResolvedCredit; showVersion?: boolean }) {
  const db = useDb();
  const fr = db.franchises[rc.ref.charFranchise];
  const ch = rc.character;
  return (
    <span className="char-ref">
      <Link to={`/franchise/${fr.id}/character/${rc.ref.character}`}>
        <Spoiler active={ch?.spoiler}>{ch ? displayName(ch.name) : rc.ref.character}</Spoiler>
      </Link>
      {showVersion && <span className="muted"> · {displayText(rc.version.label)}</span>}
    </span>
  );
}
