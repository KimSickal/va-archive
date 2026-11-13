---
name: research-work
description: va-archive 데이터 수집 지침. 지정된 작품의 기본 정보·캐릭터·버전별 배역·성우를 신뢰할 수 있는 출처에서 조사해 스키마에 맞는 JSON으로 스테이징 디렉토리에 작성한다. researcher 에이전트가 사용.
schema_version: 0.2.0
skill_version: 0.4.1
---

# research-work

작품 하나(또는 한 프랜차이즈의 여러 작품)를 조사해 `data/` 형식의 JSON을 **스테이징 디렉토리**에 작성한다.
데이터 모델은 `docs/03-data-model.md`, 정본 스키마는 `data/schema/*.schema.json`이다. 작업 전에 둘 다 읽는다.
예시 데이터: `tests/fixtures/data/` (가상의 데이터. 형식 참고용)

## 입력 (오케스트레이터가 지정)
- 대상 작품과 범위, 조사할 음성 언어
- 스테이징 루트: `.work/research/<key>/` → 데이터는 `<root>/data/{persons,franchises,works}/<id>.json`, 보고서는 `<root>/research.json`
- 모드: `new`(신규) 또는 `fix`(검증 이슈 수정 — 이슈 파일 경로가 함께 주어짐)

## 1. ID 규칙 (여러 에이전트가 병렬로 작업해도 같은 대상에 같은 ID가 나오도록 결정적으로 짓는다)
- 소문자 로마자 kebab-case. 장음 기호·악센트 제거(ō→o, ū→u), 공백·중점·아포스트로피 → `-`.
- **성우는 직접 ID를 짓지 않는다.** 성우를 배역에 넣기 전에 반드시 실행한다:
  `npx tsx scripts/cli/person-id.ts "<원어 표기>" <원어 언어> [--birth YYYY] [--alias "<다른 표기>"]...`
  - `reuse` → 그 내부 ID를 참조하고 **새 파일을 만들지 않는다** (기존 파일에 정보를 보탤 필요가 있으면 스테이징에 복사해서 수정)
  - `create` → 그 ID로 `persons/<id>.json` 작성. `slug`는 `latin`의 kebab-case (동명이인 접미사는 병합 때 `assign-slugs`가 붙인다)
  - `conflict` → 파일을 만들지 말고 보고서 `person_conflicts`에 후보와 함께 기록. 배역은 임시로 후보 중 가장 유력한 ID를 쓰고 `uncertain`에도 남긴다 (mediator가 결정)
  - 내부 ID는 원어 표기에서 기계적으로 만들어진다(宮野真守 → `kyuu-ya-shin-shu`). 읽기와 달라 보여도 고치지 않는다.
- **캐릭터**: 원어 이름의 로마자 kebab-case (예: ゴン=フリークス → `gon-freecss`, 공식 영문 표기가 있으면 그것 기준). 스포일러 캐릭터는 정체가 드러나지 않는 ID.
- **이름 없는 배역**: `<표기>-<작품 약어>` 예: `villager-a-s1`, `hrl-soldier-s2`, `receptionist-2011`.
- `person-id.ts`는 `data/`와 다른 에이전트의 스테이징(`.work/research/*/data/`)을 모든 표기(별칭·옛 예명 포함)로 함께 검색한다.
- **버전**: 원판 `ja`, 한국어 더빙 `ko-<방송사·플랫폼 약어>` (예: `ko-tooniverse`, `ko-aniplus`). 방송사를 모르면 `ko`.

## 2. 출처 정책 (`docs/06-data-collection.md` 4절)
| tier | 예 | 규칙 |
|---|---|---|
| 1 | 작품 공식 사이트·공식 SNS, 방송사·배급사 공지, 소속사 프로필, 성우 본인 공식 SNS | 단독 근거 가능 |
| 2 | Wikipedia(ja/ko/en), Anime News Network Encyclopedia, 주요 매체 기사 | 단독 근거 가능 |
| 3 | 나무위키, MyAnimeList, AniDB, Fandom, 블로그 | 단독 근거 불가 |

- 모든 Credit에 `source_refs`. Tier 3 근거만 있는 Credit은 `"verification": "unverified"`.
- 출생일·국적은 Tier 1~2 출처가 있을 때만.
- 사실(이름·날짜·배역)만 기록. 소개문을 베끼지 않는다. `description`은 직접 쓴 한 줄 요약.
- `Source.title`은 페이지 제목 원문, `accessed_at`은 오늘 날짜.

## 3. 다국어 기재 (`docs/03-data-model.md` 2절)
- `Name`: `original`(원어)·`latin` 필수. `official`에는 **원어가 아닌 언어의 공식 표기만** (한국어 정식 방영·발매물, 공식 사이트 표기 등). 원어 키는 넣지 않는다.
  - 한국어 더빙판이 있으면 그 더빙판에서 쓰인 캐릭터 이름이 한국어 공식 표기다.
  - 비공식 통용 표기(일본 성우의 한국어 음차 등)는 `aliases.ko`에. 영어 어순 변형은 `aliases.en`에.
- `Text`(버전명·설명·비고): `original` + 원문 언어를 뺀 ja/ko/en 번역 전부. 공식 번역이 없으면 직접 번역하고 `translated`에 표시.
- 로마자: 일본어는 헵번식·장음 생략(Yūsha→Yusha), 인명 "이름 성". 한국어는 본인·소속사 표기 우선, 없으면 국어의 로마자 표기법.
- 회사명(제작사·방송사·소속사)도 `Name`.
- **읽기(후리가나)**: 원어 표기에 한자가 있으면 출처(위키백과 도입부 괄호, 공식 프로필의 ふりがな)의 읽기를 히라가나·공백 없이 `aliases.ja`에 넣는다. 성우·캐릭터 모두 해당(이름 없는 배역은 생략 가능). 원어 표기 안에 괄호로 읽기를 넣지 않는다. 추측 금지.
- **다른 활동명**: 해외 활동명 → `official.<언어>` (+ 읽기는 aliases), 옛 예명·별명의 → `aliases.<언어>`, 다른 명의로 크레딧된 배역 → Credit `credited_as`. 같은 사람이면 성우 파일은 하나. 활동에 쓰지 않은 본명·옛 성은 기록하지 않는다.
- 도구: `npx tsx scripts/cli/wiki-intro.ts <위키백과 URL>...` 로 여러 문서의 도입부와 후리가나를 한 번에 확인할 수 있다.

## 3-1. 요청 예절 (속도 제한)
- 같은 사이트의 여러 문서(예: 성우 수십 명의 위키백과)는 하나씩 열지 말고 스크립트로 일괄 처리한다 (`wiki-intro.ts`: API 한 번에 20건). 스크립트 요청은 `scripts/lib/http.ts`를 거쳐 사이트별 공용 속도 제한(위키백과 1초당 1회, 그 외 2초당 1회)과 캐시(`.work/cache/`, 7일)가 적용된다.
- 새 일괄 수집 스크립트를 만들면 반드시 `politeFetch`를 쓴다.
- 429(요청 과다)를 받으면 같은 사이트를 잠시 쉬고 다른 출처를 먼저 조사한다.

## 4. 작성 절차
0. 프랜차이즈 구분은 `docs/03-data-model.md` 5절 "프랜차이즈를 나누는 기준"을 따른다 (파이널 판타지: 번호·수식어별 프랜차이즈, 확장팩은 같은 프랜차이즈의 작품). 애매하면 만들지 말고 보고한다.
1. 범위 확인: 작품 목록과 각 작품의 ID를 정한다. 프랜차이즈 파일이 `data/franchises/`에 이미 있으면 복사해 와서 캐릭터를 **추가**한다(기존 캐릭터 ID 유지).
2. 작품 기본 정보: type, status, 방영/개봉일, 화수/상영시간, 제작사, 위키백과 링크(ja/ko/en 중 존재하는 것).
3. 버전: 지정된 음성 언어의 원판·더빙판을 모두 찾는다. 같은 언어에 더빙판이 여럿이면 각각 버전.
4. 캐릭터: 프랜차이즈 파일에 정의. `first_appearance`(이 사이트에 등록된 작품 중 첫 등장 작품·화), 스포일러 여부(정체·존재 자체가 후반에 밝혀지는 경우만 `spoiler: true`), 이름 없는 배역은 `nameless: true`.
   - 이미지: 공식 사이트 캐릭터 소개 이미지(`official_promotional`)를 우선. URL이 실제로 열리는지 확인된 것만. Tier 3 이미지 금지. 찾지 못하면 생략.
5. Credit: 크레딧에 오른 **모든 배역**(주연·조연·단역·이름 없는 배역). `role`: main(주연) / supporting(조연) / minor(단역·게스트).
   - **이름 없는 배역의 원어 표기**: 일본어 크레딧 원문(ja.wikipedia 성우 문서의 출연작 목록이 가장 좋은 출처, 공식 사이트 회차별 캐스트)을 그대로 쓴다. **영어 자료(ANN 등)를 일본어로 역번역하지 않는다.**
     일본어 출처를 찾지 못하면 실제 출처의 표기(예: ANN 영어 "Soldier A")를 `original_lang: "en"`으로 넣고 Credit을 `"verification": "unverified"`로 둔다. 단, 작품 고유 용어의 명백한 오역(예: 人革連 → "Human Leather")은 성우 개인 문서 등에서 일본어 표기를 다시 찾아본다.
   - 한 캐릭터에 성우가 여럿이면 `part`(replaced/replacement/young/substitute)와 `episodes`, 사유는 `note`.
   - 시크릿 캐스트(성우 공개 자체가 스포일러)는 Credit에 `spoiler: true`.
6. 성우: 새 성우는 `persons/<id>.json` 작성. 성별은 공개 정보가 있을 때만, 이미지는 위키미디어 커먼즈 등 Tier 1~2 자유 라이선스만(없으면 생략), 위키백과 링크.
7. `meta`: `researched_at` 오늘, `verification.status` `"unverified"`, `skill_version` 이 파일의 skill_version.
8. 검증 통과까지 수정: `npx tsx scripts/validate-data.ts --root data --root <root>/data --quiet-warnings`
   - **error 0**이어야 한다. warning은 보고서에 요약.

- 임시 파일은 반드시 `<root>/tmp/`에 둔다. 공용 스크래치 폴더는 다른 에이전트와 충돌한다.

## 5. 보고서 `<root>/research.json`
```json
{
  "mode": "new",
  "works": ["<work-id>", "..."],
  "files": ["data/works/x.json", "..."],
  "counts": { "characters": 0, "credits": 0, "new_persons": 0 },
  "uncertain": [{ "file": "...", "pointer": "/versions/1/credits/3", "reason": "..." }],
  "conflicts": [{ "topic": "...", "sources": ["s1", "s4"], "decision": "..." }],
  "omitted": ["어떤 범위를 왜 생략했는지"],
  "official_name_basis": [{ "name": "곤", "basis": "투니버스 방영판 크레딧 (s7)" }],
  "person_conflicts": [{ "original": "蒼月昇", "lang": "ja", "candidates": ["…person-id 출력…"], "used": "<임시로 쓴 id>" }]
}
```

## 6. fix 모드
- 주어진 `verify-N.json`의 이슈만 처리한다. 각 이슈를 재조사해 수정하거나, 수정하지 않는다면 근거와 함께 보고서 `fix_responses`에 남긴다:
  `{ "issue": "i3", "action": "fixed" | "rejected" | "partially_fixed", "detail": "..." }`
- 이슈와 무관한 필드는 건드리지 않는다. 끝나면 다시 검증 명령으로 error 0 확인.
