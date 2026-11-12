/** PartialDate(YYYY | YYYY-MM | YYYY-MM-DD) 유틸 */

/** 부족한 부분을 기간의 마지막 날로 채운다 (보수적 비교용). */
export function partialDateEnd(d: string): string {
  const [y, m, day] = d.split('-');
  if (day) return d;
  if (m) {
    const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return `${y}-${m}-${String(last).padStart(2, '0')}`;
  }
  return `${y}-12-31`;
}

/** 부족한 부분을 기간의 첫날로 채운다 (정렬용). */
export function partialDateStart(d: string): string {
  const [y, m, day] = d.split('-');
  return `${y}-${m ?? '01'}-${day ?? '01'}`;
}

export function maxDate(dates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  for (const d of dates) {
    if (!d) continue;
    const e = partialDateEnd(d);
    if (!best || e > partialDateEnd(best)) best = d;
  }
  return best;
}
