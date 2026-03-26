import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import {
  WETH_USD, ROUND_S, CHART_LEN,
  createTraders, buy, sell, updStreak, resetStreak,
  getLeaderboard, drawWheel, drawChart,
} from './sim'

// ── Contract / chain config (set after deploy) ──────────────────────
const ARENA_ADDRESS = import.meta.env.VITE_ARENA_ADDRESS || null
const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || null
const UNISWAP_URL   = TOKEN_ADDRESS
  ? `https://app.uniswap.org/swap?outputCurrency=${TOKEN_ADDRESS}&chain=base`
  : 'https://app.uniswap.org/?chain=base'

// ── Starfield background ──────────────────────────────────────────────
function Starfield() {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv.getContext('2d')
    let W, H, stars = [], sy = 0, raf
    const resize = () => {
      W = cv.width = innerWidth; H = cv.height = innerHeight
      stars = Array.from({ length: 100 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() < .2 ? 1.5 : .7,
        a: Math.random(), da: (.003 + Math.random() * .008) * (Math.random() < .5 ? 1 : -1),
        c: Math.random() < .18 ? '#0052FF' : Math.random() < .1 ? '#00d4aa' : '#b0c8e8',
      }))
    }
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      stars.forEach(s => {
        s.a = Math.max(0, Math.min(1, s.a + s.da))
        if (s.a <= 0 || s.a >= 1) s.da *= -1
        ctx.globalAlpha = s.a * .6; ctx.fillStyle = s.c
        ctx.fillRect(s.x, s.y, s.r, s.r)
      })
      ctx.globalAlpha = .025; ctx.fillStyle = '#0052FF'
      ctx.fillRect(0, sy, W, 2); sy = (sy + .5) % H
      ctx.globalAlpha = 1; raf = requestAnimationFrame(draw)
    }
    resize(); draw()
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }}/>
}

// ── ChainGuard: tells user to switch to Base ────────────────────────
function ChainGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { isConnected } = useAccount()
  if (!isConnected || chainId === base.id) return null
  return (
    <div style={{ background:'rgba(255,51,85,.12)', border:'1px solid var(--red)',
      padding:'8px 16px', fontFamily:'var(--mono)', fontSize:11, color:'var(--red)',
      display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
      <span>⚠ Switch to Base network to play</span>
      <button onClick={() => switchChain({ chainId: base.id })}
        style={{ fontFamily:'var(--px)', fontSize:7, letterSpacing:2, padding:'6px 12px',
          background:'var(--red)', border:'none', color:'#fff', cursor:'pointer' }}>
        SWITCH TO BASE
      </button>
    </div>
  )
}

// ── My Position panel ──────────────────────────────────────────────
function MyPosition({ traders, roundId }) {
  const { address, isConnected } = useAccount()
  const { data: wethBal } = useBalance({ address, token: '0x4200000000000000000000000000000000000006', chainId: base.id, enabled: !!address })

  // Simulated claim amounts for demo (replace with contract reads in production)
  const simClaim = 0.0312
  const simVest  = 0.1875
  const simStreak = 3

  if (!isConnected) {
    return (
      <div className="pos-connect-prompt">
        <div className="ico">🔗</div>
        <p>Connect your wallet to see your PNL, claimable rewards, and vesting balance</p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button className="claim-btn" onClick={openConnectModal}>
              CONNECT WALLET
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    )
  }

  const short = address ? address.slice(0, 6) + '...' + address.slice(-4) : ''

  return (
    <div className="pos-inner">
      <div className="pos-lbl">WALLET</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--base)', marginBottom:8 }}>{short}</div>

      {wethBal && (
        <>
          <div className="pos-lbl">WETH BALANCE</div>
          <div className="pos-val">{parseFloat(wethBal.formatted).toFixed(4)} Ξ</div>
        </>
      )}

      <div className="pos-lbl" style={{ marginTop:10 }}>INSTANT CLAIMABLE</div>
      <div className="pos-val pos">{simClaim.toFixed(4)} Ξ</div>
      <button className="claim-btn" onClick={() => alert('Claim tx — connect to mainnet Arena contract')}>
        CLAIM REWARDS
      </button>

      <div className="pos-lbl" style={{ marginTop:12 }}>VESTED BALANCE</div>
      <div className="pos-val">{simVest.toFixed(4)} Ξ</div>
      <div className="vest-bar"><div className="vest-fill" style={{ width:'25%' }}/></div>
      <div className="vest-note">{(simVest/4).toFixed(4)} Ξ unlocked now</div>
      <button className="claim-btn gold-btn" style={{ marginTop:6 }}
        onClick={() => alert('Claim vested tx — connect to mainnet Arena contract')}>
        CLAIM VESTED
      </button>

      <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border)' }}>
        <div className="pos-lbl">STREAK</div>
        <div className="pos-val">{simStreak} ROUNDS</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--amber)', marginTop:2 }}>
          🔥 1.50× REBATE MULTIPLIER
        </div>
      </div>
    </div>
  )
}

// ── HTP modal ─────────────────────────────────────────────────────────
const HTP_TABS = ['OVERVIEW','PRIZES','VESTING','KILL SHOT','STREAKS','FAQ']

function HowToPlay({ onClose }) {
  const [tab, setTab] = useState(0)
  const [openFaq, setOpenFaq] = useState(null)
  return (
    <div className="overlay show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="htp-box">
        <div className="htp-hdr">
          <span className="htp-title">? HOW TO PLAY FEE WARS</span>
          <button className="htp-close" onClick={onClose}>✕ CLOSE</button>
        </div>
        <div className="htp-tabs">
          {HTP_TABS.map((t, i) => (
            <div key={i} className={`htp-tab${tab===i?' on':''}`} onClick={() => setTab(i)}>{t}</div>
          ))}
        </div>
        <div className="htp-body">

          {tab === 0 && (
            <>
              <div className="htp-sec">
                <div className="htp-h">WHAT IS FEE WARS?</div>
                <div className="htp-p">FeeWars is a <strong>live hourly trading competition</strong> on Base. Every swap of $FEEWARS on Uniswap sends a portion of the fee into the hourly prize pool. At the end of each 60-minute round, the wallet with the <strong>highest realized profit</strong> wins 50% of everything accumulated.</div>
                <div className="htp-p">No entry fee. No sign-up. Just trade and compete.</div>
              </div>
              <div className="htp-sec">
                <div className="htp-h">HOW A ROUND WORKS</div>
                {[
                  ['🔔','ROUND STARTS','A new 60-minute round begins automatically after each settlement. The pool starts with any Arena Carry from the previous round.'],
                  ['📈','TRADE TO COMPETE','Buy $FEEWARS, then sell it for a profit. Your realized PNL is tracked in real time. Unrealized gains don\'t count — you must sell.'],
                  ['⚡','FINAL 10 MINUTES','The Kill Shot window opens. Dethroning the leader earns you a bonus from their prize.'],
                  ['🏆','SETTLEMENT','At the hour mark, prizes distribute automatically on-chain. Rounds start again immediately.'],
                ].map(([ico,title,desc]) => (
                  <div key={title} className="step-row">
                    <div className="step-ico">{ico}</div>
                    <div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
              <div className="htp-sec">
                <div className="htp-h">WHAT IS REALIZED PNL?</div>
                <div className="htp-p">Realized PNL is what you actually lock in by selling. Holding tokens earns zero score.</div>
                <div className="htp-card">
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--gray)', lineHeight:2 }}>
                    Buy 10,000 tokens @ Ξ0.001 = cost <span style={{color:'var(--red)'}}>10 WETH</span><br/>
                    Sell 10,000 tokens @ Ξ0.0015 = receive <span style={{color:'var(--teal)'}}>15 WETH</span><br/>
                    Realized PNL = <strong style={{color:'var(--teal)'}}>+5 WETH ✓ scored</strong>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 1 && (
            <>
              <div className="htp-sec">
                <div className="htp-h">PRIZE DISTRIBUTION</div>
                <div className="htp-p">Every swap charges 1.2% — 57% routes to the Arena as WETH automatically.</div>
                <div className="split-bar">
                  {[['50%','var(--gold)'],['20%','var(--base)'],['10%','var(--teal)'],['5%','var(--amber)'],['15%','var(--gray2)']].map(([w,c]) => (
                    <div key={w} style={{width:w,background:c,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--px)',fontSize:7,color:c==='var(--gold)'||c==='var(--teal)'||c==='var(--amber)'?'#000':'#fff'}}>{w}</div>
                  ))}
                </div>
                <div className="split-labels">
                  {[['var(--gold)','Winner (50%)'],['var(--base)','Top 2–10 (20%)'],['var(--teal)','Vol Rebate (10%)'],['var(--amber)','Arena Carry (5%)'],['var(--gray2)','Dev (15%)']].map(([c,l]) => (
                    <div key={l} className="split-lbl"><div className="split-dot" style={{background:c}}/>{l}</div>
                  ))}
                </div>
              </div>
              <div className="htp-sec">
                <div className="htp-h">WHO GETS PAID?</div>
                {[
                  ['🥇','WINNER (50%)','Highest PNL wallet. 25% instant, 75% vested over 4 rounds.'],
                  ['🥈','TOP 2–10 (20%)','Rank 2–10 share proportionally. All paid instantly.'],
                  ['📊','VOLUME REBATE (10%)','Every active trader gets a share by volume. Streak multipliers apply.'],
                  ['🏛','ARENA CARRY (5%)','Rolls into the next round — pools grow over time.'],
                ].map(([ico,title,desc]) => (
                  <div key={title} className="step-row">
                    <div className="step-ico">{ico}</div>
                    <div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 2 && (
            <>
              <div className="htp-sec">
                <div className="htp-h">WHY VESTING?</div>
                <div className="htp-p">Winners receive 75% of their prize vested over 4 rounds. This keeps winners engaged and prevents instant sell pressure.</div>
              </div>
              <div className="htp-sec">
                <div className="htp-h">4-ROUND UNLOCK SCHEDULE</div>
                <div className="htp-p">Example: You win Round 10 with a 1.0 Ξ prize share.</div>
                <div className="vest-grid">
                  {[
                    {label:'ROUND 10',val:'0.25 Ξ',note:'INSTANT',now:true},
                    {label:'ROUND 11',val:'+0.1875 Ξ',note:'unlocks'},
                    {label:'ROUND 12',val:'+0.1875 Ξ',note:'unlocks'},
                    {label:'ROUND 13',val:'+0.1875 Ξ',note:'+remainder'},
                  ].map((b,i) => (
                    <div key={i} className={`vb${b.now?' now':''}`}>
                      <div className="vb-lbl">{b.label}</div>
                      <div className={`vb-pct${b.now?' teal':''}`}>{b.val}</div>
                      <div className="vb-note">{b.note}</div>
                    </div>
                  ))}
                </div>
                <div className="htp-p">You don't lose it — it just unlocks gradually. Connect your wallet to see your vesting balance and claim unlocked tranches.</div>
              </div>
            </>
          )}

          {tab === 3 && (
            <>
              <div className="htp-sec">
                <div className="htp-h">THE KILL SHOT WINDOW</div>
                <div className="htp-p">In the <strong>final 10 minutes</strong> of every round, the Kill Shot window activates. If the #1 leader changes during this window, the new leader fired a Kill Shot.</div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)',marginBottom:6}}>
                  <span>ROUND START</span><span>KILL SHOT WINDOW → END</span>
                </div>
                <div className="ks-tl"><div className="ks-normal"/><div className="ks-window"/></div>
                <div className="htp-p">The Kill Shot gives the new leader a <strong>5% bonus</strong> taken from the dethroned wallet's prize share.</div>
              </div>
              <div className="htp-sec">
                <div className="htp-h">STRATEGY</div>
                {[
                  ['⏰','TIMING IS EVERYTHING','If you\'re trailing, spike volume in the final minutes to overtake the leader and fire the Kill Shot.'],
                  ['🛡','DEFENDING THE CROWN','If you\'re leading, watch challengers in the final minutes and be ready to extend your lead.'],
                  ['💰','THE BONUS','Kill Shot bonus is 5% of the winner\'s 50% share. On a 1 Ξ pool that\'s 0.025 Ξ extra — just for the dethrone.'],
                ].map(([ico,title,desc]) => (
                  <div key={title} className="step-row">
                    <div className="step-ico">{ico}</div>
                    <div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 4 && (
            <>
              <div className="htp-sec">
                <div className="htp-h">STREAK MULTIPLIERS</div>
                <div className="htp-p">Finishing top-10 in consecutive rounds builds a streak. Your streak multiplies your volume rebate share.</div>
                <div className="htp-card">
                  {[['1 round','1.00× baseline'],['2 consecutive','1.25×'],['3 consecutive','1.50×'],['4+ consecutive','2.00× MAX']].map(([r,m]) => (
                    <div key={r} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontFamily:'var(--mono)',fontSize:11,borderBottom:'1px solid var(--border)'}}>
                      <span style={{color:'var(--gray)'}}>{r}</span>
                      <span style={{color:m.includes('MAX')?'var(--gold)':m.includes('1.0')?'var(--white)':'var(--amber)'}}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="htp-sec">
                <div className="htp-h">REFERRAL BONUS</div>
                <div className="htp-p">Register a referrer and earn +1% extra weight on your volume rebate. Your referrer earns a cut of your rebate — creating a natural growth loop baked into the contract.</div>
              </div>
            </>
          )}

          {tab === 5 && (
            <div className="htp-sec">
              <div className="htp-h">FAQ</div>
              {[
                ['Do I need to sign up?','No. Just trade $FEEWARS on Uniswap. The contract tracks every wallet automatically. Connect here to see your stats.'],
                ['What network?','Base mainnet (Chain ID: 8453). The Connect button automatically prompts you to switch if needed.'],
                ['How do I claim rewards?','Connect your wallet. The My Position panel shows claimable amounts. Click Claim Rewards or Claim Vested.'],
                ['What if nobody trades?','The contract requires a minimum pool before settling. Low-volume rounds carry their pool forward — next round is bigger.'],
                ['Is it fair?','2-of-3 oracle signatures required for settlement. PNL tracked via Transfer events (aggregator-safe). Minimum volume thresholds prevent dust farming.'],
                ['Can I lose money?','Yes — this is real trading. Never trade more than you can afford to lose. DYOR.'],
                ['Where do fees come from?','1.2% on every Uniswap swap. 57% (≈0.684% per swap) routes to the Arena as WETH automatically.'],
              ].map(([q, a], i) => (
                <div key={i} className={`faq-item${openFaq===i?' open':''}`} onClick={() => setOpenFaq(openFaq===i?null:i)}>
                  <div className="faq-q">{q}<span className="faq-arr">▶</span></div>
                  <div className="faq-a">{a}</div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  // ── Sim state ──────────────────────────────────────────────────
  const [roundId, setRoundId]     = useState(1)
  const [timeLeft, setTimeLeft]   = useState(ROUND_S)
  const [pool, setPool]           = useState(0)
  const [vol, setVol]             = useState(0)
  const [arenaCarry, setArenaCarry] = useState(0)
  const [price, setPrice]         = useState(.001)
  const [price0, setPrice0]       = useState(.001)
  const [priceHist, setPriceHist] = useState([])
  const [crown, setCrown]         = useState(null)
  const [ksWallet, setKsWallet]   = useState(null)
  const [ksFired, setKsFired]     = useState(false)
  const [prevLeader, setPrevLeader] = useState(null)
  const [history, setHistory]     = useState([])
  const [settled, setSettled]     = useState(null)
  const [autoCount, setAutoCount] = useState(8)
  const [feedItems, setFeedItems] = useState([])
  const [toast, setToast]         = useState(null)
  const [showHTP, setShowHTP]     = useState(false)
  const [wIdx, setWIdx]           = useState(0)
  const [wAngle, setWAngle]       = useState(0)

  const tradersRef   = useRef(createTraders())
  const poolRef      = useRef(0)
  const volRef       = useRef(0)
  const priceRef     = useRef(.001)
  const price0Ref    = useRef(.001)
  const priceHistRef = useRef([])
  const ksFiredRef   = useRef(false)
  const prevLdrRef   = useRef(null)
  const modalOpenRef = useRef(false)
  const arenaCarryRef = useRef(0)
  const roundIdRef   = useRef(1)
  const timeLeftRef  = useRef(ROUND_S)
  const wAngleRef    = useRef(0)
  const wIdxRef      = useRef(0)
  const wTickRef     = useRef(0)
  const autoTimerRef = useRef(null)

  const wheelRef = useRef(null)
  const chartRef = useRef(null)

  // ── UI refs for feed ───────────────────────────────────────────
  const addFeed = useCallback((ico, html) => {
    const now = new Date()
    const ts  = String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0')
    setFeedItems(prev => [{ ico, html, ts, id: Date.now() + Math.random() }, ...prev].slice(0, 60))
  }, [])

  const showToast = useCallback((msg, dur=3000) => {
    setToast(msg)
    setTimeout(() => setToast(null), dur)
  }, [])

  // ── Burst particles ─────────────────────────────────────────────
  const burst = useCallback((x, y, col, n=18) => {
    const COLS = ['#0052FF','#00d4aa','#ffc940','#ff3355','#ff8800']
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div')
      p.className = 'particle'
      const ang = Math.random() * Math.PI * 2, spd = 45 + Math.random() * 90
      p.style.cssText = `left:${x}px;top:${y}px;background:${col||COLS[i%COLS.length]};--dx:${Math.cos(ang)*spd}px;--dy:${Math.sin(ang)*spd-50}px;--d:${.5+Math.random()*.7}s`
      document.body.appendChild(p)
      setTimeout(() => p.remove(), 1400)
    }
  }, [])

  // ── Settle ─────────────────────────────────────────────────────
  const settle = useCallback(() => {
    const trdrs = tradersRef.current
    const lb = getLeaderboard(trdrs)
    if (!lb.length) { startNext(); return }
    const p      = poolRef.current + arenaCarryRef.current
    const winner = lb[0]
    const wShare = p * .50, top10 = p * .20, carry = p * .05
    arenaCarryRef.current = carry
    poolRef.current = 0
    lb.slice(1,10).forEach((t,i) => { t.pend = (t.pend||0) + top10*(9-i)/45 })
    updStreak(winner, roundIdRef.current)
    lb.slice(1,10).forEach(t => updStreak(t, roundIdRef.current))
    trdrs.filter(t => !lb.slice(0,10).find(x=>x.n===t.n)).forEach(t => resetStreak(t))
    const ks = ksFiredRef.current ? wShare*.05 : 0
    setHistory(prev => [{ rnd:roundIdRef.current, p, ico:winner.ico, n:winner.n, ks, ft:lb.length }, ...prev])
    setSettled({ p, winner, wShare, ks, top10, carry, lb })
    burst(innerWidth/2, innerHeight*.35, '#0052FF', 22)
    setTimeout(() => burst(innerWidth/2, innerHeight*.35, '#ffc940', 14), 300)
    addFeed('🏁', `<span class="fg">ROUND #${roundIdRef.current} SETTLED</span> · <span class="fa">${winner.n}</span> · <span class="fu">${p.toFixed(4)}Ξ</span>`)
    // Auto-start countdown
    let ct = 8
    setAutoCount(ct)
    autoTimerRef.current = setInterval(() => {
      ct--; setAutoCount(ct)
      if (ct <= 0) { clearInterval(autoTimerRef.current); closeSettle() }
    }, 1000)
  }, [burst, addFeed])

  const closeSettle = useCallback(() => {
    clearInterval(autoTimerRef.current)
    setSettled(null)
    startNext()
  }, [])

  const startNext = useCallback(() => {
    const trdrs = tradersRef.current
    const newRnd = roundIdRef.current + 1
    roundIdRef.current = newRnd
    setRoundId(newRnd)
    timeLeftRef.current = ROUND_S
    poolRef.current = 0; volRef.current = 0
    ksFiredRef.current = false; prevLdrRef.current = null
    price0Ref.current = priceRef.current
    priceHistRef.current = []
    modalOpenRef.current = false
    setCrown(null); setKsWallet(null); setKsFired(false)
    trdrs.forEach(t => {
      t.pnl = 0; t.vol = 0
      priceRef.current = Math.max(.0001, Math.min(.08, priceRef.current * (.78 + Math.random() * .44)))
    })
    showToast('🔔 ROUND ' + newRnd + ' HAS BEGUN!')
  }, [showToast])

  // ── Main tick ──────────────────────────────────────────────────
  useEffect(() => {
    const trdrs = tradersRef.current
    trdrs.forEach(t => { const w = t.lo + Math.random() * t.hi; t.pos = w / priceRef.current; t.avgCost = priceRef.current })
    price0Ref.current = priceRef.current

    let lastT  = Date.now(), elapsed = 0
    const interval = setInterval(() => {
      if (modalOpenRef.current) return
      const now = Date.now(), dt = (now - lastT) / 1000
      lastT = now; elapsed += dt
      const ticks = Math.floor(elapsed); elapsed -= ticks

      for (let i = 0; i < Math.min(ticks, 40); i++) {
        // Price
        const drift = (Math.random() - .492) * .013
        priceRef.current = Math.max(.00008, priceRef.current * (1 + drift))
        priceHistRef.current.push(priceRef.current)
        if (priceHistRef.current.length > CHART_LEN) priceHistRef.current.shift()

        // Traders
        trdrs.forEach(t => {
          if (Math.random() > t.agg * .44) return
          const isBuy = Math.random() < t.bias
          const w = t.lo + Math.random() * (t.hi - t.lo)
          if (isBuy) {
            buy(t, w, priceRef.current)
          } else if (t.pos > 0) {
            const { feeContrib, volContrib } = sell(t, w, priceRef.current)
            poolRef.current += feeContrib
            volRef.current  += volContrib
          }
          if (Math.random() < .055) addFeed(t.ico, `<span class="fa">${t.n}</span> ${isBuy?'<span class="fu">BUY</span>':'<span class="fd">SELL</span>'} <span class="${isBuy?'fu':'fd'}">${w.toFixed(3)}Ξ</span>`)
        })

        // Crown
        const lb = getLeaderboard(trdrs)
        const nc = lb[0]?.n
        if (nc && nc !== crown) {
          setCrown(nc)
          addFeed('👑', `<span class="fb">CROWN</span> → <span class="fa">${nc}</span>`)
        }

        // Kill shot
        const remaining = timeLeftRef.current
        if (remaining / ROUND_S < .167 && !ksFiredRef.current) {
          const curr = lb[0]?.n
          if (prevLdrRef.current && curr && prevLdrRef.current !== curr) {
            ksFiredRef.current = true
            setKsWallet(curr); setKsFired(true)
            addFeed('⚡', `<span class="fk">KILL SHOT!</span> <span class="fa">${curr}</span> dethroned <span class="fa">${prevLdrRef.current}</span>`)
          }
          prevLdrRef.current = curr
        }

        // Wheel animation
        wAngleRef.current += .007
        wTickRef.current++
        if (wTickRef.current % 160 === 0 && lb.length > 1) {
          wIdxRef.current = (wIdxRef.current + 1) % Math.min(lb.length, 6)
          setWIdx(wIdxRef.current)
        }
        setWAngle(wAngleRef.current)
        drawWheel(wheelRef.current, lb, wAngleRef.current)
        drawChart(chartRef.current, priceHistRef.current)
      }

      // Timer
      timeLeftRef.current = Math.max(0, timeLeftRef.current - dt)
      setTimeLeft(timeLeftRef.current)
      setPool(poolRef.current + arenaCarryRef.current)
      setVol(volRef.current)
      setArenaCarry(arenaCarryRef.current)
      setPrice(priceRef.current)
      setPrice0(price0Ref.current)

      if (timeLeftRef.current <= 0 && !modalOpenRef.current) {
        modalOpenRef.current = true
        settle()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [settle, addFeed])

  // ── Derived display values ─────────────────────────────────────
  const trdrs   = tradersRef.current
  const lb      = getLeaderboard(trdrs)
  const tot     = pool
  const chgPct  = price0 > 0 ? ((price - price0) / price0 * 100) : 0
  const isUp    = chgPct >= 0
  const prevLdr = useRef(null)
  const m = Math.floor(timeLeft / 60), s = Math.floor(timeLeft % 60)
  const cdClass = timeLeft < 8 ? 'cd hot' : timeLeft < 20 ? 'cd warn' : 'cd'
  const inKW    = timeLeft / ROUND_S < .167
  const wheelEntry = lb[wIdx] || lb[0]

  // ── Update chart canvas size on mount ─────────────────────────
  useEffect(() => {
    if (chartRef.current) {
      const par = chartRef.current.parentElement
      chartRef.current.width  = par.offsetWidth
      chartRef.current.height = 190
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      <Starfield/>
      <div className="crt"/>
      {/* Flash layer */}
      <div id="flash-layer" className="flash"/>

      <div className="app">
        <ChainGuard/>

        {/* ── HEADER ── */}
        <header className="header">
          <div className="logo-row">
            <div className="base-ball">B</div>
            <div>
              <div className="logo"><em>FEE</em> WARS</div>
              <div className="logo-sub">THE ARENA · BUILT ON BASE</div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="chip live">LIVE SIM</div>
            <div className="chip">ROUND #{roundId}</div>
            <div className="chip" style={{ color:'var(--teal)', borderColor:'rgba(0,212,170,.3)' }}>
              Ξ{price.toFixed(5)}
            </div>
            <div className="chip" style={{ color:'var(--gold)', borderColor:'rgba(255,201,64,.3)' }}>
              👑 {crown ? crown.slice(0,10)+'…' : '—'}
            </div>
            <button className="hdr-btn howto" onClick={() => setShowHTP(true)}>? HOW TO PLAY</button>
            <button className="hdr-btn buy" onClick={() => window.open(UNISWAP_URL,'_blank')}>
              BUY TOKEN ↗
            </button>
            {/* ── RAINBOWKIT CONNECT BUTTON ── */}
            <ConnectButton
              label="CONNECT"
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </header>

        {/* ── STATS ── */}
        <div className="stats">
          <div className="sc ab">
            <div className="sc-lbl">Prize Pool</div>
            <div className="sc-val blue">Ξ{tot.toFixed(4)}</div>
            <div className="sc-sub">${(tot*WETH_USD).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
          </div>
          <div className="sc ag" id="cd-sc" style={{position:'relative'}}>
            <div className="sc-lbl">Round Timer</div>
            <span className={cdClass}>{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>
            <div className="sc-sub">ROUND #{roundId}</div>
            <div className={`kw-bar${inKW?' active':''}`}/>
          </div>
          <div className="sc at">
            <div className="sc-lbl">Token Price</div>
            <div className="sc-val teal">Ξ{price.toFixed(5)}</div>
            <div className="sc-sub" style={{color:isUp?'var(--teal)':'var(--red)'}}>
              {isUp?'+':''}{chgPct.toFixed(2)}%
            </div>
          </div>
          <div className="sc ar">
            <div className="sc-lbl">Volume</div>
            <div className="sc-val red">{vol.toFixed(2)} Ξ</div>
            <div className="sc-sub">this round</div>
          </div>
          <div className="sc aw">
            <div className="sc-lbl">Fighters</div>
            <div className="sc-val">{trdrs.filter(t=>t.vol>.001).length}</div>
            <div className="sc-sub">active</div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="main">
          <div>
            {/* Top row */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {/* Battle Wheel */}
              <div className="panel" style={{borderColor:'rgba(0,82,255,.4)'}}>
                <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}>
                  <span className="pt blue">◈ BATTLE WHEEL</span>
                  <span className="pm">LIVE LEADERS</span>
                </div>
                <div className="wheel-wrap">
                  <canvas ref={wheelRef} width={146} height={146} style={{flexShrink:0}}/>
                  {wheelEntry && (
                    <div className="wi">
                      <div className="wi-rank">{wIdx===0?'RANK #1 · 👑 CROWN':`RANK #${wIdx+1}`}</div>
                      <div className="wi-name">{wheelEntry.n}</div>
                      <div className={`wi-pnl${wheelEntry.pnl<0?' neg':''}`}>
                        {wheelEntry.pnl>=0?'+':''}{wheelEntry.pnl.toFixed(4)} Ξ
                      </div>
                      <div className="wi-vol">VOL: {wheelEntry.vol.toFixed(3)} Ξ</div>
                      <div className={`wi-cls ${wheelEntry.cls}`}>{wheelEntry.cls.toUpperCase()}</div>
                    </div>
                  )}
                </div>
              </div>
              {/* Price chart */}
              <div className="panel">
                <div className="ph">
                  <span className="pt teal">◈ TOKEN PRICE</span>
                  <span className="pm">LIVE CHART</span>
                </div>
                <div className="chart-wrap">
                  <canvas ref={chartRef} className="chart-canvas"/>
                  <div className="chart-ov">
                    <span className="cp">Ξ{price.toFixed(5)}</span>
                    <span className={`cc ${isUp?'up':'dn'}`}>{isUp?'▲ +':'▼ '}{Math.abs(chgPct).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="panel" style={{marginBottom:12,borderColor:'rgba(0,82,255,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}>
                <span className="pt blue">◈ FIGHTER RANKINGS</span>
                <span className="pm">REALIZED PNL · {lb.length} FIGHTERS</span>
              </div>
              <table className="lb">
                <thead><tr>
                  <th className="lb-th">#</th>
                  <th className="lb-th" colSpan={2}>FIGHTER</th>
                  <th className="lb-th">VOLUME</th>
                  <th className="lb-th" style={{textAlign:'right'}}>REALIZED PNL</th>
                </tr></thead>
                <tbody>
                  {lb.slice(0,12).map((t, i) => {
                    const rank = i+1
                    const rkC = rank===1?'r1':rank===2?'r2':rank===3?'r3':''
                    const maxA = Math.max(...lb.map(x=>Math.abs(x.pnl)), .001)
                    const bp   = Math.min(100, Math.abs(t.pnl)/maxA*100)
                    const sign = t.pnl >= 0 ? '+' : ''
                    return (
                      <tr key={t.n} className={`fr ${ksWallet===t.n?'fl-k':''}`}>
                        <td><span className={`rk ${rkC}`}>{rank}</span></td>
                        <td style={{width:42,paddingRight:0}}>
                          <div className={`spr${rank===1?' leader':''}`} style={{animationDelay:t.d}}>{t.ico}</div>
                        </td>
                        <td>
                          <div className="fn">
                            {t.n}
                            {t.streak>=2 && <span className="stk">🔥{t.streak}×</span>}
                          </div>
                          <span className={`fc ${t.cls}`}>{t.cls.toUpperCase()}</span>
                          <div className="hp"><div className={`hpf ${t.pnl>=0?'p':'n'}`} style={{width:`${bp}%`}}/></div>
                        </td>
                        <td className="vc">{t.vol.toFixed(3)} Ξ</td>
                        <td className={`pcc ${t.pnl>=0?'pos':'neg'}`}>{sign}{t.pnl.toFixed(4)} Ξ</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* History */}
            <div className="panel">
              <div className="ph">
                <span className="pt gray">◈ BATTLE HISTORY</span>
                <span className="pm">SETTLED ROUNDS</span>
              </div>
              {history.length === 0 ? (
                <div style={{padding:'16px',fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)'}}>FIRST ROUND IN PROGRESS...</div>
              ) : (
                history.slice(0,8).map((h, i) => (
                  <div key={i} className="hist-row">
                    <div>
                      <div className="hr-rnd">ROUND #{h.rnd} · {h.ft} FIGHTERS{h.ks>0?' · ⚡':''}</div>
                      <div className="hr-win">{h.ico} {h.n}</div>
                    </div>
                    <div className="hr-pool">{h.p.toFixed(3)} Ξ</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── SIDEBAR ── */}
          <div className="sidebar">

            {/* My Position */}
            <div className="panel" style={{borderColor:'rgba(0,212,170,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,212,170,.2)'}}>
                <span className="pt teal">◈ MY POSITION</span>
                <span className="pm">WALLET</span>
              </div>
              <MyPosition traders={trdrs} roundId={roundId}/>
            </div>

            {/* Prize split */}
            <div className="panel" style={{borderColor:'rgba(255,201,64,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(255,201,64,.15)'}}>
                <span className="pt gold">◈ PRIZE SPLIT</span>
                <span className="pm">RND #{roundId}</span>
              </div>
              {[
                ['🏆 Winner (50%)','25% instant · 75% vested','pb-pct g',(tot*.50)],
                ['🥈 Top 2–10 (20%)','rank-weighted','pb-pct p',(tot*.20)],
                ['📈 Vol Rebate (10%)','streak multiplier','pb-pct t',(tot*.10)],
                ['🏛 Arena Carry (5%)','rolls to next round','pb-pct a',(tot*.05)],
              ].map(([lbl,note,cls,val]) => (
                <div key={lbl} className="pb-row">
                  <div>
                    <div className="pb-lbl">{lbl}</div>
                    <div className="pb-note">{note}</div>
                  </div>
                  <div className="pb-r">
                    <div className={cls}>{lbl.match(/\d+%/)?.[0]}</div>
                    <div className="pb-eth">{val.toFixed(4)} Ξ</div>
                  </div>
                </div>
              ))}
              <div className="pb-bar">
                <div className="pb-seg" style={{width:'50%',background:'var(--gold)'}}/>
                <div className="pb-seg" style={{width:'20%',background:'var(--base)'}}/>
                <div className="pb-seg" style={{width:'10%',background:'var(--teal)'}}/>
                <div className="pb-seg" style={{width:'5%', background:'var(--amber)'}}/>
                <div className="pb-seg" style={{width:'15%',background:'var(--gray2)'}}/>
              </div>
            </div>

            {/* Feed */}
            <div className="panel">
              <div className="ph">
                <span className="pt blue">◈ BATTLE LOG</span>
                <span className="pm">LIVE</span>
              </div>
              <div className="feed">
                {feedItems.map(f => (
                  <div key={f.id} className="fi">
                    <span className="fi-t">{f.ts}</span>
                    <span className="fi-i">{f.ico}</span>
                    <span className="fi-b" dangerouslySetInnerHTML={{__html:f.html}}/>
                  </div>
                ))}
              </div>
            </div>

            {/* Network info */}
            <div className="panel" style={{borderColor:'rgba(0,82,255,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}>
                <span className="pt blue">◈ BASE NETWORK</span>
                <span className="pm">STATS</span>
              </div>
              {[
                ['NETWORK',     <span style={{color:'var(--base)'}}>Base Mainnet</span>],
                ['CHAIN ID',    '8453'],
                ['SWAP FEE',    <span style={{color:'var(--teal)'}}>1.2%</span>],
                ['CREATOR CUT', <span style={{color:'var(--teal)'}}>57% → Pool</span>],
                ['ARENA CARRY', <span style={{color:'var(--gold)'}}>{arenaCarry.toFixed(4)} Ξ</span>],
                ['CONTRACT',    <span style={{color:'var(--base)',fontSize:9,cursor:'pointer'}} onClick={()=>{if(ARENA_ADDRESS)navigator.clipboard?.writeText(ARENA_ADDRESS);showToast('📋 Copied!')}}>
                  {ARENA_ADDRESS ? ARENA_ADDRESS.slice(0,8)+'...'+ARENA_ADDRESS.slice(-6) : 'DEPLOYING SOON'}
                </span>],
              ].map(([k,v]) => (
                <div key={k} className="info-row"><span>{k}</span><span>{v}</span></div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* ── KILL SHOT BANNER ── */}
      <div className={`ks-banner${ksWallet?' show':''}`}>
        <span className="ks-h">⚡ KILL SHOT</span>
        <span className="ks-b">
          <span style={{color:'#e8f4ff'}}>{ksWallet}</span> FIRED THE KILL SHOT
        </span>
      </div>

      {/* ── SETTLEMENT MODAL (auto-closes) ── */}
      {settled && (
        <div className="overlay show">
          <div className="settle-box">
            <div className="m-top">
              <span className="m-title">⚔ ROUND COMPLETE</span>
              <div className="m-sub">ROUND #{roundId-1} · {settled.lb.length} FIGHTERS</div>
            </div>
            <div className="m-winner">
              <span className="m-ico">{settled.winner.ico}</span>
              <div className="m-name">{settled.winner.n}</div>
            </div>
            <div className="m-rows">
              <div className="m-row"><span className="m-l">Prize Pool</span><span className="mv-g">{settled.p.toFixed(4)} Ξ (${(settled.p*WETH_USD).toLocaleString('en-US',{maximumFractionDigits:0})})</span></div>
              <div className="m-row"><span className="m-l">Winner Instant (25%)</span><span className="mv-t">{(settled.wShare*.25-settled.ks).toFixed(4)} Ξ</span></div>
              <div className="m-row"><span className="m-l">Winner Vested (75%)</span><span className="mv-a">{(settled.wShare*.75).toFixed(4)} Ξ — 4 round vest</span></div>
              <div className="m-row"><span className="m-l">Kill Shot Bonus</span><span className="mv-r">{settled.ks>0?`+${settled.ks.toFixed(4)} Ξ`:'NONE'}</span></div>
              <div className="m-row"><span className="m-l">Top 2–10 Split</span><span className="mv-b">{settled.top10.toFixed(4)} Ξ</span></div>
              <div className="m-row"><span className="m-l">Arena Carry</span><span className="mv-a">{settled.carry.toFixed(4)} Ξ</span></div>
            </div>
            <div className="m-auto">
              <span>NEXT ROUND IN <strong>{autoCount}s</strong></span>
              <div className="m-prog">
                <div className="m-prog-fill" style={{width:`${(autoCount/8)*100}%`,transition:'width 1s linear'}}/>
              </div>
              <button onClick={closeSettle} style={{fontFamily:'var(--mono)',fontSize:9,background:'none',border:'1px solid var(--border2)',color:'var(--gray)',padding:'4px 8px',cursor:'pointer'}}>SKIP</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HOW TO PLAY ── */}
      {showHTP && <HowToPlay onClose={() => setShowHTP(false)}/>}

      {/* ── TOAST ── */}
      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
