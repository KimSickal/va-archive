# 04. 데이터 빌드와 브라우저용 DB

## 1. 검토: GitHub Actions에서 DB로 만들면 검색 성능이 좋아질까?

**결론: "원본은 텍스트, 빌드에서 DB화"라는 방향은 채택한다. 다만 결과물은 SQLite가 아니라 사전 계산 인덱스를 담은 JSON으로 한다.**

### 비교

| 기준 | A. SQLite (sql.js / wa-sqlite) | B. 사전 계산 인덱스 JSON (채택) |
|---|---|---|
| 추가 다운로드 | WASM 런타임 약 0.6~1MB + DB 파일 | 없음 (DB 파일만) |
| 초기화 | WASM 컴파일과 DB 로드에 수백 ms | JSON 파싱 수십 ms |
| 조회 비용 | SQL 파싱·실행. 단건 조회도 수십~수백 μs | `Map.get` O(1). 역인덱스를 미리 만들어 두므로 조인이 필요 없음 |
| 두 작품 겹침 계산 | JOIN 쿼리 | 미리 만든 `work→language→person[]` 집합끼리 교집합. 수백 개 수준이면 1ms 미만 |
| 한국어/일본어 검색 | FTS5 기본 토크나이저가 CJK를 제대로 분리하지 못해 별도 처리가 필요 | 빌드 시 정규화 키를 만들어 두고 부분 일치 |
| 타입 안정성 | SQL 결과를 수동으로 매핑 | 스키마에서 생성한 TS 타입을 그대로 사용 |
| 레포 영향 | 산출물을 커밋하지 않으면 동일 | 동일 |

### 판단 근거

- **규모**: 작품 수백 개 × 버전 2~3개 × 배역 30~100건이면 Credit은 대략 1만~5만 건이다. 정규화한 JSON으로 수 MB이고, gzip 후 수백 KB~1MB 정도다(GitHub Pages는 gzip을 자동 적용). 이 정도는 메모리에 통째로 올려도 부담이 없다.
- **이 사이트의 조회 패턴**: ID로 단건 조회, 역인덱스 조회, 집합 교집합이 전부다. 임의 SQL이 필요한 질의가 없으므로 미리 계산한 인덱스가 SQL 엔진보다 빠르고 단순하다.
- "DB화로 성능 향상"의 실질은 **인덱스를 미리 계산해 두는 것**이다. 이 부분은 B에서 빌드 단계가 그대로 수행한다.

### 재검토 기준

다음 중 하나라도 해당하면 SQLite와 HTTP Range 요청(`sql.js-httpvfs`) 방식으로 전환을 검토한다. 조회 계층을 `src/data/queries.ts`로 격리해 두었으므로 교체 비용은 그 파일로 한정된다.
- `db.json`이 gzip 후 5MB를 넘을 때
- Credit이 50만 건을 넘을 때
- 사용자가 직접 조건을 조합하는 고급 검색(임의 필터와 정렬)이 요구될 때

## 2. 빌드 파이프라인

```
npm run validate      # scripts/validate-data.ts: 스키마 검증 + 참조 무결성
npm run build:data    # scripts/build-data.ts: public/data/db.<hash>.json + manifest.json 생성
npm run build         # tsc + vite build (build:data 포함)
```

- `db.<hash>.json`의 hash는 내용 해시(앞 8자리)다. 파일명이 내용에 따라 바뀌므로 캐시를 무효화하는 문제가 생기지 않는다.
- `public/data/manifest.json`은 `{ "db": "db.3fa9c1e2.json", "built_at": "...", "schema_version": "1.0.0", "counts": {...} }` 형태다. 앱은 이 파일을 `cache: no-cache`로 받아 최신 DB 파일명을 알아낸다.
- 두 파일 모두 `.gitignore`에 등록하고, CI에서만 생성한다.

## 3. `db.json` 구조

```ts
interface Db {
  schemaVersion: string;
  builtAt: string;

  // 정규화 테이블 (원본을 그대로 옮기되 $schema·sources 등 표시에 쓰지 않는 필드는 정리)
  persons:    Record<PersonId, Person>;
  franchises: Record<FranchiseId, Franchise>;
  works:      Record<WorkId, Work>;          // versions[].credits 포함

  // 사전 계산 인덱스
  idx: {
    // 성우 → 출연 Credit (성우 페이지, 성우 비교용)
    creditsByPerson: Record<PersonId, CreditRef[]>;
    // 작품 → 언어 → 출연 성우 ID 목록 (작품 비교, 즐겨찾기 비교용)
    personsByWorkLang: Record<WorkId, Record<Lang, PersonId[]>>;
    // 프랜차이즈 → 언어 → 출연 성우 ID 목록 (즐겨찾기 비교용, 소속 작품 전체의 합집합)
    personsByFranchiseLang: Record<FranchiseId, Record<Lang, PersonId[]>>;
    // 성우 → 출연 작품 ID 목록 (성우 비교용)
    worksByPerson: Record<PersonId, WorkId[]>;
    // 프랜차이즈 → 작품 ID (start_date 순)
    worksByFranchise: Record<FranchiseId, WorkId[]>;
    // 캐릭터("franchiseId/characterId") → 언어 → 첫 음성 출연 {work, version}
    firstVoicedByCharacter: Record<string, Record<Lang, { work: WorkId; version: string }>>;
    // 작품별 "마지막 공개일" (재조사 안내용, 아래 5절)
    lastReleaseByWork: Record<WorkId, string | null>;
  };

  search: SearchEntry[];
}

interface CreditRef {
  work: WorkId; version: string; lang: Lang;
  franchise: FranchiseId; character: string;
  role?: string; part?: string; note?: string;
}

interface SearchEntry {
  spoiler?: boolean;       // true면 자동완성에서 제외하고, 정확히 일치할 때만 가린 상태로 노출
  kind: 'person' | 'work' | 'character';
  id: string;              // character는 "franchiseId/characterId"
  label: string;           // 표시명 (03 문서 2.4절 규칙)
  sub: string;             // 보조 표시 (원어명, 작품 유형, 연도 등)
  keys: string[];          // 정규화된 검색 키 (모든 이름과 별칭)
}
```

## 4. 검색

- **정규화 함수**: 빌드와 런타임이 같은 코드(`src/data/normalize.ts`)를 공유한다.
  1. NFKC 정규화 (전각/반각 통일)
  2. 소문자화
  3. 가타카나를 히라가나로 변환
  4. 공백, 중점(`・`, `·`), 하이픈, 구두점 제거
  5. 이체자 일부 통일 (`﨑`→`崎`, `髙`→`高` 등. 매핑 테이블로 관리)
- **매칭**: 입력을 정규화한 뒤 `keys` 중 하나에 대해
  1. 완전 일치
  2. 접두 일치
  3. 부분 일치

  순으로 점수를 매긴다. 결과는 성우, 작품, 캐릭터별로 그룹화하고 각각 상위 N개를 보여준다.
- 수천 개 항목이라 선형 탐색으로도 1ms 수준이다. 별도 검색 라이브러리는 쓰지 않는다.
- 초성 검색(후순위): 빌드할 때 `ko` 이름의 초성 키를 `keys`에 추가하는 것만으로 구현할 수 있다.

## 5. 재조사 안내 기준 계산

작품별 "마지막 공개일" `lastRelease`는 아래 값들 중 가장 늦은 날짜다.
- `work.end_date` (없으면 `start_date`)
- 각 `version.last_release_date` (없으면 `release_date`)

런타임 판정 (`src/data/staleness.ts`):

| 조건 | 표시 |
|---|---|
| `researched_at < lastRelease` | ⚠ "이 정보는 {조사일}에 조사되었으며, 이후 {마지막 공개일}까지 방영/공개된 내용이 반영되지 않았을 수 있습니다. 재조사가 필요합니다." |
| `status ∈ {airing, live_service, announced}` | ℹ "방영/서비스 중인 작품입니다. {조사일} 기준 정보입니다." |
| 그 외 | 표시하지 않음. 조사일은 페이지 하단에 항상 표시 |

- 날짜 비교 규칙은 [03](03-data-model.md)의 PartialDate 규칙을 따른다. 부족한 부분은 기간의 끝으로 채운다.
- 같은 판정을 빌드 스크립트에서도 실행해 **재조사 필요 작품 목록**을 출력한다. 이 목록은 수집 파이프라인의 갱신 대상 선정에 쓴다 ([06](06-data-collection.md) 참고).

## 6. 로딩 전략

1. 앱 시작 → `manifest.json` 요청 → `db.<hash>.json` 요청. 둘 다 GitHub Pages CDN에서 받고, 이후에는 브라우저 HTTP 캐시를 쓴다.
2. 로딩 중에는 스켈레톤 UI를 보여준다. 실패하면 재시도 버튼을 보여준다.
3. 로드한 `Db`는 React Context로 제공한다. 인덱스는 빌드에서 이미 만들어졌으므로 런타임 가공은 최소화한다.
4. 규모가 커져 초기 로딩이 문제가 되면, `works`를 작품별 파일로 나눠 필요할 때 로드하는 방식을 검토한다. 이 경우 `idx`와 `search`만 담은 코어 파일을 따로 둔다. 현재 규모에서는 불필요하다.
