const HTTP_URL = /^https?:\/\/[^\s]+$/i

export function attachAffiliateLink(body, url, channelLabel, disclosure) {
  const currentBody = String(body || '')
  const normalizedUrl = String(url || '').trim()
  const label = String(channelLabel || '제휴 링크').trim() || '제휴 링크'
  const notice = String(disclosure || '').trim()

  if (!HTTP_URL.test(normalizedUrl)) {
    return { ok: false, code: 'invalid_url', body: currentBody }
  }

  if (currentBody.includes(normalizedUrl)) {
    return { ok: false, code: 'duplicate_url', body: currentBody }
  }

  const blockParts = [
    `[${label}]`,
    `확인하기: ${normalizedUrl}`,
  ]
  if (notice && !currentBody.includes(notice)) blockParts.push(notice)
  const block = blockParts.join('\n')

  return {
    ok: true,
    code: 'attached',
    body: `${currentBody.trimEnd()}${currentBody.trim() ? '\n\n' : ''}${block}`,
  }
}
