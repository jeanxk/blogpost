import test from 'node:test'
import assert from 'node:assert/strict'

import { attachAffiliateLink } from '../src/monetization.js'

const disclosure = '이 포스팅은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다.'

test('attaches a valid affiliate link and disclosure to the draft body', () => {
  const result = attachAffiliateLink('상품을 직접 비교해 본 내용입니다.', 'https://example.com/product', '쿠팡 파트너스', disclosure)

  assert.equal(result.ok, true)
  assert.match(result.body, /상품을 직접 비교해 본 내용입니다\./)
  assert.match(result.body, /쿠팡 파트너스/)
  assert.match(result.body, /https:\/\/example\.com\/product/)
  assert.match(result.body, /제휴 링크를 포함/)
})

test('rejects non-http affiliate URLs before changing the draft', () => {
  const result = attachAffiliateLink('본문', 'javascript:alert(1)', '직접 협찬', disclosure)

  assert.equal(result.ok, false)
  assert.equal(result.code, 'invalid_url')
  assert.equal(result.body, '본문')
})

test('does not insert the same affiliate URL twice', () => {
  const first = attachAffiliateLink('본문', 'https://example.com/product', '네이버 쇼핑 커넥트', disclosure)
  const second = attachAffiliateLink(first.body, 'https://example.com/product', '네이버 쇼핑 커넥트', disclosure)

  assert.equal(second.ok, false)
  assert.equal(second.code, 'duplicate_url')
  assert.equal(second.body, first.body)
})

test('keeps one disclosure when adding more than one affiliate link', () => {
  const first = attachAffiliateLink('본문', 'https://example.com/one', '네이버 쇼핑 커넥트', disclosure)
  const second = attachAffiliateLink(first.body, 'https://example.com/two', '쿠팡 파트너스', disclosure)

  assert.equal(second.ok, true)
  assert.equal(second.body.split(disclosure).length - 1, 1)
})
