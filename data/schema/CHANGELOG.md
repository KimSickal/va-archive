# 스키마 변경 이력

스키마를 바꾸는 PR은 이 파일과 `VERSION`, 그리고 `.claude/skills/*`의 `schema_version`·지침·예시를 함께 갱신해야 한다 (CI 강제).

- major: 필드 삭제/이름 변경/의미 변경 → `scripts/migrations/<version>.ts` 동반
- minor: 선택 필드·enum 값 추가
- patch: 설명·문서 수정

## 0.1.0 — 2026-11-12
- 초안: common / person / franchise / work / redirects
- Credit.role 필수화 (main/supporting/minor, 게스트는 minor에 포함), Character.nameless 추가
- 표시용 데이터 3개 언어(ja/ko/en)화: 고유명사는 `Name`(원어·로마자 필수, 타 언어는 공식 표기만), 서술형은 `Text`(3개 언어 필수, 직접 번역 시 `translated` 표기)
- 회사명(제작사·개발사·퍼블리셔·배급사·소속사)도 `Name`
- Person: gender 선택화, languages 제거, image 추가
- Character: image 추가, spoiler_label 제거 (스포일러 캐릭터는 '스포일러'로만 표시, 성우는 표시)
- 다국어 확장 구조: 언어별 고정 필드(ja/ko/en, *_aliases) → 언어 태그(BCP 47 부분집합) 키 맵
  - Name: original_lang + original + latin + official{} + aliases{}
  - Text: original_lang + original + translations{} (원문 언어 제외 표시 언어 ja/ko/en 필수) + translated[]
  - Version.language: LangTag (zh-Hans, yue 등 허용)
- wikipedia 필드 추가: Person, Franchise, Character, Work. Person.links에서 wikipedia_* 제거
- Character.first_appearance {work, episode?} 추가 (첫 음성 출연은 빌드 시 계산)
