# 03. 데이터 모델

> **정본은 `data/schema/*.schema.json`이다.** 이 문서는 스키마를 사람이 읽기 쉽게 풀어 쓴 것이다. 둘이 다르면 스키마를 따르고 이 문서를 고친다.

원본 데이터는 `data/` 아래 **엔티티별 JSON 파일**로 저장한다. 모든 파일은 `$schema`로 스키마를 가리키고, CI에서 Ajv로 엄격하게 검증한다. 모든 스키마는 `additionalProperties: false`이므로 정의되지 않은 필드는 거부된다.

엔티티별로 파일을 나눈 이유는 다음과 같다.
- git diff로 변경 내용을 사람과 검증 에이전트가 바로 읽을 수 있다.
- 작품 하나를 조사할 때 수정되는 파일이 work 1개, franchise 1개, 관련 person 파일로 한정되어 병합 충돌이 적다.

## 1. 엔티티 관계

```
Franchise 1 ──< Work 1 ──< Version 1 ──< Credit >── 1 Person
    │                                     │
    └──< Character 1 ─────────────────────┘
```

- **Franchise**: 작품 묶음(시리즈). 캐릭터를 정의하고, 즐겨찾기의 단위가 된다. 작품이 하나뿐이어도 반드시 둔다.
- **Work**: 개별 작품(TV 1기, 극장판, OVA, 게임 등).
- **Version**: 작품의 음성 버전. 원판 또는 특정 더빙판이며, 언어와 판(투니버스판 등)을 구분한다. 작품 파일 안에 포함된다.
- **Credit**: 배역 1건 = (캐릭터, 성우) 쌍과 부가정보. 버전 안에 포함된다.
  - 한 성우가 여러 캐릭터를 맡으면 Credit이 여러 건이 된다.
  - 한 캐릭터를 여러 성우가 맡으면 Credit이 여러 건이 되고, `part`/`episodes`로 구분한다.
- **Person**: 성우.

## 2. 다국어 규칙

### 2.0 언어의 세 가지 역할
언어 대응이 늘어나도 스키마 구조를 바꾸지 않도록, "언어"를 역할별로 분리하고 언어별 필드 대신 **언어 태그를 키로 쓰는 맵**을 사용한다.

| 역할 | 의미 | 허용 범위 | 바뀔 때 |
|---|---|---|---|
| **원어** (`original_lang`) | 이름·문장이 처음 쓰인 언어 | 모든 언어 태그 | 스키마 변경 없음 |
| **음성 언어** (`version.language`) | 원판·더빙판의 음성 언어 | 모든 언어 태그 | 스키마 변경 없음 |
| **표시 언어** (locale) | 사이트가 화면에 보여주는 언어. 현재 `ja`, `ko`, `en` | 고정 목록 | 아래 2.5절 절차 |

**언어 태그**: BCP 47의 부분집합인 `언어[-문자][-지역]` 형식을 쓴다. 예: `ja`, `ko`, `en`, `zh-Hans`(중국어 간체), `zh-Hant`(번체), `yue`(광둥어), `pt-BR`. 중국어는 문자 표기(Hans/Hant)를 반드시 붙인다(검증 스크립트가 확인).

### 2.1 고유명사: `Name`
대상: 성우 이름, 작품·시리즈 제목, 캐릭터 이름, 회사명(제작사·개발사·퍼블리셔·배급사·더빙 방송사·소속사)

| 필드 | 필수 | 설명 |
|---|---|---|
| `original_lang` | ✓ | 원어의 언어 태그 |
| `original` | ✓ | 원어 표기 |
| `latin` | ✓ | 로마자 표기. 한국인 이름도 필수(예: `Jung Mi-sook`). ID를 지을 때 기준이 된다 |
| `official` | | `{언어 태그: 표기}`. 원어가 아닌 언어의 **공식 표기만** 넣는다. 원어 키는 넣지 않는다 |
| `aliases` | | `{언어 태그: [별칭…]}`. 검색용 별칭(비공식 통용 표기, 구표기, 이체자, 어순 변형). **공식 표기가 없어도 넣을 수 있다** |

- 예: 일본 성우의 한국어 공식 표기가 없을 때는 `official.ko`를 비워 두고, 통용되는 표기 "하나자와 카나"는 `aliases.ko`에 넣는다. 한국어 검색은 이것으로 된다.
- **읽기(후리가나)**: 원어 표기에 한자가 들어 있으면 그 읽기를 **히라가나, 공백 없이** `aliases.ja`에 넣는다(예: `みやのまもる`). 출처의 후리가나를 쓰고 추측하지 않는다. 가나로 검색할 수 있게 하기 위해서다(검색은 가타카나를 히라가나로 통일해 비교한다). 원어 표기 안에 읽기를 괄호로 넣지 않는다(`梟（ふくろう）` → original `梟`, aliases.ja `ふくろう`).
- **다른 활동명**:
  - 다른 나라에서 쓰는 현재 활동명(예: 한국인 성우의 일본 활동명 한자 표기)은 그 언어의 공식 표기다 → `official.<언어>`. 읽기도 함께 `aliases.<언어>`에.
  - 옛 예명·다른 명의(같은 언어)는 `aliases.<언어>`에 넣는다(예: 古谷徹의 별명의 `蒼月昇`).
  - 활동에 쓰인 적 없는 본명·옛 성은 개인정보이므로 넣지 않는다.
  - 활동명이 달라도 같은 사람이면 성우 파일은 **하나**다. 특정 배역이 다른 명의로 크레딧되었으면 그 Credit에 `credited_as`를 남긴다.
- 무엇이 "공식 표기"인가: 정식 발매·방영물, 공식 사이트, 공식 SNS, 소속사 프로필에 실린 표기. 판단 근거는 수집 보고서에 남긴다.

```json
{ "original_lang": "ja", "original": "花澤香菜", "latin": "Kana Hanazawa",
  "official": { "en": "Kana Hanazawa" },
  "aliases": { "ja": ["花沢香菜"], "ko": ["하나자와 카나"], "en": ["Hanazawa Kana"] } }
```
```json
{ "original_lang": "zh-Hans", "original": "钟离", "latin": "Zhongli",
  "official": { "ja": "鍾離", "ko": "종려", "en": "Zhongli" } }
```

### 2.2 서술형 텍스트: `Text`
대상: 버전명, 캐릭터 설명, 배역 비고

| 필드 | 필수 | 설명 |
|---|---|---|
| `original_lang` | ✓ | 원문의 언어 태그 |
| `original` | ✓ | 원문 |
| `translations` | 조건부 | `{언어 태그: 문장}`. **원문 언어를 제외한 모든 표시 언어(현재 ja/ko/en)가 필수**다. 공식 번역이 있으면 그것을, 없으면 직접 번역해 넣는다. 원문 언어 키는 넣지 않는다. 원문이 한국어라면 ja·en만, 중국어라면 ja·ko·en 모두 필요하다 |
| `translated` | | 직접 번역한 언어 목록(`translations`의 키). 사이트는 이 언어로 표시할 때 "번역" 표시와 원문 보기를 제공한다 |

```json
{ "original_lang": "ja", "original": "体調不良により降板",
  "translations": { "ko": "건강 문제로 하차", "en": "Stepped down due to health reasons" },
  "translated": ["ko", "en"] }
```

### 2.3 번역하지 않는 필드
사이트에 그대로 보여주거나 내부에서만 쓰므로 원문 그대로 둔다.
- `Source.title`: 인용 정보
- `Image.credit`: 저작자·라이선스 표기
- `Credit.credited_as`: 크레딧 원문
- `meta.verification.notes`: 내부용

### 2.4 표시 규칙
locale `L`로 표시할 때 다음 순서로 고른다.
- `Name`: `original_lang == L`이면 `original` → `official[L]` → `aliases[L][0]` → `original`. 표시 언어와 다르면 원어 표기와 로마자를 보조로 함께 보여준다.
- `Text`: `original_lang == L`이면 `original` → `translations[L]`. `L`이 `translated`에 들어 있으면 "번역" 표시와 원문 토글을 붙인다.
- 같은 규칙을 `src/data/i18n-data.ts` 하나에 구현하고, 빌드할 때 locale별 표시명을 미리 계산해 둔다.

### 2.5 표시 언어를 추가하는 절차 (예: 중국어 UI)
1. `common.schema.json`의 `Text.allOf`에 해당 locale의 조건 블록을 추가한다(언어 하나에 블록 하나). 기존 데이터가 검증에 실패하게 되므로 **major** 변경으로 취급한다.
2. 번역 보충 작업을 실행한다. 에이전트가 모든 `Text`에 새 locale 번역을 채우고 `translated`에 표시한다. `Name`은 공식 표기를 찾은 것만 `official`에 추가한다.
3. `src/i18n/<locale>.ts`에 UI 문자열을 추가하고, 설정에 locale을 등록한다.

원어나 음성 언어가 새로 등장하는 경우(예: 중국어 원작 게임, 광둥어 더빙)는 위 절차 없이 바로 데이터를 넣을 수 있다.

## 3. 공통 타입 (`common.schema.json`)

### ID
- 형식: `^[a-z0-9]+(-[a-z0-9]+)*$` (소문자 kebab-case, 로마자 기반)
- 예: `kana-hanazawa`, `frieren`, `frieren-s1`, `genshin-impact`
- 성우는 내부 ID와 표시 ID를 따로 둔다 (4.1절). 아래 규칙은 작품·시리즈·캐릭터 ID에 적용한다.
- 충돌이 있으면 접미사 `-2`를 붙인다.
- 같은 엔티티 종류 안에서 유일해야 하고, 부여 후에는 바꾸지 않는다(바꿔야 하면 `data/redirects.json`에 매핑을 남긴다).
- 캐릭터 ID는 프랜차이즈 안에서만 유일하면 된다. 참조할 때는 `franchise_id` + `character_id` 조합을 쓴다.

### 날짜
- `PartialDate`: `YYYY`, `YYYY-MM`, `YYYY-MM-DD` 중 하나. 알려진 정밀도까지만 기록한다.
  - 비교할 때는 부족한 부분을 해당 기간의 마지막 날로 채운다. 예: `2024` → `2024-12-31`. 재조사 판단을 보수적으로 하기 위해서다.
- `FullDate`: `YYYY-MM-DD`. 조사일과 검증일에 쓴다.

### 출처 `Source`
| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✓ | 파일 안에서 유일 (`s1`, `s2`, …) |
| `url` | ✓ | |
| `title` | ✓ | 페이지 제목 원문 |
| `publisher` | ✓ | `official`, `broadcaster`, `agency`, `personal_sns`, `wikipedia`, `wikimedia_commons`, `ann`, `news`, `namuwiki`, `mal`, `anidb`, `fandom`, `other` |
| `tier` | ✓ | 1: 1차 출처, 2: 신뢰 2차, 3: 보조 (단독 근거 불가) ([06](06-data-collection.md) 4절) |
| `accessed_at` | ✓ | FullDate |

### 이미지 `Image`
레포에 이미지 파일을 저장하지 않고 원본 URL을 참조한다.

| 필드 | 필수 | 설명 |
|---|---|---|
| `url` | ✓ | 이미지 파일의 직접 URL (https) |
| `page_url` | ✓ | 이미지가 게시된 페이지 (커먼즈 파일 페이지, 공식 캐릭터 소개 페이지 등) |
| `source_ref` | ✓ | 출처 ID. **Tier 1~2 출처만 허용** (검증 스크립트가 확인) |
| `license` | ✓ | `cc0`, `public_domain`, `cc_by`, `cc_by_sa`, `official_promotional`(권리자의 공식 홍보 이미지), `other` |
| `credit` | ✓ | 이미지 옆에 표시할 저작자·라이선스 표기 원문 |

### 위키백과 `Wikipedia`
작품·시리즈·성우·캐릭터에 선택으로 단다. 그 대상을 다루는 위키백과 문서가 있을 때만 넣는다.
- 형식: `{위키백과 언어판 코드: 문서 URL}`. 예: `{ "ja": "https://ja.wikipedia.org/wiki/…", "ko": "https://ko.wikipedia.org/wiki/…" }`
- URL은 `https://<언어판>.wikipedia.org/wiki/…` 형식이어야 하고, 키와 서브도메인이 일치해야 한다(검증 스크립트가 확인).
- 시리즈 문서로 넘어가는 리다이렉트나 문서 속 한 절(섹션)로 가는 링크는 넣지 않는다. 그 대상 자체를 다루는 문서만 넣는다.

### 메타데이터 `RecordMeta`
모든 최상위 파일(person/franchise/work)에 포함한다.

| 필드 | 필수 | 설명 |
|---|---|---|
| `researched_at` | ✓ | 마지막 조사일 (재조사 안내 기준) |
| `verification.status` | ✓ | `unverified` / `verified` / `disputed` / `user_confirmed` |
| `verification.verified_at` | 상태가 verified·user_confirmed면 ✓ | |
| `verification.notes` | | 내부 메모 |
| `skill_version` | ✓ | 이 파일을 작성한 수집 스킬 버전 |

## 4. Person (`data/persons/<id>.json`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `$schema` | const | ✓ | `../schema/person.schema.json` |
| `id` | ID | ✓ | **내부 ID** (4.1절). 다른 파일은 이 값으로 참조 |
| `slug` | ID | ✓ | **표시 ID** (URL) (4.1절) |
| `name` | Name | ✓ | |
| `gender` | enum | | `female` / `male` / `other`. 본인이 공개한 정보가 있을 때만 |
| `nationality` | string[] | | ISO 3166-1 alpha-2 (`JP`, `KR`, …). 출처가 있을 때만 |
| `birth` | PartialDate | | Tier 1~2 출처가 있을 때만 |
| `death` | PartialDate | | |
| `agencies` | `{name: Name, from?, to?}[]` | | 소속사 이력 (오래된 순) |
| `debut_year` | integer | | |
| `image` | Image | | 공신력 있는 출처의 이미지만 (위키미디어 커먼즈, 소속사 공식 프로필 등) |
| `wikipedia` | Wikipedia | | 위키백과 문서 |
| `links` | `{kind, url}[]` | | `kind`: `official`, `agency`, `x`, `instagram`, `youtube`, `other` |
| `sources` | Source[] | ✓ | 최소 1개 |
| `meta` | RecordMeta | ✓ | |

출연작 목록은 Person 파일에 저장하지 않는다. 빌드할 때 Work의 Credit에서 역인덱스로 만든다. 데이터를 한 곳에만 두기 위해서다.

### 4.1 성우 ID: 내부 ID와 표시 ID

| | 내부 ID (`id`) | 표시 ID (`slug`) |
|---|---|---|
| 용도 | 파일 이름, 모든 참조(Credit, 결정 기록, 즐겨찾기 저장) | URL (`#/person/<slug>`) |
| 사용자에게 | 보이지 않음 | 보임 |
| 만드는 법 | **원어 표기만**을 입력으로 결정적 로마자 변환 (`scripts/lib/romanize.ts`) | `latin`(공식 로마자 표기)의 kebab-case |
| 동명이인 | 같은 기본형이면 `-2`, `-3` … (동명이인 판정용 번호) | `{이름}-{출생연도}`, 출생연도 미상은 `0000`, 같은 해면 `{이름}-{출생연도}-{번호}` |
| 바뀌는가 | **불변** (원어 표기가 나중에 바뀌어도 그대로) | 바뀔 수 있음. 이전 값은 `redirects.persons`에 (이전 slug → 내부 ID) |

**내부 ID 변환 규칙** (`ROMANIZER_VERSION` 1)
- 한글: 국어의 로마자 표기법, 음절 단위, 음운 변화 미적용 (정미숙 → `jeong-mi-suk`)
- 가나: 헵번식, 장음 유지 (チョー → `cho`, さとうあい → `satouai`)
- 라틴: 악센트 제거·소문자
- 한자: Unicode Unihan 16.0에서 만든 글자별 고정 읽기 표(`scripts/data/han-readings.json`). 일본어는 음독 우선, 중국어는 병음 (宮野真守 → `kyuu-ya-shin-shu`)
- 정확한 읽기가 아니어도 된다. 목표는 **누가 만들어도 같은 결과**(결정성)다. 그래서 출처마다 있을 수도 없을 수도 있는 후리가나·병음은 입력으로 쓰지 않는다.
- 변환 규칙이나 읽기 표를 바꾸면 `ROMANIZER_VERSION`을 올린다. 기존 ID는 다시 계산하지 않는다.

**표시 ID 규칙**
- 동명이인(같은 `latin` slug)이 없으면 접미사 없음: `mamoru-miyano`
- 동명이인이 생기면 모두 `-{출생연도|0000}`: `yu-hayashi-1985`, `yu-hayashi-0000`
- 같은 해 동명이인은 내부 ID의 동명이인 번호: `yu-hayashi-1985-1`, `yu-hayashi-1985-2`. 원어가 달라 번호가 겹치면(둘 다 1) 내부 ID 순서로 매긴다
- 동명이인이 추가되어 기존 사람의 slug가 바뀌면, 이전 slug는 **원래 그 slug를 쓰던 사람**에게 리다이렉트된다 (예전 링크가 가리키던 사람)
- 규칙은 검증 스크립트가 확인하고, `npx tsx scripts/cli/assign-slugs.ts`가 일괄 갱신·리다이렉트 기록을 한다

**새 성우 만들기**: 직접 ID를 짓지 않고 `npx tsx scripts/cli/person-id.ts "<원어>" <언어> [--birth YYYY]`로 발급받는다. data와 병렬 작업 중인 스테이징을 모든 표기로 검색해 `reuse`/`create`/`conflict`를 알려 준다 (`docs/06` 11절).

## 5. Franchise (`data/franchises/<id>.json`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | ID | ✓ | |
| `title` | Name | ✓ | |
| `original_media` | enum | | `manga`, `light_novel`, `novel`, `web_novel`, `game`, `anime_original`, `other` |
| `wikipedia` | Wikipedia | | 위키백과 문서 |
| `characters` | Character[] | ✓ | |
| `sources` | Source[] | ✓ | |
| `meta` | RecordMeta | ✓ | |

### 프랜차이즈를 나누는 기준
- 기본: 같은 세계관·같은 캐릭터를 공유하는 작품 묶음. 시즌·극장판·OVA·원작 애니의 게임판은 같은 프랜차이즈의 다른 작품이다.
- **파이널 판타지 시리즈**: 번호·수식어로 프랜차이즈를 나눈다. `파이널 판타지 14`와 `파이널 판타지 7`은 다른 프랜차이즈다. 확장팩은 같은 프랜차이즈의 다른 작품이다(예: `파이널 판타지 14 신생 에오르제아`와 `파이널 판타지 14 홍련의 해방자`는 같은 프랜차이즈 `final-fantasy-14`).
- 기준이 애매한 경우(스핀오프, 리메이크, 같은 이름의 다른 세계관 등)는 정책 문제이므로 조사 전에 사용자에게 묻는다.

### Character
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | ID | ✓ | 프랜차이즈 안에서 유일. 스포일러 캐릭터는 정체가 드러나지 않는 ID를 쓴다 |
| `name` | Name | ✓ | 이름 없는 배역은 크레딧 표기를 넣는다 (예: 村人A) |
| `description` | Text | | 한 줄 소개 |
| `first_appearance` | `{work, episode?}` | | 이 사이트에 등록된 작품 중 **첫 등장** 작품(목소리 유무와 무관)과 첫 등장 화. `work`는 같은 프랜차이즈의 작품 ID다. 첫 등장 작품이 아직 등록되지 않았다면 비워 두고, 그 작품이 등록될 때 채운다 |
| `nameless` | boolean | | 고유 이름이 없는 배역 (예: "마을 사람 A", "학생"). ID는 작품을 구분할 수 있게 짓는다 (예: `villager-a-s1`) |
| `spoiler` | boolean | | `true`면 이름·설명·이미지를 "스포일러"로 가린다. **성우는 그대로 표시**한다 |
| `image` | Image | | 캐릭터 이미지. 배역 목록(토글을 켰을 때)과 캐릭터 상세에서 보여준다 |
| `wikipedia` | Wikipedia | | 위키백과 문서 (캐릭터 단독 문서가 있을 때) |

## 6. Work (`data/works/<id>.json`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | ID | ✓ | |
| `franchise_id` | ID | ✓ | |
| `type` | enum | ✓ | `anime_tv`, `anime_movie`, `anime_ova`, `anime_ona`, `anime_special`, `game` |
| `title` | Name | ✓ | |
| `order` | number | | 프랜차이즈 안에서 정렬할 순서 |
| `status` | enum | ✓ | 애니: `announced` / `airing` / `finished`. 게임: `announced` / `released` / `live_service` / `ended_service` |
| `start_date` | PartialDate | | 첫 방영일, 개봉일, 출시일 |
| `end_date` | PartialDate | | 마지막 방영일 (재조사 안내 기준) |
| `episodes` | integer | | 애니 전용 (극장판 제외) |
| `runtime_min` | integer | | 애니 전용 (상영시간) |
| `studios` | Name[] | | 애니 전용 (제작사) |
| `developers` | Name[] | | 게임 전용 (개발사) |
| `platforms` | enum[] | | 게임 전용: `pc`, `ps4`, `ps5`, `switch`, `switch2`, `xbox_one`, `xbox_series`, `ios`, `android`, `web`, `other` |
| `publishers` | Name[] | | 게임 퍼블리셔 / 애니 배급사 |
| `wikipedia` | Wikipedia | | 위키백과 문서 |
| `versions` | Version[] | ✓ | 원판(`kind: original`)이 최소 1개 있어야 한다. 원어 음성이 여럿인 게임을 위해 2개 이상도 허용 |
| `sources` | Source[] | ✓ | |
| `meta` | RecordMeta | ✓ | |

유형별 전용 필드를 다른 유형에 넣으면 스키마가 거부한다.

### Version
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | ID | ✓ | 작품 안에서 유일. 예: `ja`, `ko-tooniverse`, `ko-netflix`, `en` |
| `language` | 언어 태그 | ✓ | 음성 언어 (예: `ja`, `ko`, `zh-Hans`, `yue`) |
| `kind` | enum | ✓ | `original` / `dub` |
| `label` | Text | ✓ | 버전명. 예: "한국어 더빙 (애니플러스)" |
| `distributor` | Name | | 더빙 방송사, 플랫폼, 배급사 |
| `release_date` | PartialDate | | 이 버전이 처음 공개된 날 |
| `last_release_date` | PartialDate | | 이 버전의 마지막 공개일 (재조사 안내 기준) |
| `credits` | Credit[] | ✓ | |
| `source_refs` | string[] | | 버전 전체에 적용되는 출처 |

### Credit
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `character` | ID | ✓ | `franchise.characters[].id` 참조 |
| `person` | ID | ✓ | `persons/<id>` 참조 |
| `role` | enum | ✓ | `main`(주연), `supporting`(조연), `minor`(단역. 게스트 포함) |
| `part` | enum | | 한 캐릭터에 성우가 여럿일 때 구분: `regular`(기본), `replaced`(교체 전), `replacement`(교체 후), `young`(아역/어린 시절), `substitute`(일시 대역), `other` |
| `episodes` | `{from?, to?}` 또는 string | | 담당 회차. 범위로 표현할 수 없으면 `"1-12, 15"` 형식 문자열 |
| `note` | Text | | 보충 설명 (예: 하차 사유) |
| `credited_as` | string | | 크레딧 표기가 본명과 다를 때. 원문 그대로 |
| `spoiler` | boolean | | 이 배역의 **성우 정보 자체**가 스포일러일 때 (시크릿 캐스트 등). 성우를 가린다 |
| `source_refs` | string[] | ✓ | 근거가 되는 출처 ID (최소 1개) |
| `verification` | enum | | Credit별 검증 상태. 생략하면 파일의 `meta.verification.status`를 따른다 |

예시 (교체와 겸역이 함께 있는 경우):
```jsonc
"credits": [
  { "character": "hero", "person": "person-a", "role": "main", "part": "replaced", "episodes": { "to": 24 },
    "note": { "original_lang": "ja", "ja": "体調不良により降板", "ko": "건강 문제로 하차", "en": "Stepped down due to health reasons", "translated": ["ko", "en"] },
    "source_refs": ["s1"] },
  { "character": "hero", "person": "person-b", "role": "main", "part": "replacement", "episodes": { "from": 25 }, "source_refs": ["s1", "s3"] },
  { "character": "narrator", "person": "person-b", "role": "minor", "source_refs": ["s1"] }
]
```

### 첫 등장과 첫 음성 출연
| 항목 | 저장 방식 | 이유 |
|---|---|---|
| 첫 등장 작품 | `Character.first_appearance`에 저장 | 목소리 없이 등장한 경우는 Credit이 없어 계산할 수 없다 |
| 첫 음성 출연 작품 | 저장하지 않음. 빌드할 때 계산 | 그 캐릭터의 Credit이 있는 작품 중 시작일이 가장 이른 것(같으면 `order` 순). 회차 정보가 있으면 그 작품의 가장 이른 회차까지. **언어별로** 따로 구한다 |

두 값이 다르면 캐릭터 상세에 "첫 등장: ○○ 3화 (대사 없음) / 첫 음성: ○○ 7화"처럼 함께 보여준다.

### 스포일러의 두 가지 수준
| 지정 위치 | 가리는 것 | 그대로 보이는 것 |
|---|---|---|
| `Character.spoiler` | 캐릭터 이름, 설명, 이미지 ("스포일러"로 표시) | 성우 |
| `Credit.spoiler` | 해당 배역의 성우 | 캐릭터 (캐릭터도 스포일러가 아니라면) |

## 7. 참조 무결성 규칙 (`validate-data.ts`)

JSON Schema만으로는 잡을 수 없어 스크립트로 검사하는 규칙들이다.

1. 파일명과 `id`가 같다.
2. `work.franchise_id`가 실제로 존재한다.
3. `credit.character`가 해당 프랜차이즈의 캐릭터에 존재한다.
4. `credit.person`이 실제로 존재한다.
5. 모든 `source_refs`와 `image.source_ref`가 같은 파일의 `sources[].id`에 존재한다.
6. `image.source_ref`가 가리키는 출처의 `tier`가 1 또는 2다.
6-1. 다국어 규칙: `Name.official`과 `Text.translations`에 원어 키가 없다. `Text.translated`의 각 언어가 `translations`의 키다. 중국어 태그에 문자 표기(Hans/Hant)가 붙어 있다.
6-2. `wikipedia`의 키와 URL 서브도메인이 일치한다.
6-3. `character.first_appearance.work`가 존재하고, 같은 프랜차이즈 소속이다. 그 작품의 `episodes`가 있으면 `episode`가 그 범위 안이다.
6-4. 캐릭터의 배역이 있는 작품 중 `first_appearance` 작품보다 시작일이 이른 작품이 있으면 **경고**로 처리한다(첫 등장 정보가 틀렸을 가능성).
7. 한 버전 안에서 (character, person, part, episodes) 조합이 중복되지 않는다.
8. `start_date <= end_date`이고, `version.release_date <= version.last_release_date`이다.
9. 어떤 Credit에서도 참조하지 않는 Person, 어떤 작품에서도 쓰이지 않는 Character는 **경고**로 처리한다(에러 아님).
10. **중복 의심 성우 (오류)**: 한쪽의 원어 표기가 다른 쪽의 원어·공식·별칭 표기와 같고 출생연도가 모순되지 않으면 오류. 같은 사람이면 병합, 다른 사람이면 `data/decisions/`에 `different_person` 결정을 기록해 예외 처리한다(`resolve-conflict` 스킬).
10-1. **성우 ID**: 내부 ID가 변환 규칙(기본형 또는 기본형-N)과 맞는지, slug가 표시 ID 규칙과 맞고 유일한지. `redirects.persons`의 키가 현재 쓰는 slug·id가 아니고 값이 존재하는 내부 ID인지.
10-2. 결정 기록(`data/decisions/`)의 대상이 존재하는지 (경고).
11. 이름이 있는 캐릭터(`nameless`가 아님) 중 `role`이 `main`/`supporting`인데 `image`가 없으면 **경고**로 처리한다.

## 8. 스키마 버전 관리

- `data/schema/VERSION`은 semver로 관리한다.
  - **major**: 필드 삭제·이름 변경·의미 변경. 기존 데이터를 마이그레이션해야 한다.
  - **minor**: 선택 필드나 enum 값 추가.
  - **patch**: 설명이나 문서 수정.
- 변경할 때마다 `data/schema/CHANGELOG.md`에 기록한다.
- 스키마를 바꾸는 PR은 수집 스킬도 같이 고쳐야 한다. 스킬의 `schema_version`과 예시 데이터를 CI가 검사한다 ([06](06-data-collection.md) 3절).
- major 변경에는 `scripts/migrations/<version>.ts`를 함께 제공한다.
- 1.0.0 이전(현재 0.x)에는 데이터가 아직 없으므로 마이그레이션 없이 자유롭게 바꾼다.
