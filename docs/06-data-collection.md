# 06. 데이터 수집·검증 파이프라인

Claude Code를 로컬에서 실행하고, 레포에 포함된 스킬과 서브에이전트로 작품 데이터를 수집·검증해 PR로 반영한다.

## 1. 구성 요소

### 역할
| 역할 | 스킬 | 하는 일 | 데이터 판단 |
|---|---|---|---|
| 오케스트레이터 (메인 세션) | `add-work` | 작업 배정·잠금, 스크립트 실행, 에이전트 호출, 결과의 기계적 반영, 사용자 질문 전달 | **하지 않음** |
| researcher | `research-work` | 조사해서 스테이징에 작성, fix 모드로 이슈 수정 | 작성 |
| verifier | `verify-work` | 독립 검증, 이슈 보고 (데이터 수정 안 함) | 지적만 |
| mediator | `resolve-conflict` | 병렬 작업 간·출처 간 **사실 충돌**을 제3자로서 조사·결정, 결정 기록 | 사실 문제만 |
| 사용자 | — | mediator가 못 정한 것, **정책 문제**(규칙이 없는 경우) | 최종 결정 |

오케스트레이터가 판단하지 않는 이유: 판단이 한 세션의 대화 맥락에 묻히면 일관성을 확인할 수 없다. 판단은 근거와 함께 `data/decisions/`에 남는 역할(mediator·사용자)만 한다.

### 파일
```
.claude/skills/
├─ add-work/SKILL.md            # 오케스트레이터 (중립 규칙, 실행 순서)
├─ research-work/SKILL.md       # researcher
├─ verify-work/SKILL.md         # verifier
└─ resolve-conflict/SKILL.md    # mediator
data/decisions/<날짜>-<요약>.json  # 중재·사용자 결정 기록 (decision.schema.json)
scripts/cli/
├─ person-id.ts                 # 새 성우 만들기 전 필수: 기존·병렬 작업의 같은 사람 검색, 내부 ID 발급 (11절)
├─ lock.ts                      # 시리즈 단위 작업 잠금 (11절)
├─ merge-staging.ts             # 스테이징 → data/ (또는 미리보기) 병합, 병합 후 스테이징 보관
├─ assign-slugs.ts              # 표시 ID 재계산 + 리다이렉트 기록
├─ migrate-person-ids.ts        # 성우 내부 ID 일괄 재생성 (1회성)
├─ wiki-intro.ts                # 위키백과 도입부·후리가나 일괄 조회
└─ skill-hash.ts                # 스킬 최신 여부 점검 (3절)
scripts/lib/http.ts             # 사이트별 공용 속도 제한 + 캐시 (12절)
```

모든 스킬 `SKILL.md`의 frontmatter에는 다음을 둔다.
```yaml
schema_version: 0.2.0     # 이 스킬이 기준으로 삼는 data/schema/VERSION (CI가 일치 확인)
skill_version: 0.4.0      # 스킬 자체 버전. 데이터의 meta.skill_version에 기록됨
```

## 2. 전체 흐름

```
/add-work "작품 A" "작품 B" …
   │
   ├─ 0. Preflight: 스킬 최신 여부(3절), 작업 트리·main 동기화, validate 통과
   │
   ├─ 1. 배정: 작품 → 시리즈 단위 작업으로 묶기, 시리즈 잠금, 동시 최대 3개 (11절)
   │
   ├─ 2~5. 작업마다 병렬로
   │     조사(researcher) → 검증 1(verifier) → [error 있으면] 재조사 → 검증 2
   │     · 성우는 person-id.ts 로만 ID 발급 (같은 사람 = 같은 ID)
   │
   ├─ 6. 충돌 탐지 (기계적, 오케스트레이터)
   │     · data + 모든 스테이징을 미리보기로 병합 → validate
   │     · 수집: 검증 오류(중복 의심 성우 등), 병합 충돌, person-id conflict, 검증 2 뒤 남은 error
   │
   ├─ 7. 중재 (mediator) → resolved / unresolved / escalate
   │     · unresolved(근거 부족)·escalate(정책 문제) → 사용자 질문 → mediator 가 반영·기록
   │
   └─ 8. 반영: 상태 기록 → data 병합(스테이징 보관) → assign-slugs → validate·test·build
           → 작품별 커밋 → PR → CI → merge → 잠금 해제
```

- `.work/`는 `.gitignore`에 등록한다. 결정은 `data/decisions/`(커밋됨)와 PR 본문에 남는다.
- CI가 실패하면 머지하지 않는다. 데이터 판단이 필요한 실패면 mediator → 사용자 순으로 넘긴다.

## 3. 스킬 최신 여부 점검

**원칙**: 스킬의 정본은 레포의 `.claude/skills/`다. 실행 중인 스킬 텍스트가 레포 최신 main과 한 글자라도 다르면, 갱신한 뒤 갱신된 스킬로 다시 실행한다.

### 해시 정의 (`scripts/cli/skill-hash.ts`)
- 스킬 디렉토리 아래 모든 파일을 상대경로 순으로 정렬한다. 각 파일마다 `상대경로 + \0 + 내용(LF로 정규화) + \0`을 이어 붙인 뒤 SHA-256을 구한다.
- 하위 명령
  - `hash <dir>`: 해시 출력
  - `compare <dirA> <dirB>`: 같은지 비교
  - `sync <from> <to>`: 덮어쓰기 복사 (`to`의 잔여 파일은 삭제)

### 점검 절차

**점검 대상은 지금 실행 중인 스킬 하나뿐이다.** 모든 스킬은 `SKILL.md`의 첫 단계로 자기 자신만 점검한다. 다른 스킬은 그 스킬이 실행될 때 스스로 점검한다.

```
1. H_loaded = hash(실행 중인 스킬 디렉토리)       # 지금 컨텍스트에 로드된 내용
2. git fetch origin main
3. H_latest = hash(origin/main의 .claude/skills/<이 스킬>)   # git show로 읽음
4. H_loaded == H_latest → 진행
5. 다르면:
     · 실행 위치가 레포 안이면 → (오케스트레이터만) git pull --ff-only
     · 레포 밖 사본(~/.claude/skills 등)이면 → sync(origin/main 내용 → 로컬 사본)
     · 스킬을 다시 호출해(갱신된 SKILL.md 재로딩) 처음부터 재실행
     · 재실행 후에도 다르면 무한 반복을 막기 위해 중단하고 사용자에게 보고
```

- 1번에서 해시를 먼저 계산하는 이유: 스킬 텍스트는 갱신 **이전에** 컨텍스트로 로드된다. 파일이 바뀌었다면 지금 따르고 있는 지침은 이미 낡은 버전이다.
- 비교 기준을 로컬 파일이 아닌 `origin/main`으로 잡았다. 그래서 데이터 브랜치에서 작업 중인 서브에이전트(`research-work`, `verify-work`)도 브랜치를 바꾸거나 pull하지 않고 점검할 수 있다. `git pull`은 main 브랜치에서 시작하는 오케스트레이터(`add-work`, `refresh-work`)의 0단계에서만 실행한다.

### 스킬과 스키마의 정합성 (CI가 보장)

로컬 점검은 "레포 최신 스킬과 같은가"만 확인한다. "레포 최신 스킬이 최신 스키마에 맞는가"는 CI(`validate.yml`)가 매 PR마다 강제한다.
- 각 스킬 frontmatter의 `schema_version`이 `data/schema/VERSION`과 같아야 한다.
- `research-work/examples/*.json`이 현재 스키마 검증을 통과해야 한다.

따라서 스키마를 바꾸는 PR은 스킬도 같이 고쳐야 머지할 수 있고(`CHANGELOG.md` 갱신 필수), main의 스킬은 항상 main의 스키마와 맞는다.

## 4. 출처 정책 (`source-policy.md`)

| 등급 | 예 | 사용 규칙 |
|---|---|---|
| **Tier 1** (1차 출처) | 작품 공식 사이트·공식 SNS, 방송사·배급사·게임사 공지, 성우 소속사 프로필, 성우 본인 공식 SNS | 단독 근거 가능 |
| **Tier 2** (신뢰 2차) | Wikipedia (ja/en/ko), Anime News Network Encyclopedia, 주요 매체 기사 (コミックナタリー, アニメイトタイムズ, 오리콘 등) | 단독 근거 가능 |
| **Tier 3** (보조) | 나무위키, MyAnimeList, AniDB, Fandom 위키, 개인 블로그 | 단독 근거 불가. 다른 출처로 보강해야 하고, 보강하지 못하면 `unverified` |

- **Credit**: Tier 1~2 출처가 1개 이상이면 `verified` 후보가 된다. Tier 3만 있으면 `unverified`로 표시하고 사이트에 배지를 띄운다.
  - 한국어 더빙 정보는 Tier 1~2 출처가 드물다. 방송사 공지와 성우 본인 SNS를 먼저 찾고, 그래도 없으면 Tier 3를 쓰되 `unverified`로 남긴다.
- **개인정보**: 출생일과 국적은 Tier 1~2 출처가 있을 때만 기록한다. 비공개 정보, 사생활, 추정치는 기록하지 않는다.
- **저작권과 약관**: 사실 정보(이름, 날짜, 배역)만 저장한다. 시놉시스나 소개문을 베끼지 않고, 이미지도 저장하지 않는다. 스크래핑을 금지하는 사이트는 일반 웹 검색 결과로 열람하는 정도로만 쓴다.

## 5. researcher 지침 요약 (`research-work/SKILL.md`)

1. **작품 기본 정보**: 공식 사이트와 Wikipedia에서 유형, 기간, 화수, 제작사 등을 수집한다.
2. **버전 식별**: 원판과 확인되는 모든 더빙판(언어, 방송사/플랫폼)을 찾는다. 판마다 Version을 하나씩 만든다.
3. **캐릭터**: 프랜차이즈 파일에 있으면 재사용하고 없으면 추가한다. 캐릭터 ID는 로마자 이름을 기준으로 한다.
4. **Credit**: 버전마다 캐릭터-성우를 매핑한다. 교체, 아역, 대역은 `part`/`episodes`/`note`로 표현한다. 모든 Credit에 `source_refs`를 붙인다.
5. **성우**: Person을 새로 만들기 전에 반드시 `person-id.ts`로 내부 ID를 발급받는다(`reuse`면 기존 성우 참조, `conflict`면 만들지 말고 보고 → mediator).
5-0. **첫 등장**: 캐릭터를 새로 만들거나 이미 있는 캐릭터의 더 이른 등장 작품을 등록할 때 `first_appearance`를 채우거나 고친다. 목소리 없이 등장한 경우도 포함한다.
5-1. **스포일러 판정**: 존재나 정체 자체가 작품 중반 이후에 밝혀지는 캐릭터는 `spoiler: true`로 표시한다. 캐릭터 ID도 정체가 드러나지 않게 짓는다(예: `masked-knight`). 공식이 캐스트를 숨겼다가 나중에 공개한 배역은 Credit에 `spoiler: true`를 붙인다. 판정이 애매하면 보고서에 남겨 verifier와 사용자가 확인하게 한다.
6. **범위 기준**: 크레딧에 오른 배역은 **단역과 이름 없는 배역까지 전부** 수집한다. 모든 Credit에 `role`(주연/조연/단역. 게스트는 단역)을 반드시 기록하고, 이름 없는 배역은 캐릭터에 `nameless: true`를 붙인다. 출처를 찾지 못해 빠진 범위는 보고서에 기록한다.
6-1. **다국어 기재** ([03](03-data-model.md) 2절)
   - 고유명사(`Name`): 원어 표기(`original`)와 로마자는 반드시 넣는다. 다른 언어 표기는 공식 표기를 확인했을 때만 `official`에 넣고, 확인에 쓴 출처를 `sources`에 포함한다. 비공식 통용 표기는 `aliases`에 넣는다.
   - 서술형(`Text`): 원문과, 원문 언어를 제외한 모든 표시 언어(ja/ko/en)의 번역을 채운다. 공식 번역이 없는 언어는 직접 번역하고 `translated`에 표시한다. 고유명사는 직접 번역하지 않는다.
   - 위키백과: 작품·시리즈·성우·캐릭터를 다루는 문서가 있으면 언어판별로 `wikipedia`에 넣는다.
   - 로마자 표기 기준: 일본어는 헵번식(장음 기호 생략, 예: `Yuusha`가 아니라 `Yusha`), 한국어는 본인·소속사가 쓰는 표기를 우선하고 없으면 국어의 로마자 표기법을 따른다. 인명은 "이름 성" 순서로 쓰고, 반대 순서는 `aliases.en`에 넣는다. 중국어는 병음(성조 기호 생략)을 쓴다.
6-1-1. **읽기·활동명**: 한자 이름의 후리가나는 `aliases.ja`(히라가나)에, 해외 활동명은 `official.<언어>`에, 옛 예명은 `aliases`에 넣는다([03](03-data-model.md) 2.1절). `scripts/cli/wiki-intro.ts`로 위키백과 도입부를 일괄 확인할 수 있다.
6-2. **이미지**
   - 성우: 위키미디어 커먼즈(자유 라이선스)나 소속사 공식 프로필 등 Tier 1~2 출처의 이미지만 쓴다. 없으면 생략한다.
   - 캐릭터: 공식 사이트의 캐릭터 소개 이미지(`official_promotional`)를 우선한다. 팬 위키나 나무위키 등 Tier 3 출처의 이미지는 쓰지 않는다.
   - 이미지 파일은 내려받지 않고 원본 URL과 게시 페이지, 저작자 표기만 기록한다.
7. **보고서** `research.json`: 생성·수정한 파일 목록, 불확실한 항목(필드 경로, 사유), 출처 간 충돌, 생략한 범위
8. `meta.researched_at`은 오늘 날짜, `meta.verification.status`는 `unverified`, `meta.skill_version`은 현재 스킬 버전으로 기록한다.

**fix 모드**(4단계)에서는 전달받은 이슈 목록에 해당하는 항목만 수정하고, 그 밖의 필드는 건드리지 않는다.

## 6. verifier 지침 요약 (`verify-work/SKILL.md`)

verifier는 **researcher와 다른 컨텍스트**에서 실행하고 `data/`에 쓰지 않는다. 결과는 보고서로만 낸다.

| 대상 | 검증 방법 |
|---|---|
| 작품 기본 정보 (기간, 화수, 제작사) | researcher가 인용한 출처 확인 + **독립 검색**으로 교차 확인 |
| 다국어 표기 | 원어가 아닌 언어의 `Name` 표기가 실제로 공식 표기인지, `Text` 번역이 원문과 같은 뜻인지 |
| 이미지 | URL이 열리는지, 출처 등급이 1~2인지, 라이선스와 저작자 표기가 맞는지 |
| 성우 프로필 (성별, 국적, 출생) | 인용 출처 확인 + 독립 검색 |
| 성우 동일인 판별 | 신규 Person이 기존 Person과 같은 사람은 아닌지, 다른 동명이인과 혼동하지 않았는지 |
| `main`/`supporting` Credit | 인용 출처가 실제로 그 내용을 뒷받침하는지 확인 + 독립 검색으로 교차 확인 |
| `minor` Credit | 인용 출처가 그 내용을 뒷받침하는지 확인 (전수) |
| 누락 | 주요 캐릭터나 알려진 더빙판이 빠지지 않았는지 |
| 교체 정보 | 하차·교체 시점과 회차가 출처와 일치하는지 |

이슈 보고 형식 (`verify-N.json`):
```jsonc
{
  "round": 1,
  "summary": { "checked": 142, "errors": 2, "warnings": 3 },
  "issues": [
    {
      "id": "i1",
      "severity": "error",            // error: 반영 전 반드시 해결 | warning: 기록만 함
      "kind": "wrong_value",          // wrong_value | missing | unsupported | weak_source | duplicate_person | identity_unclear | other
      "file": "data/works/frieren-s1.json",
      "pointer": "/versions/1/credits/7",   // JSON Pointer
      "current": { "person": "person-x" },
      "suggested": { "person": "person-y" },
      "evidence": [{ "url": "https://...", "quote": "…", "tier": 1 }],
      "reason": "공식 사이트 캐스트 목록에는 person-y로 표기"
    }
  ]
}
```

## 7. 중재와 사용자 결정

- 2차 검증 뒤에도 남은 `error`, 병렬 작업 간 충돌은 오케스트레이터가 **선별 없이** mediator(`resolve-conflict` 스킬)에 넘긴다.
- mediator는 사실 문제를 근거로 결정하고 `data/decisions/`에 기록한 뒤 데이터에 반영한다.
- mediator가 못 정한 것(`unresolved`)과 정책 문제(`escalate`)만 사용자에게 간다. 오케스트레이터는 mediator의 선택지·추천안·근거를 그대로 AskUserQuestion으로 보여준다(최대 4개씩).
- 사용자 답은 다시 mediator가 반영하고 `decided_by: "user"`로 기록한다. 결정된 배역은 `verification: "user_confirmed"`.
- 정책 문제의 답은 규칙이므로 스킬과 설계 문서에도 반영한다 (스키마 변경이면 CHANGELOG까지).
- 해결하지 못한 `warning`은 반영을 막지 않는다. 해당 Credit을 `unverified`로 두고 `meta.verification.notes`에 요약한다.

## 8. 검증 상태 기록 규칙

| 결과 | Credit `verification` | 파일 `meta.verification.status` |
|---|---|---|
| 이슈 없음 (Tier 1~2 근거) | 생략 (파일 상태를 따름) | `verified` |
| Tier 3 근거만 있음 | `unverified` | 나머지가 모두 검증되었다면 `verified` |
| 사용자 결정 | `user_confirmed` | 위 규칙을 따르되 notes에 기록 |
| 출처끼리 충돌하는데 사용자가 판단을 보류 | `disputed` | `disputed` |

## 9. 재조사 (`/refresh-work <work-id>` 또는 `/refresh-work --stale`)

- `stale-report`가 [04](04-data-build.md) 5절 기준으로 재조사가 필요한 작품을 나열한다. `--stale`을 주면 그중 사용자가 고른 작품을 차례로 처리한다.
- 흐름은 2절과 같다. researcher는 update 모드로 기존 데이터를 바탕으로 추가·변경분을 반영한다(예: 새 회차의 신규 캐릭터, 새 더빙판).
- 기존 Credit을 삭제하거나 값을 바꾸는 변경은 verifier가 반드시 근거를 확인한다.
- 완료되면 `meta.researched_at`을 갱신한다. 이 날짜가 마지막 공개일 이후가 되면 재조사 안내 배너가 사라진다.

## 10. PR 형식

- 제목: `data: add <작품 한국어명> (<work-id>)` / `data: update …` / `chore(skill): sync to schema x.y.z`
- 본문:
  - 추가/변경 요약: 작품, 버전, Credit 수, 신규 Person 수
  - 검증 결과: 1차와 2차 이슈 수, 해결 내역
  - 사용자 결정 내역
  - `unverified`/`disputed`로 남은 항목 목록

## 11. 병렬 실행 안전장치

| 위험 | 장치 |
|---|---|
| 같은 시리즈 파일을 두 작업이 동시에 수정 | 시리즈 단위 배정 + `lock.ts acquire franchise:<id>` (원자적 디렉토리 잠금) |
| 같은 성우를 작업마다 다른 ID로 생성 | 내부 ID를 원어 표기에서 기계적으로 생성(`docs/03` 4.1절) + `person-id.ts`가 data와 모든 스테이징을 모든 표기로 검색해 `reuse`/`create`/`conflict` 판정 |
| 그래도 생긴 중복 | 검증 스크립트의 "중복 의심 성우"가 **오류** → mediator. 동명이인 확정 쌍은 `different_person` 결정으로 예외 |
| 병합 끝난 스테이징이 남아 중복 후보로 잡힘 | `merge-staging.ts`가 data 병합 후 스테이징을 `.work/archive/`로 이동 |
| 임시 파일 충돌 | 작업마다 `<root>/tmp/`, `tmp-verify/`, mediator는 `.work/mediation/<id>/` |
| 같은 성우 파일의 필드 값 차이 | 병합 스크립트가 합치고(출처·별칭 합집합, 더 정밀한 날짜) 진짜 충돌만 목록화 → mediator |
| `data/` 동시 수정 | 에이전트는 스테이징에만 쓴다. `data/`는 병합 스크립트와 mediator(잠금 범위 안)만 쓴다 |

동시 실행은 최대 3개를 기본으로 한다 (웹 요청 부담·토큰 비용·충돌 빈도의 균형).

## 12. 요청 예절 (속도 제한·캐시)

- 에이전트의 개별 웹 조회는 도구 호출 사이 사고 시간 때문에 이미 느리다(실측 평균 14~22초 간격). 고정 대기를 넣지 않는다.
- 대량 요청은 스크립트로만 한다. 모든 스크립트 요청은 `scripts/lib/http.ts`의 `politeFetch`를 거친다.
  - 사이트별 **공용** 최소 간격: 위키백과·위키미디어·unicode.org 1초, 그 외 2초. `.work/ratelimit/`의 잠금 파일로 여러 프로세스가 공유하므로 병렬 에이전트 수와 관계없이 사이트별 총 속도가 유지된다 (로컬 서버로 3프로세스×3요청 → 간격 2.0초 유지 확인).
  - `Retry-After` 준수 + 지수 백오프.
  - 캐시 `.work/cache/` (기본 7일): 조사·검증·재조사가 같은 페이지를 다시 받지 않는다.
- 위키미디어 API 규칙은 연락처가 담긴 User-Agent를 권장한다. 현재는 일반 이름(`va-archive-data-tool/0.1`)이며, 레포 공개 후 레포 URL을 넣을지는 사용자가 정한다.
