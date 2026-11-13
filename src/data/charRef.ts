/**
 * 캐릭터 참조 해석 (schema CharacterRef).
 * - "character-id"            → 그 작품 프랜차이즈의 캐릭터
 * - "franchise-id/character-id" → 다른 프랜차이즈(원작)에 정의된 캐릭터 (크로스오버·스핀오프)
 */
export interface CharKey {
  franchise: string;
  character: string;
}

export function resolveCharRef(ref: string, workFranchise: string): CharKey {
  const i = ref.indexOf('/');
  return i < 0
    ? { franchise: workFranchise, character: ref }
    : { franchise: ref.slice(0, i), character: ref.slice(i + 1) };
}

export const charKey = (k: CharKey) => `${k.franchise}/${k.character}`;
