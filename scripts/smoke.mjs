import { chromium } from 'playwright'
import fs from 'node:fs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 1080 }, deviceScaleFactor: 1 })
const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:8000/'
const apiBase = process.env.SMOKE_API_URL || (new URL(baseUrl).port === '5173' ? 'http://127.0.0.1:8000' : new URL(baseUrl).origin)
const screenshotDir = process.env.SMOKE_ARTIFACT_DIR || '/tmp/blogpost-smoke'
fs.mkdirSync(screenshotDir, { recursive: true })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${screenshotDir}/blogpost-dashboard.png`, fullPage: true })
const required = ['블로그포스트', '초안 만들기', '생성된 초안', '수익화 채널 선택', '규정 점검 결과']
for (const label of required) {
  if (!(await page.getByText(label, { exact: false }).count())) throw new Error(`missing text: ${label}`)
}
await page.getByRole('button', { name: '수익화', exact: true }).click()
if (!(await page.getByText('수익화 채널 선택', { exact: false }).count())) throw new Error('monetization view did not open')
await page.getByRole('button', { name: '초안에 선택', exact: true }).first().click()
if (!(await page.getByRole('button', { name: '초안에 선택됨', exact: true }).count())) throw new Error('channel selection did not update')
await page.getByRole('textbox', { name: '상품 또는 캠페인 링크' }).fill('https://example.com/product')
await page.getByRole('button', { name: '본문에 삽입', exact: true }).click()
await page.getByRole('button', { name: '오늘의 작업', exact: true }).click()
if (!(await page.getByRole('textbox', { name: '초안 본문' }).inputValue()).includes('https://example.com/product')) throw new Error('affiliate link was not inserted')
await page.getByRole('button', { name: '규정 점검', exact: true }).click()
if (!(await page.getByText('안전 원칙', { exact: false }).count())) throw new Error('policy view did not open')
await page.getByRole('button', { name: '오늘의 작업', exact: true }).click()
await page.getByRole('button', { name: '초안 생성하기' }).click()
if (!(await page.getByText('확인 필요', { exact: false }).count())) throw new Error('draft action did not run')
await page.screenshot({ path: `${screenshotDir}/blogpost-dashboard-final.png`, fullPage: true })
const savedPosts = await fetch(`${apiBase}/api/posts?limit=200`).then((response) => response.json())
for (const post of savedPosts.posts || []) {
  if (post.title.includes('강릉 주문진 여행 코스 추천')) {
    await fetch(`${apiBase}/api/posts/${post.id}`, { method: 'DELETE' })
  }
}
await browser.close()
console.log(JSON.stringify({ ok: true, errors, screenshots: [`${screenshotDir}/blogpost-dashboard.png`, `${screenshotDir}/blogpost-dashboard-final.png`] }))
