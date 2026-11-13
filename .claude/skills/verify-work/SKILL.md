---
name: verify-work
description: va-archive 데이터 검증 지침. researcher가 작성한 스테이징 데이터를 독립적으로 웹에서 교차 확인하고 이슈 보고서를 작성한다. 데이터 파일은 수정하지 않는다. verifier 에이전트가 사용.
schema_version: 0.4.0
skill_version: 0.6.0
---

# verify-work

researcher가 스테이징 디렉토리에 작성한 데이터를 **독립적으로** 검증한다.
**데이터 파일(`data/`, `<root>/data/`)은 절대 수정하지 않는다.** 결과는 보고서로만 낸다.
사실 충돌의 최종 판단은 mediator(`resolve-conflict`)가 한다. verifier는 근거와 함께 이슈로 올리기만 한다.
참고: `docs/03-data-model.md`(데이터 모델), `.claude/skills/research-work/SKILL.md`(작성 규칙), `docs/06-data-collection.md` 6절.

## 입력
- 스테이징 루트 `<root>` (`<root>/data/…`, `<root>/research.json`)
- 라운드 번호 N (1 또는 2). 2라운드에서는 직전 `verify-1.json`과 researcher의 `fix_responses`도 주어진다.

## 1. 기계 검증
`npx tsx scripts/validate-data.ts --root data --root <root>/data` — error가 있으면 그대로 `error` 이슈로 보고.

## 2. 내용 검증 범위
| 대상 | 방법 |
|---|---|
| 작품 기본 정보 (방영 기간, 화수, 제작사, 상영시간) | 인용 출처 확인 + researcher가 쓰지 않은 출처로 **독립 검색** 교차 확인 |
| 버전 | 해당 언어의 더빙판이 빠지지 않았는지, 방송사·공개일이 맞는지 |
| 성우 프로필 (성별, 국적, 출생) | 인용 출처 확인 + 독립 검색 |
| 성우 동일인 판별 | 다른 동명이인과 혼동하지 않았는지. 새로 만든 성우마다 `npx tsx scripts/cli/person-id.ts`를 다시 돌려 `conflict`인 것이 보고서 `person_conflicts`에 빠짐없이 올라 있는지 (내부 ID·slug 형식은 검증 스크립트가 확인) |
| 이름 없는 배역 표기 | 일본어 원문이 있는데 영어 표기(`original_lang: "en"`)로 남겨 두지 않았는지, 역번역한 일본어를 쓰지 않았는지. 성우 개인 ja.wikipedia 문서의 출연작 목록으로 확인 |
| main / supporting Credit | 인용 출처가 실제로 뒷받침하는지 + 독립 검색 교차 확인 (전수) |
| minor Credit | 인용 출처가 뒷받침하는지 (가능한 한 전수, 불가능하면 검사 범위를 summary에 명시) |
| 누락 | 주요 캐릭터·알려진 배역 교체·더빙판이 빠지지 않았는지 |
| 교체 정보 | 하차·교체 사실과 `part`. 회차는 확인하지 않는다(스키마에 없음). `note`의 교체 시점은 출처 표현과 같은지만 |
| 추정 배역 | `assumption`이 붙은 배역: 성우가 바뀌었다는 출처가 있는데 `continued_cast`로 넣지 않았는지, 더빙 방영 사실 자체의 근거가 있는지. 추정이 반대 출처와 충돌하면 `error` |
| 캐릭터 ID | 형식은 검증 스크립트가 확인한다. 같은 캐릭터를 표기만 다르게 두 번 만들지 않았는지 |
| 로마자 표기 | `latin`이 있으면 공식 표기·출처의 읽기와 맞는지. 근거 없이 추측한 값이면 `error`(비워야 함) |
| 다국어 | `official` 표기가 실제 공식 표기인지, `Text` 번역이 원문과 같은 뜻인지 |
| 읽기·활동명 | 한자 이름에 후리가나(`aliases.ja`, 히라가나)가 있고 출처와 일치하는지. 해외 활동명·옛 예명이 빠지지 않았는지, 같은 사람을 활동명별로 따로 만들지 않았는지, 활동에 쓰지 않은 본명이 들어가지 않았는지 |
| 첫 등장 | `first_appearance` 작품이 맞는지 (회차는 기록하지 않음) |
| 프랜차이즈 간 캐릭터 | 크로스오버·스핀오프 작품에서 원작 캐릭터를 새로 정의하지 않고 `원작/캐릭터`로 참조했는지, 참조한 캐릭터가 맞는지 |
| 스포일러 | 스포일러 지정이 과하거나 빠지지 않았는지 |
| 이미지 | URL이 열리는지(가능하면), 출처 등급 1~2인지, 라이선스·저작자 표기 |
| 출처 등급 | tier 표기가 정책과 맞는지, Tier 3만으로 verified 처리한 곳이 없는지 |

임시 파일은 `<root>/tmp-verify/`에 둔다.

## 3. 보고서 `<root>/verify-N.json`
```jsonc
{
  "round": 1,
  "summary": { "checked": 0, "errors": 0, "warnings": 0, "coverage": "minor credit 검사 범위 등" },
  "issues": [
    {
      "id": "i1",
      "severity": "error",          // error: 반영 전 반드시 해결 | warning: 기록만
      "kind": "wrong_value",        // wrong_value | missing | unsupported | weak_source | duplicate_person | identity_unclear | translation | other
      "file": "works/x.json",       // <root>/data 기준 상대 경로
      "pointer": "/versions/0/credits/7",
      "current": {},
      "suggested": {},
      "evidence": [{ "url": "https://...", "quote": "…", "tier": 1 }],
      "reason": "…"
    }
  ],
  "verified_ok": ["확인 완료된 주요 항목 요약"]
}
```
- severity 기준: 사실과 다른 값, 근거 없는 배역, 동일인 오판, 누락된 주요 캐릭터/배역/더빙판 = `error`. 표기 취향, 사소한 번역 뉘앙스, 근거 보강 권장 = `warning`.
- 2라운드: 1라운드 이슈 각각의 해결 여부를 확인하고(`resolved_issues: ["i1", ...]`), researcher 수정으로 **새로 생긴 문제**와 변경분만 추가 검토한다.
