# 02. 아키텍처

## 1. 전체 흐름

```
[Claude Code 로컬]                      [GitHub]                          [브라우저]
 수집/검증 에이전트                      
   │ data/*.json 작성                    
   ▼                                     
 branch → PR ──────────────────▶  validate.yml (PR 검증)
                                    │ 머지
                                    ▼
                                  deploy.yml
                                    1. 스키마·참조 무결성 검증
                                    2. build-data → db.<hash>.json
                                    3. vite build
                                    4. GitHub Pages 배포 ───────▶  index.html + JS 번들
                                                                     │ 최초 1회 db.<hash>.json 다운로드
                                                                     ▼
                                                                   메모리 내 인덱스로 조회/비교
                                                                   localStorage: 즐겨찾기
```

## 2. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| UI | **React 18 + TypeScript** | 사용자가 익숙함. 에이전트가 생성하는 코드의 품질도 React가 가장 안정적. 다른 프레임워크로 바꿀 이점이 없음 |
| 번들러 | Vite | 정적 산출물, 빠른 개발 서버, GitHub Pages `base` 설정이 간단함 |
| 라우팅 | React Router (`createHashRouter`) | GitHub Pages는 SPA 경로 폴백이 없음. 해시 라우팅이면 새로고침이나 딥링크에서 404가 나지 않음 |
| 스타일 | CSS Modules + CSS 변수(라이트/다크 테마) | 의존성이 적고 에이전트가 수정하기 쉬움 |
| 데이터 검증 | JSON Schema (draft 2020-12) + Ajv | 엄격한 필드 정의. 에디터 자동완성(`$schema`)과 CI 검증에 같은 스키마 사용 |
| 타입 | `src/types/data.ts`에 직접 작성 | 자동 생성기(json-schema-to-typescript)는 `Name1`·`Text1` 같은 중복 타입과 내장 `Map`을 가리는 선언을 만들어 가독성이 나빠 채택하지 않음. 스키마와의 일치는 fixture 검증 테스트로 확인 |
| 테스트 | Vitest (조회·비교 로직, 빌드 스크립트), Playwright (주요 화면 스모크) | |
| 스크립트 실행 | `tsx` | 빌드·검증 스크립트를 TS로 작성 |
| 패키지 매니저 | npm | |

> 에이전트 친화성 관점: React+TS는 학습 데이터가 가장 많고, 데이터 타입이 명시되어 있어 에이전트가 필드명을 틀리면 바로 컴파일 에러가 납니다. Svelte·Solid 등을 쓸 이유는 없다고 판단했습니다.
>
> 배포 경로: `vite.config.ts`의 `base: './'`와 해시 라우팅 덕분에 레포 이름(GitHub Pages 하위 경로)과 무관하게 동작한다.

## 3. 레포 구성

```
va-archive/
├─ data/                        # 원본 데이터 (진실의 원천, 사람/에이전트가 편집)
│  ├─ schema/
│  │  ├─ VERSION                # 스키마 버전 (semver)
│  │  ├─ CHANGELOG.md           # 스키마 변경 이력 (스킬 업데이트 근거)
│  │  ├─ common.schema.json
│  │  ├─ person.schema.json
│  │  ├─ franchise.schema.json
│  │  └─ work.schema.json
│  ├─ persons/<내부 id>.json
│  ├─ decisions/<날짜-요약>.json  # 중재·사용자 결정 기록
│  ├─ franchises/<franchise-id>.json
│  └─ works/<work-id>.json
├─ scripts/
│  ├─ validate-data.ts          # 스키마 + 참조 무결성 검증
│  ├─ build-data.ts             # db.<hash>.json 생성
│  ├─ lib/                      # 데이터 로더, 무결성 검사
│  ├─ gen-han-readings.ts       # Unihan → scripts/data/han-readings.json (내부 ID용 한자 읽기 표)
│  ├─ data/han-readings.json    # 커밋함 (결정성 보장)
│  └─ cli/                      # person-id, lock, merge-staging, assign-slugs, migrate-person-ids, wiki-intro, skill-hash
├─ src/
│  ├─ main.tsx, App.tsx, routes.tsx
│  ├─ data/                     # DB 로더, 쿼리 함수(순수 함수, 단위 테스트 대상)
│  ├─ favorites/                # localStorage 저장소, 내보내기/가져오기
│  ├─ pages/                    # Home, Search, Person, Work, CompareWorks, ComparePersons, Favorites, About
│  ├─ components/
│  ├─ i18n/ko.ts                # UI 문자열
│  ├─ state/                    # 즐겨찾기·설정 (localStorage)
│  └─ types/data.ts             # 데이터 타입 (스키마와 함께 수정)
├─ public/
├─ .claude/
│  ├─ skills/                   # 수집·검증 스킬 (06 문서 참고)
│  └─ agents/                   # researcher / verifier 서브에이전트 정의
├─ .github/workflows/
│  ├─ validate.yml              # PR: validate + typecheck + test
│  └─ deploy.yml                # main push: build + Pages 배포
├─ docs/
└─ CLAUDE.md                    # 에이전트용 레포 규칙 요약
```

## 4. 원칙

1. **원본과 산출물 분리**: `data/`만 편집 대상이다. `db.*.json`은 빌드 산출물이라 커밋하지 않는다.
2. **조회 로직은 순수 함수**: `src/data/queries.ts`의 함수는 `(db, args) => result` 형태로 작성한다. UI와 분리해 테스트할 수 있게 하고, 나중에 저장 방식을 바꿔도 이 계층만 교체하면 된다.
3. **ID 불변**: 한 번 부여한 ID는 바꾸지 않는다. 즐겨찾기와 URL이 ID를 참조하기 때문이다. 부득이하게 바꿔야 하면 `data/redirects.json`에 이전 ID → 새 ID 매핑을 남긴다.
