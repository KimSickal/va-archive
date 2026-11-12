# va-archive 설계 문서

성우·작품·배역 정보를 조회하는 정적 웹사이트(GitHub Pages 호스팅)의 설계 문서 모음.

| 문서 | 내용 |
|---|---|
| [01-requirements.md](01-requirements.md) | 요구사항과 확정된 결정사항 |
| [02-architecture.md](02-architecture.md) | 전체 구조, 기술 스택, 레포 구성 |
| [03-data-model.md](03-data-model.md) | 원본 데이터 스키마(엔티티·필드 정의) |
| [04-data-build.md](04-data-build.md) | 원본 → 브라우저용 DB 빌드, 인덱스, 검색 |
| [05-frontend.md](05-frontend.md) | 화면·라우팅·기능 명세, 즐겨찾기 |
| [06-data-collection.md](06-data-collection.md) | 수집·검증 에이전트 파이프라인과 스킬 관리 |
| [07-roadmap.md](07-roadmap.md) | 구현 순서와 향후 확장 |

## 한 줄 요약

- **원본 데이터**: `data/` 아래 엔티티별 JSON 파일. JSON Schema로 엄격 검증.
- **빌드**: GitHub Actions가 검증 → 정규화 테이블 + 사전 계산 인덱스를 담은 `db.<hash>.json` 생성 → Pages 배포.
- **런타임**: React + Vite + TypeScript SPA. 서버 연산 없이 브라우저 메모리에서 모든 조회/비교 수행.
- **개인 데이터**: 즐겨찾기(프랜차이즈·성우)는 `localStorage`에 저장, JSON 내보내기/가져오기 지원.
- **데이터 수집**: 레포에 포함된 Claude Code 스킬/에이전트가 조사 → 검증 → 재조사 → 재검증 → (필요 시 사용자 중재) → PR 생성 및 머지.
