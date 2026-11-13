---
name: add-work
description: va-archive 작품 추가·갱신 오케스트레이터. 사용자가 "/add-work <작품명>..."으로 실행한다. 작업 배정·잠금·스크립트 실행·서브에이전트 호출·결과의 기계적 반영만 하고, 데이터 내용은 판단하지 않는다(판단은 researcher/verifier/mediator 에이전트와 사용자). 여러 작품을 병렬로 처리할 수 있다.
schema_version: 0.3.0
skill_version: 0.2.0
---

# add-work (오케스트레이터)

전체 흐름과 근거는 `docs/06-data-collection.md`. 이 스킬은 실행 순서와 **오케스트레이터가 해도 되는 일의 경계**를 정한다.

## 0. 오케스트레이터 중립 규칙 (가장 중요)
오케스트레이터는 **데이터 내용에 대한 판단을 하지 않는다.** 할 수 있는 일은 아래뿐이다.
- 작업 배정, 잠금 획득·해제, 서브에이전트 호출 (아래 템플릿 그대로 + 사실 정보만 추가)
- 스크립트 실행과 그 결과의 **기계적** 반영: `validate-data`, `merge-staging`, `assign-slugs`, `build`, 테스트, git
- 에이전트 보고서의 전달 (요약은 하되 평가·선별하지 않는다)
- 사용자에게 질문 (mediator의 `unresolved`/`escalate`를 선택지·추천안 그대로)

하지 않는 일 (해야 할 것 같으면 해당 역할에 넘긴다):
- 데이터 값을 고치거나 고를지 결정 → researcher(fix 모드) 또는 mediator
- "이 경고는 무시해도 된다" 같은 판정 → verifier/mediator, 최종은 사용자
- 규칙이 없는 상황의 처리 방식 결정 → 사용자 (mediator의 `escalate`)

## 1. Preflight (main 브랜치에서)
1. `npx tsx scripts/cli/skill-hash.ts check add-work` — `stale`이면 `git pull --ff-only` 후 이 스킬을 다시 호출해 처음부터 재실행 (재실행 후에도 stale이면 중단·보고)
2. 작업 트리 깨끗한지, `git pull --ff-only`
3. `npm run validate -- --quiet-warnings` 통과 확인

## 2. 작업 배정 (작품 여러 개면 병렬)
1. 작품마다 시리즈(franchise) ID를 정하고, 같은 시리즈의 작품은 **한 작업으로 묶는다** (시리즈 파일 충돌 방지).
   모호하면(동명 작품, 시즌 범위) 사용자에게 묻는다.
2. 작업마다 `npx tsx scripts/cli/lock.ts acquire franchise:<id> <작업명>` — 실패하면 그 작업은 대기.
   - 크로스오버·스핀오프·다른 애니화는 **원작 프랜차이즈가 data/ 에 있을 때만** 배정한다 (없으면 큐에서 보류, 사유: 의존).
   - researcher 보고서의 `home_character_requests`(원작 프랜차이즈에 없는 캐릭터)는 원작 프랜차이즈 잠금을 얻은 뒤 researcher(fix 모드)에게 원작 프랜차이즈 파일에 추가하도록 넘긴다.
3. 동시 실행은 **최대 3개**. 브랜치: `data/<작업명>`.
4. 스테이징 루트: `.work/research/<작업명>/` (작업마다 따로, 임시 파일도 그 아래).

## 3. 조사 → 검증 → 재조사 → 재검증 (작업마다)
- researcher: `research-work` 스킬, mode new → `<root>/research.json`
- verifier: `verify-work` 스킬, round 1 → `<root>/verify-1.json`
- `error`가 있으면 researcher fix 모드 → verifier round 2 → `<root>/verify-2.json`
- 프롬프트 템플릿: 스킬 경로, 대상 범위, 스테이징 루트, 음성 언어, 오늘 날짜, 이전 보고서 경로만 넣는다. 판단을 유도하는 문장(“이건 무시해도 됨” 등)을 넣지 않는다.

## 4. 충돌 탐지 (기계적) → 중재 (mediator)
병렬 작업이 끝나면(또는 작업 하나가 끝날 때마다):
1. 미리보기 병합 (현재 data 위에 모든 스테이징을 합친 결과):
   `rm -rf .work/preview && mkdir -p .work/preview && cp -r data .work/preview/ && npx tsx scripts/cli/merge-staging.ts --keep --out .work/preview/data <스테이징 data 루트들>`
   - 결정적 내부 ID 덕분에 같은 성우는 같은 ID로 합쳐진다. 값이 다른 필드는 merge 충돌 목록에 나온다.
2. `npx tsx scripts/validate-data.ts --root .work/preview/data` 의 오류, merge 충돌 목록, 각 researcher 보고서의 `person-id` conflict, 2차 검증 뒤 남은 `error` 를 모은다.
3. 모은 목록을 **그대로** mediator 에이전트(`resolve-conflict` 스킬)에 넘긴다. 관련 시리즈 잠금은 유지.
4. mediator의 `unresolved`·`escalate` → 사용자에게 질문 (AskUserQuestion, 최대 4개씩, mediator의 선택지·추천·근거 그대로). 사용자 답은 mediator에게 다시 넘겨 반영 + `decided_by: "user"` 결정 기록.

## 5. 반영
1. 상태 기록: 검증 2바퀴를 마친 파일의 `meta.verification` 갱신 (규칙: `docs/06` 8절, 스크립트로 일괄)
2. `npx tsx scripts/cli/merge-staging.ts <roots>` (data 로 병합, 스테이징은 .work/archive 로 이동)
3. `npx tsx scripts/cli/assign-slugs.ts` → `npm run validate` → `npm test` → `npm run build`
4. 작품별 커밋 → push → PR → `gh pr checks --watch` → `gh pr merge --squash --delete-branch` (원격이 없으면 로컬 커밋까지)
5. `npx tsx scripts/cli/lock.ts release franchise:<id> <작업명>`
6. PR 본문 / 최종 보고: 작품별 배역 수, 검증 결과, mediator 결정 목록(`data/decisions/`), 사용자 결정, 남은 unverified/disputed
