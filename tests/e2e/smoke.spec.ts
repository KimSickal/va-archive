import { expect, test, type Page } from '@playwright/test';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()),
  );
});
test.afterEach(() => expect(errors).toEqual([]));

const go = (page: Page, hash: string) => page.goto(`./#${hash}`);

test('search → person page with multiple roles in one work', async ({ page }) => {
  await go(page, '/');
  await page.getByRole('searchbox').first().fill('쿠로사와');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/#\/person\/ren-kurosawa/);
  const group = page.locator('.credit-groups > li', { hasText: '별의 기사단' }).first();
  await expect(group.locator('ul > li')).toHaveCount(2);
});

test('work page: replacement, minor toggle, spoiler mask', async ({ page }) => {
  await go(page, '/work/star-knights-s1');
  const kaiRow = page.locator('tr', { hasText: '카이' });
  await expect(kaiRow.locator('td').first()).toContainText('교체 전');
  await expect(kaiRow.locator('td').first()).toContainText('교체 후');
  // 단역은 기본 숨김
  await expect(page.locator('tr', { hasText: '마을 사람 A' })).toHaveCount(0);
  await page.getByRole('button', { name: /단역 1명 더 보기/ }).click();
  await expect(page.locator('tr', { hasText: '마을 사람 A' })).toHaveCount(1);
  // 스포일러 캐릭터: 이름은 가리고 성우는 표시
  const spoilerRow = page.locator('tr', { has: page.locator('th button.spoiler') });
  await expect(spoilerRow).toContainText('쿠로사와 렌'); // 성우는 그대로 표시
  await expect(page.getByText('ゼノ')).toHaveCount(0);
  await spoilerRow.locator('th button.spoiler').click();
  await expect(page.getByText('ゼノ').first()).toBeVisible();
});

test('staleness banner on work researched before airing', async ({ page }) => {
  await go(page, '/work/moon-cafe');
  await expect(page.locator('.banner-warn')).toContainText('재조사가 필요합니다');
});

test('favorite series → highlighted on person page → compare with favorites per language', async ({ page }) => {
  await go(page, '/work/star-knights-s1');
  await page.getByRole('button', { name: /별의 기사단.*즐겨찾기/ }).click();
  await go(page, '/person/aoi-hoshino');
  await expect(page.locator('.fav-summary')).toContainText('1개');
  await expect(page.locator('.credit-groups > li.fav-row')).toHaveCount(2);
  await go(page, '/work/moon-cafe/vs-favorites');
  const sections = page.locator('.lang-section h2');
  await expect(sections.nth(0)).toHaveText('일본어');
  await expect(sections.nth(1)).toHaveText('한국어');
  await expect(page.locator('.lang-section').nth(0)).toContainText('겹치는 성우 2명');
  await expect(page.locator('.lang-section').nth(1)).toContainText('겹치는 성우 1명');
});

test('compare works & persons', async ({ page }) => {
  await go(page, '/compare/works?a=star-knights-s1&b=moon-cafe');
  await expect(page.locator('.lang-section').first()).toContainText('2명');
  await go(page, '/compare/persons?a=aoi-hoshino&b=ren-kurosawa');
  await expect(page.getByRole('heading', { name: /공동 출연 작품 \(2\)/ })).toBeVisible();
  await go(page, '/compare/persons?a=aoi-hoshino&b=ji-woo-han');
  await expect(page.getByRole('heading', { name: /공동 출연 작품 \(0\)/ })).toBeVisible();
  await page.getByLabel('다른 버전(언어) 출연도 포함').check();
  await expect(page.getByRole('heading', { name: /공동 출연 작품 \(2\)/ })).toBeVisible();
});

test('character page shows first appearance and first voice per language', async ({ page }) => {
  await go(page, '/franchise/star-knights/character/rin');
  await expect(page.locator('.facts')).toContainText('첫 등장');
  await expect(page.locator('.facts')).toContainText('첫 음성 (한국어)');
});

test('favorites import (merge)', async ({ page }) => {
  await go(page, '/favorites');
  await page.locator('input[type=file]').setInputFiles({
    name: 'fav.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ version: 1, franchises: [{ id: 'moon-cafe' }], persons: [{ id: 'aoi-hoshino' }] }),
    ),
  });
  await page.getByRole('button', { name: '병합' }).click();
  await expect(page.getByRole('heading', { name: '시리즈 (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '성우 (1)' })).toBeVisible();
});
