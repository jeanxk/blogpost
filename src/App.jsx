import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { attachAffiliateLink } from './monetization.js'

const API_BASE = typeof window !== 'undefined' && window.location.port === '5173' ? 'http://127.0.0.1:8000' : ''

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || payload.error || '요청을 처리하지 못했습니다.')
  return payload
}

const sampleImages = [
  {
    id: 'sea',
    src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=85',
    alt: '맑은 바다와 하늘',
  },
  {
    id: 'table',
    src: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
    alt: '여행지의 음식 테이블',
  },
  {
    id: 'cafe',
    src: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=85',
    alt: '창가가 있는 카페',
  },
]

const initialIntegrations = {
  brand: false,
  shopping: false,
  coupang: false,
  adsense: false,
  toss: false,
}

const navigation = [
  { id: 'today', label: '오늘의 작업', icon: 'home' },
  { id: 'new', label: '새 포스트', icon: 'plus' },
  { id: 'library', label: '포스트 라이브러리', icon: 'file' },
  { id: 'monetization', label: '수익화', icon: 'chart' },
  { id: 'policy', label: '규정 점검', icon: 'shield' },
]

const integrations = [
  { id: 'brand', label: '네이버 브랜드커넥트', short: 'N', color: 'naver', detail: '캠페인·브랜드 제안' },
  { id: 'shopping', label: '네이버 쇼핑 커넥트', short: '▣', color: 'shopping', detail: '상품 링크·판매 수익' },
  { id: 'coupang', label: '쿠팡 파트너스', short: 'c', color: 'coupang', detail: '추천 링크·커미션' },
  { id: 'adsense', label: 'Google AdSense', short: '◆', color: 'adsense', detail: '소유 사이트 광고' },
  { id: 'toss', label: 'Toss 파트너십', short: '↗', color: 'toss', detail: '결제·미니앱 확장' },
]

const affiliateChannels = [
  { value: 'shopping', label: '네이버 쇼핑 커넥트', integrationId: 'shopping' },
  { value: 'coupang', label: '쿠팡 파트너스', integrationId: 'coupang' },
  { value: 'brand', label: '네이버 브랜드커넥트', integrationId: 'brand' },
  { value: 'direct', label: '직접 협찬', integrationId: null },
]

const policyChecks = [
  { label: '네이버 블로그 정책', state: '양호', note: '대량 자동 발행 없이 검토 단계로 유지' },
  { label: '저작권 및 이미지', state: '양호', note: '업로드 이미지와 출처를 확인할 수 있음' },
  { label: '광고·협찬 표기', state: '확인 필요', note: '제휴 링크 사용 시 문구를 본문 상단에 표시' },
  { label: '개인정보 보호', state: '양호', note: '연락처·주소·얼굴 정보 자동 탐지 대기' },
]

function Icon({ name, size = 18, stroke = 'currentColor' }) {
  const shapes = {
    home: <><path d="m3 10 6-5 6 5" /><path d="M5 9v6h8V9" /><path d="M8 15v-3h2v3" /></>,
    plus: <><path d="M9 3v12" /><path d="M3 9h12" /></>,
    file: <><path d="M5 2.8h6l3 3V15H5z" /><path d="M11 2.8v3h3" /><path d="M7 9h5M7 12h5" /></>,
    chart: <><path d="M3 14V8M8 14V4M13 14v-7" /><path d="M2 14h12" /></>,
    shield: <><path d="M9 2.5 14 4v4.2c0 3.2-2.1 5.8-5 6.8-2.9-1-5-3.6-5-6.8V4z" /><path d="m6.5 8.5 1.6 1.6 3.2-3.3" /></>,
    spark: <><path d="m9 2 1.1 4.1L14 7.2l-3.9 1.1L9 12.5 7.9 8.3 4 7.2l3.9-1.1z" /><path d="m14 11 .5 1.8 1.7.5-1.7.5L14 15.5l-.5-1.7-1.7-.5 1.7-.5z" /></>,
    upload: <><path d="M9 11V3" /><path d="m6 6 3-3 3 3" /><path d="M4 10.5v3h10v-3" /></>,
    arrow: <><path d="M3 9h11" /><path d="m10 4 5 5-5 5" /></>,
    chevron: <path d="m6 7 3 3 3-3" />,
    settings: <><circle cx="9" cy="9" r="2.2" /><path d="M9 2.5v1.4M9 14.1v1.4M2.5 9h1.4M14.1 9h1.4M4.4 4.4l1 1M12.6 12.6l1 1M13.6 4.4l-1 1M5.4 12.6l-1 1" /></>,
    dots: <><circle cx="4" cy="9" r=".8" fill="currentColor" stroke="none" /><circle cx="9" cy="9" r=".8" fill="currentColor" stroke="none" /><circle cx="14" cy="9" r=".8" fill="currentColor" stroke="none" /></>,
    edit: <><path d="m4 12.8-.6 2.8 2.8-.6L14 7.2 11.8 5z" /><path d="m10.9 5.9 2.2 2.2" /></>,
    image: <><rect x="2.5" y="3" width="13" height="12" rx="1.5" /><circle cx="6.2" cy="6.6" r="1" /><path d="m4 13 3.2-3 2.1 2 1.5-1.5 2.7 2.5" /></>,
    list: <><path d="M6 4h9M6 9h9M6 14h9" /><path d="M3.5 4h.1M3.5 9h.1M3.5 14h.1" /></>,
    search: <><circle cx="7.6" cy="7.6" r="4.3" /><path d="m11 11 3.5 3.5" /></>,
    link: <><path d="M7.2 10.8 5.7 12.3a2.3 2.3 0 0 1-3.3-3.3l2.3-2.3A2.3 2.3 0 0 1 8 6.5" /><path d="m10.8 7.2 1.5-1.5a2.3 2.3 0 1 1 3.3 3.3l-2.3 2.3A2.3 2.3 0 0 1 10 11.5" /><path d="m6.5 9.5 5-1" /></>,
    check: <path d="m4 9 3.2 3.2L14 5.5" />,
    copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1" /><path d="M10.5 5.5V4.2a1.2 1.2 0 0 0-1.2-1.2H4.2A1.2 1.2 0 0 0 3 4.2v5.1a1.2 1.2 0 0 0 1.2 1.2h1.3" /></>,
    external: <><path d="M10 3h4v4" /><path d="m14 3-6 6" /><path d="M13 9v4.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-7A1.5 1.5 0 0 1 4.5 5H9" /></>,
    calendar: <><rect x="3" y="4" width="12" height="11" rx="1.4" /><path d="M6 2.5v3M12 2.5v3M3 7h12" /></>,
    help: <><circle cx="9" cy="9" r="6.2" /><path d="M7.2 7.1a1.9 1.9 0 1 1 3.3 1.3c-.7.7-1.5 1-1.5 2.1" /><path d="M9 13h.1" /></>,
  }

  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={stroke} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name] || shapes.file}
    </svg>
  )
}

function StatusDot({ tone = 'good' }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />
}

function App() {
  const [activeView, setActiveView] = useState('today')
  const [postTitle, setPostTitle] = useState('강릉 주문진 여행 코스 추천 | 바다 산책, 카페, 맛집까지 완벽 정리')
  const [notes, setNotes] = useState('강릉 주문진 여행 다녀왔어요. 바다가 예쁘고 커피 맛집이 많아서 좋았어요. 주문진 해변 산책, 인기 카페, 맛집 추천 중심으로 포스팅 작성해줘.')
  const [tone, setTone] = useState('친근하고 정보적인')
  const [images, setImages] = useState(sampleImages)
  const [generated, setGenerated] = useState(true)
  const [toast, setToast] = useState('')
  const [integrationsState, setIntegrationsState] = useState(initialIntegrations)
  const [disclosure, setDisclosure] = useState(true)
  const [providerMode, setProviderMode] = useState('local')
  const [providerHealth, setProviderHealth] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [affiliateUrl, setAffiliateUrl] = useState('')
  const [affiliateChannel, setAffiliateChannel] = useState('shopping')
  const [activePostId, setActivePostId] = useState(null)
  const [libraryPosts, setLibraryPosts] = useState([])
  const [storageReady, setStorageReady] = useState(false)
  const [lastGeneration, setLastGeneration] = useState(null)
  const [body, setBody] = useState(`푸른 바다와 감성 가득한 카페, 맛있는 음식까지 모두 즐길 수 있는 강릉 주문진.\n\n주말을 맞아 다녀온 주문진 여행에서 직접 둘러본 산책 코스와 잠깐 쉬어가기 좋은 카페, 여행 동선을 기준으로 고른 맛집을 한 번에 정리해봤어요.\n\n1. 주문진 해변 산책\n\n아침 일찍 주문진 해변을 걸으며 상쾌한 바닷바람을 맞았어요. 넓게 펼쳐진 백사장과 맑은 바다가 마음을 편안하게 만들어 주더라고요.\n\n2. 창가가 예쁜 카페\n\n해변에서 차로 이동하기 좋은 카페를 골라 커피 한 잔과 함께 여유로운 시간을 보냈습니다. 사진을 남기기 좋은 창가 자리가 특히 마음에 들었어요.`)

  const fileRef = useRef(null)
  const currentDate = '2026. 08. 12. (수)'

  const activeLabel = useMemo(() => navigation.find((item) => item.id === activeView)?.label || '오늘의 작업', [activeView])

  const updateLibrary = (post) => {
    if (!post?.id) return
    setLibraryPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
  }

  const hydratePost = (post) => {
    if (!post) return
    setActivePostId(post.id)
    setPostTitle(post.title || '')
    setBody(post.body || '')
    setNotes(post.notes || '')
    setTone(post.tone || '친근하고 정보적인')
    setImages(Array.isArray(post.photos) ? post.photos : [])
    setDisclosure(Boolean(post.disclosure))
    setAffiliateUrl('')
    setAffiliateChannel('shopping')
    setProviderMode(post.provider === 'openai' ? 'openai' : 'local')
    setLastGeneration({ provider: post.provider, model: post.model, facts_to_verify: post.facts_to_verify || [], preflight: post.preflight || {} })
    setIntegrationsState({ ...initialIntegrations, ...Object.fromEntries((post.monetization || []).map((id) => [id, true])) })
    setGenerated(true)
  }

  useEffect(() => {
    let mounted = true
    Promise.all([apiRequest('/health'), apiRequest('/api/posts?limit=50')])
      .then(([health, postsPayload]) => {
        if (!mounted) return
        setProviderHealth(health.providers || null)
        const posts = postsPayload.posts || []
        setLibraryPosts(posts)
        setStorageReady(true)
        if (posts[0]) hydratePost(posts[0])
      })
      .catch(() => { if (mounted) setProviderHealth(null) })
    return () => { mounted = false }
  }, [])

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 6)
    if (!selected.length) return
    Promise.all(selected.map((file) => new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ id: `${file.name}-${file.lastModified}`, src: reader.result, alt: file.name })
      reader.readAsDataURL(file)
    }))).then((nextImages) => {
      setImages(nextImages)
      notify(`${nextImages.length}장의 사진을 불러왔어요.`)
    })
  }

  const createDraft = async () => {
    setIsGenerating(true)
    setGenerated(false)
    const monetization = integrations.filter((item) => integrationsState[item.id]).map((item) => item.id)
    try {
      const payload = await apiRequest('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postTitle,
          notes,
          tone,
          provider: providerMode,
          monetization,
          disclosure: disclosure ? disclosureText : '',
          photos: images.slice(0, 6).map(({ id, src, alt }) => ({ id, src, alt })),
        }),
      })
      if (!payload.draft) throw new Error('초안 응답이 비어 있습니다.')
      setPostTitle(payload.draft.title || postTitle || '사진으로 기록한 오늘의 여행')
      setBody(payload.draft.body || body)
      setLastGeneration(payload)
      if (payload.post) {
        setActivePostId(payload.post.id)
        updateLibrary(payload.post)
      }
      setGenerated(true)
      notify(payload.message || '근거 확인이 필요한 초안을 만들었어요. 내용을 검토해 주세요.')
    } catch (error) {
      setGenerated(true)
      notify(error instanceof Error ? error.message : '초안을 만들지 못했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const saveDraft = async () => {
    if (!postTitle.trim() && !body.trim()) {
      notify('제목이나 본문을 먼저 입력한 뒤 저장하세요.')
      return
    }
    setIsSaving(true)
    const payload = {
      title: postTitle,
      body,
      notes,
      tone,
      provider: providerMode,
      model: lastGeneration?.model || null,
      status: 'review',
      monetization: integrations.filter((item) => integrationsState[item.id]).map((item) => item.id),
      disclosure: disclosure ? disclosureText : '',
      photos: images.slice(0, 6),
      facts_to_verify: lastGeneration?.facts_to_verify || [],
      preflight: lastGeneration?.preflight || {},
    }
    try {
      const result = await apiRequest(activePostId ? `/api/posts/${activePostId}` : '/api/posts', {
        method: activePostId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const saved = result.post
      setActivePostId(saved.id)
      updateLibrary(saved)
      notify('초안을 저장했습니다. 다시 열어도 내용이 유지됩니다.')
    } catch (error) {
      notify(error instanceof Error ? error.message : '초안을 저장하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const startNewPost = () => {
    setActiveView('new')
    setActivePostId(null)
    setPostTitle('')
    setBody('')
    setNotes('')
    setTone('친근하고 정보적인')
    setImages([])
    setDisclosure(true)
    setAffiliateUrl('')
    setAffiliateChannel('shopping')
    setProviderMode('local')
    setLastGeneration(null)
    setIntegrationsState(initialIntegrations)
    setGenerated(false)
  }

  const openPost = (post) => {
    hydratePost(post)
    setActiveView('today')
  }

  const toggleIntegration = (id) => {
    setIntegrationsState((state) => ({ ...state, [id]: !state[id] }))
    const item = integrations.find((integration) => integration.id === id)
    notify(`${item?.label || '채널'}을 이 초안에 ${integrationsState[id] ? '선택 해제' : '선택'}했어요.`)
  }

  const attachLinkToDraft = () => {
    const channel = affiliateChannels.find((item) => item.value === affiliateChannel) || affiliateChannels[0]
    const result = attachAffiliateLink(body, affiliateUrl, channel.label, disclosureText)
    if (!result.ok) {
      notify(result.code === 'duplicate_url' ? '이미 본문에 같은 링크가 있어요.' : 'http 또는 https로 시작하는 링크를 입력하세요.')
      return
    }
    setBody(result.body)
    setDisclosure(true)
    if (channel.integrationId) setIntegrationsState((state) => ({ ...state, [channel.integrationId]: true }))
    setAffiliateUrl('')
    notify('링크와 고지문을 본문에 삽입했습니다. 저장 버튼으로 확정하세요.')
  }

  const copyDraft = async () => {
    const disclosureSuffix = disclosure && !body.includes(disclosureText) ? `\n\n${disclosureText}` : ''
    const text = `${postTitle}\n\n${body}${disclosureSuffix}`
    try {
      await navigator.clipboard.writeText(text)
      notify('초안을 클립보드에 복사했어요. 네이버 블로그에서 검토 후 붙여넣으세요.')
    } catch {
      notify('복사를 시작했어요. 브라우저 권한을 확인해 주세요.')
    }
  }

  const disclosureText = '이 포스팅은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다.'
  const reviewCount = libraryPosts.filter((post) => post.status !== 'published').length

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} onNewPost={startNewPost} libraryCount={libraryPosts.length} reviewCount={reviewCount} />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">WORKSPACE / BLOGPOST</span>
            <div className="title-line">
              <h1>{activeLabel}</h1>
              <span className="date-chip"><Icon name="calendar" size={15} /> {currentDate}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => setActiveView('library')}><Icon name="file" size={16} /> 저장된 초안 <span className="button-count">{libraryPosts.length}</span></button>
            <span className={`storage-status ${storageReady ? 'ready' : 'pending'}`}><StatusDot tone={storageReady ? 'good' : 'muted'} />{storageReady ? '로컬 저장됨' : '저장소 연결 중'}</span>
            <button className="icon-button" aria-label="설정" onClick={() => notify('워크스페이스 설정은 다음 업데이트에서 제공됩니다.')}><Icon name="settings" size={18} /></button>
            <button className="primary-button" onClick={startNewPost}>새 포스트 만들기 <Icon name="arrow" size={16} /></button>
          </div>
        </header>

        {activeView === 'today' || activeView === 'new' ? (
          <Dashboard
            isNew={activeView === 'new'}
            images={images}
            fileRef={fileRef}
            onFiles={handleFiles}
            notes={notes}
            setNotes={setNotes}
            tone={tone}
            setTone={setTone}
            onGenerate={createDraft}
            generated={generated}
            postTitle={postTitle}
            setPostTitle={setPostTitle}
            body={body}
            setBody={setBody}
            disclosure={disclosure}
            setDisclosure={setDisclosure}
            providerMode={providerMode}
            setProviderMode={setProviderMode}
            providerHealth={providerHealth}
            isGenerating={isGenerating}
            isSaving={isSaving}
            lastGeneration={lastGeneration}
            copyDraft={copyDraft}
            onSave={saveDraft}
            libraryPosts={libraryPosts}
            integrationsState={integrationsState}
            toggleIntegration={toggleIntegration}
            setActiveView={setActiveView}
            notify={notify}
          />
        ) : null}

        {activeView === 'library' ? <LibraryView posts={libraryPosts} onOpenPost={openPost} onNewPost={startNewPost} /> : null}
        {activeView === 'monetization' ? <MonetizationView integrationsState={integrationsState} toggleIntegration={toggleIntegration} notify={notify} affiliateUrl={affiliateUrl} setAffiliateUrl={setAffiliateUrl} affiliateChannel={affiliateChannel} setAffiliateChannel={setAffiliateChannel} onAttachLink={attachLinkToDraft} /> : null}
        {activeView === 'policy' ? <PolicyView disclosure={disclosure} setDisclosure={setDisclosure} notify={notify} /> : null}
      </main>

      {toast ? <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div> : null}
    </div>
  )
}

function Sidebar({ activeView, setActiveView, onNewPost, libraryCount, reviewCount }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">b.</div>
        <div>
          <strong>블로그포스트</strong>
          <span>creator workspace</span>
        </div>
      </div>

      <div className="workspace-select">
        <span className="avatar small">C</span>
        <div className="workspace-copy"><strong>크리에이터 스튜디오</strong><span>개인 워크스페이스</span></div>
        <Icon name="chevron" size={15} />
      </div>

      <nav className="main-nav" aria-label="주 메뉴">
        <p className="nav-label">WORKSPACE</p>
        {navigation.slice(0, 3).map((item) => (
          <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => item.id === 'new' ? onNewPost() : setActiveView(item.id)}>
            <Icon name={item.icon} size={18} /> <span>{item.label}</span>
            {item.id === 'library' ? <span className="nav-meta">{libraryCount}</span> : null}
          </button>
        ))}
        <div className="nav-divider" />
        <p className="nav-label">GROWTH</p>
        {navigation.slice(3).map((item) => (
          <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => setActiveView(item.id)}>
            <Icon name={item.icon} size={18} /> <span>{item.label}</span>
            {item.id === 'policy' ? <StatusDot tone="warning" /> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-summary">
        <div className="summary-heading"><span>이번 달 요약</span><span className="summary-period">8. 1 — 8. 31</span></div>
        <div className="summary-row"><span>저장된 포스트</span><strong>{libraryCount}</strong></div>
        <div className="summary-row"><span>검토 대기</span><strong className="lime">{reviewCount}</strong></div>
        <div className="summary-row"><span>예상 수익</span><strong className="lime">{libraryCount ? '집계 준비' : '—'}</strong></div>
        <div className="summary-line" />
        <button className="summary-button" onClick={() => setActiveView('monetization')}>리포트 자세히 보기 <Icon name="arrow" size={14} /></button>
      </div>

      <div className="sidebar-footer">
        <div className="profile-avatar">C</div>
        <div className="profile-copy"><strong>크리에이터</strong><span>creator@blogpost.kr</span></div>
        <Icon name="chevron" size={15} />
      </div>
    </aside>
  )
}

function Dashboard({ images, fileRef, onFiles, notes, setNotes, tone, setTone, onGenerate, generated, postTitle, setPostTitle, body, setBody, disclosure, setDisclosure, providerMode, setProviderMode, providerHealth, isGenerating, isSaving, lastGeneration, copyDraft, onSave, integrationsState, toggleIntegration, setActiveView, notify, libraryPosts }) {
  const reviewCount = (libraryPosts || []).filter((post) => post.status !== 'published').length
  return (
    <div className="dashboard-page">
      <div className="page-intro">
        <div><span className="intro-kicker"><Icon name="spark" size={14} /> PHOTO → DRAFT</span><h2>사진 한 장에서<br /><em>검토 가능한 글</em>까지.</h2><p>사진과 메모를 넣으면 내 목소리에 맞는 초안을 만들고,<br />수익화 링크와 게시 전 체크까지 한 번에 준비합니다.</p></div>
        <div className="intro-stats"><div><strong>{libraryPosts.length}</strong><span>저장된 포스트</span></div><div><strong>{reviewCount}</strong><span>검토 대기</span></div></div>
      </div>

      <div className="dashboard-grid">
        <div className="primary-column">
          <Composer images={images} fileRef={fileRef} onFiles={onFiles} notes={notes} setNotes={setNotes} tone={tone} setTone={setTone} onGenerate={onGenerate} providerMode={providerMode} setProviderMode={setProviderMode} providerHealth={providerHealth} isGenerating={isGenerating} />
          <div className="draft-layout">
          <DraftPreview generated={generated} images={images} postTitle={postTitle} setPostTitle={setPostTitle} body={body} setBody={setBody} disclosure={disclosure} setDisclosure={setDisclosure} lastGeneration={lastGeneration} copyDraft={copyDraft} onSave={onSave} isSaving={isSaving} notify={notify} />
            <DraftTools onTool={(label) => notify(`${label} 도구를 열었어요.`)} />
          </div>
        </div>
        <aside className="right-column">
          <IntegrationPanel integrationsState={integrationsState} toggleIntegration={toggleIntegration} setActiveView={setActiveView} />
          <ComplianceCard setActiveView={setActiveView} />
          <MiniQueue setActiveView={setActiveView} posts={libraryPosts} />
        </aside>
      </div>
    </div>
  )
}

function Composer({ images, fileRef, onFiles, notes, setNotes, tone, setTone, onGenerate, providerMode, setProviderMode, providerHealth, isGenerating }) {
  const localReady = Boolean(providerHealth?.ollama?.text_ready)
  const openaiReady = Boolean(providerHealth?.openai?.configured)
  const activeProviderReady = providerMode === 'openai' ? openaiReady : localReady

  return (
    <section className="card composer-card">
      <div className="card-heading composer-heading"><div><div className="heading-with-icon"><span className="heading-icon purple"><Icon name="spark" size={17} /></span><h3>초안 만들기</h3><span className="heading-subtitle">사진과 메모를 입력하면 블로그 초안을 자동으로 생성해 드립니다.</span></div></div><button className="soft-button" onClick={() => document.querySelector('.note-input')?.focus()}><Icon name="help" size={15} /> 작성 가이드</button></div>
      <div className="composer-form">
        <div className="photo-field">
          <div className="field-label"><strong>사진 업로드</strong><button className="info-button" aria-label="사진 업로드 안내"><Icon name="help" size={13} /></button><span>JPG, PNG · 최대 10MB</span></div>
          <div className="photo-row">
            {images.slice(0, 3).map((image) => <div className="photo-thumb" key={image.id}><img src={image.src} alt={image.alt} /><button aria-label={`${image.alt} 삭제`}><span>×</span></button></div>)}
            <button className="add-photo" onClick={() => fileRef.current?.click()}><span className="add-photo-icon">+</span><strong>사진 추가</strong><span>JPG, PNG<br />(최대 10MB)</span></button>
          </div>
          <input ref={fileRef} onChange={onFiles} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple />
        </div>
        <div className="note-field"><div className="field-label"><strong>메모 입력</strong><button className="info-button" aria-label="메모 입력 안내"><Icon name="help" size={13} /></button><span>{notes.length} / 500</span></div><textarea className="note-input" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="포스트 메모" /></div>
      </div>
      <div className="composer-footer"><label className="tone-select"><strong>톤앤매너</strong><select value={tone} onChange={(event) => setTone(event.target.value)}><option>친근하고 정보적인</option><option>차분한 전문가</option><option>일상적인 에세이</option><option>짧고 명확한 리뷰</option></select><Icon name="chevron" size={14} /></label><label className="provider-select"><strong>AI 모드</strong><select aria-label="AI 실행 모드" value={providerMode} onChange={(event) => setProviderMode(event.target.value)}><option value="local">로컬 무료 · Ollama</option><option value="openai" disabled={!openaiReady}>Luna API 보정 · {openaiReady ? '선택 실행' : '키 저장 필요'}</option></select><Icon name="chevron" size={14} /></label><span className={`provider-health ${activeProviderReady ? 'ready' : 'muted'}`}><StatusDot tone={activeProviderReady ? 'good' : 'muted'} />{providerMode === 'openai' ? (openaiReady ? 'Luna API 준비' : 'API 키 확인 필요') : (localReady ? 'Qwen3 준비' : 'Ollama 확인 필요')}</span><button className="generate-button" onClick={onGenerate} disabled={isGenerating}><Icon name="spark" size={17} /> {isGenerating ? '생성 중…' : '초안 생성하기'}</button></div>
    </section>
  )
}

function DraftPreview({ generated, images, postTitle, setPostTitle, body, setBody, disclosure, setDisclosure, lastGeneration, copyDraft, onSave, isSaving, notify }) {
  return (
    <section className={`card draft-card ${generated ? 'has-draft' : 'empty-draft'}`}>
      <div className="draft-header"><div className="heading-with-icon"><span className="heading-icon purple"><Icon name="spark" size={17} /></span><h3>생성된 초안</h3>{generated ? <span className="ai-badge">AI 생성</span> : null}{lastGeneration?.provider ? <span className={`provider-badge ${lastGeneration.provider}`}>{lastGeneration.provider === 'openai' ? 'Luna API 보정' : lastGeneration.provider === 'ollama' ? 'Ollama 로컬' : '로컬 안전 초안'}</span> : null}</div><div className="draft-actions"><button className="text-button" onClick={onSave} disabled={isSaving}><Icon name="file" size={15} /> {isSaving ? '저장 중…' : '저장'}</button><button className="icon-button compact" aria-label="초안 더보기" onClick={() => notify('초안 메뉴를 열었어요.')}><Icon name="dots" size={18} /></button></div></div>
      {!generated ? <div className="empty-state"><span className="empty-orb"><Icon name="spark" size={22} /></span><h4>사진과 메모를 준비했나요?</h4><p>위에서 초안 생성하기를 누르면 이곳에 편집 가능한 글이 생깁니다.</p></div> : <>
        <div className="editor-toolbar"><span>본문</span><Icon name="chevron" size={13} /><span className="toolbar-separator" /><b>H2</b><b>H3</b><b>B</b><i>I</i><u>U</u><span className="toolbar-separator" /><Icon name="list" size={16} /><span className="quote-mark">“</span><Icon name="link" size={16} /><Icon name="image" size={16} /></div>
        <div className="editor-surface"><input className="draft-title-input" value={postTitle} onChange={(event) => setPostTitle(event.target.value)} aria-label="초안 제목" /><textarea className="draft-body-input" value={body} onChange={(event) => setBody(event.target.value)} aria-label="초안 본문" />{images.length ? <div className="draft-image-stack">{images.slice(0, 2).map((image) => <img key={image.id} src={image.src} alt={image.alt} />)}</div> : null}{disclosure ? <div className="disclosure-line"><Icon name="shield" size={14} /> {disclosureText}<button onClick={() => setDisclosure(false)}>숨기기</button></div> : null}{lastGeneration?.facts_to_verify?.length ? <div className="facts-line"><Icon name="help" size={14} /> 확인 필요: {lastGeneration.facts_to_verify.join(' · ')}</div> : null}</div>
        <div className="editor-footer"><span>글자 수 {body.length.toLocaleString()}자 <i /> 이미지 {images.length}개</span><span>예상 읽기 시간 4분</span></div>
        <div className="draft-bottom-actions"><label className="disclosure-toggle"><input type="checkbox" checked={disclosure} onChange={(event) => setDisclosure(event.target.checked)} /><span className="toggle-track" /><span>제휴·협찬 표기 포함</span></label><button className="copy-button" onClick={copyDraft}><Icon name="copy" size={15} /> 검토용으로 복사</button><button className="publish-button" onClick={() => notify('게시 전 확인 화면으로 이동합니다.')}><Icon name="check" size={15} /> 게시 전 확인</button></div>
      </>}
    </section>
  )
}

const disclosureText = '이 포스팅은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다.'

function DraftTools({ onTool }) {
  return <div className="draft-tools">{[['edit', '내용 편집'], ['image', '이미지 편집'], ['list', '구성 추천'], ['search', 'SEO 분석'], ['copy', '복사']].map(([icon, label]) => <button key={label} onClick={() => onTool(label)}><Icon name={icon} size={19} /><span>{label}</span></button>)}</div>
}

function IntegrationPanel({ integrationsState, toggleIntegration, setActiveView }) {
  return <section className="card integration-card"><div className="panel-heading"><div><h3>수익화 채널 선택</h3><p>계정 연결이 아니라 이 초안에 사용할 채널을 고릅니다.</p></div><button className="icon-button compact" onClick={() => setActiveView('monetization')} aria-label="수익화 페이지"><Icon name="arrow" size={16} /></button></div><div className="integration-list">{integrations.map((item) => <button className="integration-row" key={item.id} onClick={() => toggleIntegration(item.id)}><span className={`integration-logo ${item.color}`}>{item.short}</span><span className="integration-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className={`integration-status ${integrationsState[item.id] ? 'connected' : ''}`}>{integrationsState[item.id] ? '초안에 선택됨' : item.id === 'adsense' ? '사이트 필요' : '선택 안 함'}<StatusDot tone={integrationsState[item.id] ? 'good' : 'muted'} /></span></button>)}</div><button className="settings-link" onClick={() => setActiveView('monetization')}>수익화 설정 보기 <Icon name="arrow" size={15} /></button></section>
}

function ComplianceCard({ setActiveView }) {
  return <section className="card compliance-card"><div className="panel-heading"><div><h3>규정 점검 결과</h3><p>게시 전 자동 확인</p></div><button className="outline-small" onClick={() => setActiveView('policy')}>상세 보기</button></div><div className="compliance-score"><div className="score-ring"><Icon name="check" size={27} /></div><div><strong>확인 필요 1건</strong><span>광고·협찬 표기를 검토해 주세요.</span></div></div><div className="policy-mini-list">{policyChecks.slice(0, 4).map((check) => <div key={check.label}><span>{check.label}</span><span className={check.state === '확인 필요' ? 'warning-text' : 'good-text'}>{check.state}<StatusDot tone={check.state === '확인 필요' ? 'warning' : 'good'} /></span></div>)}</div><button className="policy-cta" onClick={() => setActiveView('policy')}><Icon name="shield" size={16} /> 게시 전 확인 <Icon name="arrow" size={15} /></button></section>
}

function MiniQueue({ setActiveView, posts }) {
  const reviewPosts = (posts || []).filter((post) => post.status !== 'published').slice(0, 2)
  return <section className="card mini-queue"><div className="panel-heading"><div><h3>검토 대기</h3><p>사람의 마지막 터치가 필요해요.</p></div><button className="text-link" onClick={() => setActiveView('library')}>전체 보기 <Icon name="arrow" size={13} /></button></div>{reviewPosts.length ? reviewPosts.map((post, index) => <button className="queue-item" key={post.id} onClick={() => setActiveView('library')}><span className={`queue-thumb ${index ? 'two' : 'one'}`} /><div><strong>{post.title || '제목 없는 초안'}</strong><span>저장됨 · 게시 전 검토</span></div><StatusDot tone="warning" /></button>) : <div className="queue-empty">저장된 검토 대기 초안이 없습니다.</div>}</section>
}

function LibraryView({ posts, onOpenPost, onNewPost }) {
  const [search, setSearch] = useState('')
  const filteredPosts = (posts || []).filter((post) => `${post.title} ${post.body} ${post.notes}`.toLowerCase().includes(search.toLowerCase()))
  const statusLabel = (status) => status === 'published' ? '게시 완료' : status === 'review' ? '게시 전 확인' : '초안 저장'
  const statusTone = (status) => status === 'published' ? 'good' : status === 'review' ? 'warning' : 'muted'
  return <div className="subpage"><div className="subpage-heading"><div><span className="intro-kicker"><Icon name="file" size={14} /> LIBRARY</span><h2>포스트 라이브러리</h2><p>작성한 초안과 게시 준비 상태를 한눈에 관리하세요.</p></div><button className="primary-button" onClick={onNewPost}>새 포스트 만들기 <Icon name="arrow" size={16} /></button></div><div className="toolbar-row"><div className="search-field"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목, 메모, 태그 검색" /></div><div className="filter-pills"><button className="filter-pill active">전체 {posts.length}</button><button className="filter-pill">검토 대기 {posts.filter((post) => post.status !== 'published').length}</button><button className="filter-pill">게시 완료 {posts.filter((post) => post.status === 'published').length}</button></div></div><div className="library-table">{filteredPosts.length ? filteredPosts.map((post) => <div className="library-row" key={post.id}><span className={`library-thumb ${statusTone(post.status)}`} /><div className="library-title"><strong>{post.title || '제목 없는 초안'}</strong><span>{post.photos?.length || 0}장 · 마지막 저장 {new Date(post.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><span className="library-status"><StatusDot tone={statusTone(post.status)} />{statusLabel(post.status)}</span><button className="icon-button compact" aria-label={`${post.title || '초안'} 열기`} onClick={() => onOpenPost(post)}><Icon name="arrow" size={16} /></button></div>) : <div className="library-empty">아직 저장된 포스트가 없습니다. 새 포스트를 만들고 저장해 보세요.</div>}</div><div className="pagination"><span>{filteredPosts.length}개 표시 · 자동 저장 아님, 저장 버튼으로 확정</span></div></div>
}

function MonetizationView({ integrationsState, toggleIntegration, notify, affiliateUrl, setAffiliateUrl, affiliateChannel, setAffiliateChannel, onAttachLink }) {
  const selectedCount = Object.values(integrationsState).filter(Boolean).length
  return <div className="subpage"><div className="subpage-heading"><div><span className="intro-kicker"><Icon name="chart" size={14} /> REVENUE LAYER</span><h2>수익화 채널 선택</h2><p>외부 계정은 연결하지 않고, 이 초안에 사용할 채널과 고지문을 관리합니다.</p></div><button className="ghost-button" onClick={() => notify('실제 수익 리포트는 각 채널 계정 연결 후 제공됩니다.')}><Icon name="chart" size={16} /> 리포트 안내</button></div><div className="metric-grid"><Metric label="이번 달 예상 수익" value="—" delta="외부 계정 연결 필요" /><Metric label="클릭 → 구매 전환" value="—" delta="추적 설정 필요" /><Metric label="이 초안의 채널" value={`${selectedCount} / 5`} delta="선택된 채널 수" /></div><div className="monetization-layout"><section className="card connector-card"><div className="section-heading"><div><h3>초안에 사용할 채널</h3><p>버튼은 계정 연결이 아니라 이 초안에 채널을 선택하는 기능입니다.</p></div><span className="security-label"><Icon name="shield" size={14} /> 실제 계정·자격 증명은 연결하지 않음</span></div><div className="connector-grid">{integrations.map((item) => <ConnectorCard key={item.id} item={item} selected={integrationsState[item.id]} onToggle={() => toggleIntegration(item.id)} />)}</div></section><section className="card affiliate-builder"><div className="section-heading"><div><h3>제휴 링크 넣기</h3><p>입력한 원문 링크를 본문에 실제로 삽입하고 고지문을 함께 추가합니다.</p></div><Icon name="link" size={20} /></div><label>상품 또는 캠페인 링크<input value={affiliateUrl} onChange={(event) => setAffiliateUrl(event.target.value)} placeholder="https://smartstore.naver.com/..." /></label><div className="builder-row"><label>채널<select value={affiliateChannel} onChange={(event) => setAffiliateChannel(event.target.value)}>{affiliateChannels.map((channel) => <option value={channel.value} key={channel.value}>{channel.label}</option>)}</select></label><button className="primary-button" onClick={onAttachLink}>본문에 삽입 <Icon name="arrow" size={15} /></button></div><div className="builder-note"><Icon name="shield" size={15} /><span>링크를 삽입하면 중복 여부와 http(s) 주소를 확인하고 경제적 이해관계 고지문을 함께 추가합니다. 이후 저장 버튼을 눌러야 포스트에 확정됩니다.</span></div></section></div></div>
}

function Metric({ label, value, delta }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small><span className="metric-arrow">↗</span> {delta}</small></div>
}

function ConnectorCard({ item, selected, onToggle }) {
  return <div className="connector-item"><div className={`integration-logo large ${item.color}`}>{item.short}</div><div className="connector-copy"><strong>{item.label}</strong><span>{item.detail}</span><small>{selected ? '이 초안에 선택됨 · 외부 계정은 연결되지 않음' : item.id === 'adsense' ? '소유 사이트와 AdSense 계정이 별도로 필요' : '계정 연결 없이 초안 메타데이터만 준비'}</small></div><button className={selected ? 'connected-button' : 'connect-button'} onClick={onToggle}>{selected ? <><Icon name="check" size={14} /> 초안에 선택됨</> : '초안에 선택'}</button></div>
}

function PolicyView({ disclosure, setDisclosure, notify }) {
  return <div className="subpage policy-page"><div className="subpage-heading"><div><span className="intro-kicker"><Icon name="shield" size={14} /> TRUST & SAFETY</span><h2>규정 점검</h2><p>자동화는 초안까지만. 마지막 판단은 사람이 하도록 설계했습니다.</p></div><button className="primary-button" onClick={() => notify('현재 초안의 규정 점검을 다시 실행했어요.')}><Icon name="check" size={15} /> 다시 점검하기</button></div><div className="policy-layout"><section className="card policy-overview"><div className="policy-hero"><div className="score-ring large"><Icon name="check" size={31} /></div><div><span className="section-kicker">CURRENT DRAFT</span><h3>게시 준비도 <strong>96</strong><small>/ 100</small></h3><p>현재 초안은 게시 전 검토 단계에 있습니다.</p></div></div><div className="policy-check-list">{policyChecks.map((check) => <div className="policy-check-row" key={check.label}><div className="check-icon"><Icon name={check.state === '확인 필요' ? 'help' : 'check'} size={15} /></div><div><strong>{check.label}</strong><span>{check.note}</span></div><b className={check.state === '확인 필요' ? 'warning-text' : 'good-text'}>{check.state}</b></div>)}</div></section><section className="card disclosure-card"><div className="section-heading"><div><h3>광고·제휴 표기</h3><p>경제적 이해관계가 있는 글에 자동 삽입합니다.</p></div><label className="switch"><input type="checkbox" checked={disclosure} onChange={(event) => setDisclosure(event.target.checked)} /><span /></label></div><div className="disclosure-preview"><span className="disclosure-tag"><Icon name="shield" size={13} /> 독자에게 표시될 문구</span><p>{disclosure ? disclosureText : '표기 문구가 비활성화되어 있습니다.'}</p></div><div className="rule-note"><Icon name="help" size={15} /><span>표시 문구는 추천·광고 내용과 가까운 위치에 쉽게 알아볼 수 있게 배치해야 합니다.</span></div><button className="outline-wide" onClick={() => notify('표기 문구 편집은 연결 채널별 설정에서 할 수 있어요.')}>표기 문구 편집 <Icon name="arrow" size={15} /></button></section></div><section className="card reference-card"><div><span className="section-kicker">SAFE AUTOMATION</span><h3>블로그포스트의 안전 원칙</h3></div><div className="principle-grid"><div><strong>01</strong><span>근거 없는 경험·가격·수치를 생성하지 않습니다.</span></div><div><strong>02</strong><span>제휴·협찬 표기를 숨기지 않고 초안에 남깁니다.</span></div><div><strong>03</strong><span>네이버 자동 대량 발행 대신 검토 후 직접 게시합니다.</span></div></div></section></div>
}

export default App
