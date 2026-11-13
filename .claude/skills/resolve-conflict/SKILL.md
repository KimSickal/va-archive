---
name: resolve-conflict
description: va-archive 충돌 중재 지침. 병렬 수집 중 생긴 사실 충돌(같은 사람 여부, 동명이인, 출처 간 값 충돌, ID·표기 충돌)을 데이터를 작성하지 않은 제3자로서 근거를 조사해 결정하고, 결정 기록을 남긴 뒤 데이터에 반영한다. 정책 문제는 결정하지 않고 사용자에게 올린다. mediator 에이전트가 사용.
schema_version: 0.4.0
skill_version: 0.1.0
---

# resolve-conflict

오케스트레이터가 기계적으로 탐지한 충돌을 **판단**하는 역할이다. 오케스트레이터는 판단하지 않는다(`add-work` 스킬).
참고: `docs/03-data-model.md`(데이터 모델·성우 ID), `docs/06-data-collection.md`(파이프라인), `data/schema/decision.schema.json`.

## 0. 원칙
- 당신은 충돌한 데이터를 **작성하지 않은** 제3자다. 양쪽 근거를 똑같이 다루고, 직접 추가 조사한다.
- 결정할 수 있는 것은 **사실 문제**뿐이다. 규칙이 없거나 규칙 해석이 갈리는 **정책 문제**는 결정하지 않고 `escalate`로 돌려준다.
  - 사실 문제 예: 두 레코드가 같은 사람인가 / 출생일은 어느 쪽이 맞나 / 이 배역의 성우는 누구인가 / 이 표기가 공식인가
  - 정책 문제 예: 일본어 크레딧이 없는 단역을 어떻게 표기할까 / 어떤 출처를 몇 등급으로 볼까 / 새 필드가 필요한가 / **프랜차이즈를 나눌지·무엇을 별개 작품으로 볼지**
- 근거가 부족해 결론이 안 나면 억지로 고르지 않는다 → `unresolved`로 돌려준다 (사용자 확인 대상).
- 같은 대상에 대한 기존 결정(`data/decisions/`)이 있으면 먼저 읽는다. 새 근거 없이 뒤집지 않는다. 뒤집으면 `supersedes`를 쓴다.

## 1. 입력 (오케스트레이터가 전달)
- 충돌 목록: 검증 스크립트 오류(`중복 의심 성우`, `id 중복`, `slug 중복` 등), `person-id.ts`의 `conflict`, `merge-staging.ts`의 충돌, 2차 검증 뒤 남은 사실 이슈
- 관련 파일 경로(스테이징 또는 data), 각 쪽의 출처
- 잠금: 오케스트레이터가 관련 시리즈/성우 파일에 잠금을 걸어 둔 상태다. 지정된 파일 외에는 수정하지 않는다.

## 2. 충돌 종류별 처리

| 종류 | 조사 | 반영 |
|---|---|---|
| **같은 사람인가** (중복 의심, person-id conflict) | 소속사·위키백과·본인 SNS로 동일인 여부 확인. 활동명 변경·별명의 가능성 확인 | 같은 사람: 남길 ID는 **내부 ID 규칙(원어 → 결정적 변환)에 맞는 쪽**, 둘 다 맞으면 사전순 앞. 다른 쪽 레코드의 출처·별칭을 합치고 배역의 `person`을 바꾸고 파일 삭제, `redirects.persons`에 (지운 ID → 남긴 ID). `kind: same_person` |
| | | 다른 사람(동명이인): 나중에 생긴 쪽 내부 ID에 동명이인 번호(`-2`…)를 붙이고 참조 갱신, `npx tsx scripts/cli/assign-slugs.ts` 실행. `kind: different_person` (이후 중복 검사에서 제외됨) |
| **값 충돌** (출생일, 배역의 성우 등) | 등급 높은 출처 우선, 1차 출처 탐색 | 결론이 나면 그 값으로 고치고 출처 추가. 안 나면 값을 비우거나(프로필 필드) Credit을 `"verification": "disputed"`로 두고 `unresolved`. `kind: field_value` |
| **ID·표기 충돌** (같은 사람이 다른 ID, 로마자 표기 차이 등) | 공식 표기 확인 | ID는 규칙대로, 로마자 표기는 공식 표기로 통일(근거가 없으면 비움). `kind: naming` |

## 3. 결정 기록 `data/decisions/<YYYY-MM-DD>-<요약 slug>.json`
```json
{
  "$schema": "../schema/decision.schema.json",
  "id": "2026-11-13-shinichiro-miki-same-person",
  "date": "2026-11-13",
  "kind": "same_person",
  "subjects": [{ "kind": "person", "id": "san-boku-shin-ichi-rou" }, { "kind": "person", "id": "shin-ichiro-miki" }],
  "decision": "같은 사람. san-boku-shin-ichi-rou 로 병합, shin-ichiro-miki → redirects",
  "rationale": "두 레코드 모두 81프로듀스 소속, 원어 표기 동일",
  "evidence": [{ "url": "https://ja.wikipedia.org/wiki/…", "tier": 2 }],
  "decided_by": "mediator"
}
```
- 사용자 결정을 반영할 때는 `decided_by: "user"`.
- 결정 기록은 내부용이며 사이트에 표시하지 않는다.

## 4. 끝내기
1. `npx tsx scripts/validate-data.ts --root <해당 루트들> --quiet-warnings` → 이번 충돌 관련 오류가 사라졌는지 확인
2. 보고 (JSON, 오케스트레이터에 그대로 전달됨):
```json
{
  "resolved": [{ "conflict": "…", "decision": "data/decisions/….json" }],
  "unresolved": [{ "conflict": "…", "why": "…", "options": ["A …", "B …"], "recommendation": "A", "evidence": ["url"] }],
  "escalate": [{ "question": "정책 질문 (사용자용, 한 문장)", "context": "…", "options": ["…"] }]
}
```
- `unresolved`와 `escalate`에는 사용자가 바로 고를 수 있게 선택지와 근거를 붙인다.
- 임시 파일은 `.work/mediation/<작업 id>/`에 둔다.
