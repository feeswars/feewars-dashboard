// FeeWars Arena — Simulation Engine
// All game logic separated from React so it stays fast

export const WETH_USD  = 3200
export const ROUND_S   = 60
export const FEE_RATE  = 0.0068
export const CHART_LEN = 120

export const FIGHTERS = [
  { n:'0xWhale_7f3a', cls:'whale',   ico:'🐋', d:'0s',    agg:.28, lo:2,   hi:12,  bias:.62 },
  { n:'0xScalp_2e9c', cls:'scalper', ico:'⚡', d:'.18s',  agg:.93, lo:.04, hi:.35, bias:.51 },
  { n:'0xSnipe_8b1d', cls:'sniper',  ico:'🎯', d:'.36s',  agg:.22, lo:.7,  hi:3,   bias:.56 },
  { n:'0xDegen_4a7f', cls:'degen',   ico:'🔥', d:'.54s',  agg:.72, lo:.2,  hi:1.4, bias:.46 },
  { n:'0xHodl_1c6e',  cls:'hodler',  ico:'🛡', d:'.72s',  agg:.09, lo:1,   hi:4.5, bias:.78 },
  { n:'0xArb_9d2b',   cls:'scalper', ico:'⚡', d:'.90s',  agg:.88, lo:.08, hi:.7,  bias:.50 },
  { n:'0xAlpha_5e8a', cls:'sniper',  ico:'🎯', d:'1.08s', agg:.24, lo:.5,  hi:2.2, bias:.59 },
  { n:'0xPump_3c7d',  cls:'degen',   ico:'🔥', d:'1.26s', agg:.66, lo:.25, hi:1.8, bias:.44 },
  { n:'0xSmart_6f1b', cls:'whale',   ico:'🐋', d:'1.44s', agg:.32, lo:1.4, hi:7,   bias:.64 },
  { n:'0xBot_0a4c',   cls:'scalper', ico:'🤖', d:'1.62s', agg:.97, lo:.02, hi:.25, bias:.50 },
  { n:'0xRetail_b8',  cls:'degen',   ico:'🔥', d:'1.80s', agg:.52, lo:.1,  hi:.9,  bias:.49 },
  { n:'0xFund_7d3f',  cls:'whale',   ico:'🐳', d:'1.98s', agg:.18, lo:3,   hi:14,  bias:.67 },
]

export function createTraders() {
  return FIGHTERS.map(f => ({
    ...f, pos: 0, avgCost: 0, pnl: 0, vol: 0,
    streak: 0, _ls: 0, prevRank: 99, pend: 0,
  }))
}

export function updStreak(t, r) {
  if (t.streak === 0)        { t.streak = 1 }
  else if (t._ls === r - 1)  { t.streak++ }
  else                        { t.streak = 1 }
  t._ls = r
}
export function resetStreak(t) { t.streak = 0 }

export function buy(t, weth, price) {
  const tok = weth / price
  const pv  = t.pos * t.avgCost
  t.pos += tok
  t.avgCost = t.pos > 0 ? (pv + weth) / t.pos : 0
  t.vol += weth
}

export function sell(t, weth, price) {
  if (!t.pos) return { feeContrib: 0, volContrib: 0 }
  const tok = Math.min(weth / price, t.pos * (.25 + Math.random() * .6))
  const out = tok * price
  t.pnl += out - tok * t.avgCost
  t.pos  = Math.max(0, t.pos - tok)
  if (t.pos < 1e-8) { t.pos = 0; t.avgCost = 0 }
  t.vol += out
  return { feeContrib: out * FEE_RATE, volContrib: out }
}

export function getLeaderboard(traders) {
  return [...traders]
    .filter(t => t.vol > .0001 || Math.abs(t.pnl) > .0001)
    .sort((a, b) => b.pnl - a.pnl)
}

// Draw the battle wheel on a canvas element
const WHEEL_COLS = ['#0052FF','#00d4aa','#ffc940','#ff3355','#ff8800','#aa44ff','#00aaff','#ff44aa']

// Cached logo image for wheel hub
let _logoImg = null
function getLogoImg() {
  if (typeof window === 'undefined') return null
  if (_logoImg) return _logoImg
  try {
    _logoImg = new window.Image()
    _logoImg.crossOrigin = 'anonymous'
    _logoImg.src = 'https://i.imgur.com/Lz4mwY0.jpeg'
  } catch(e) { return null }
  return _logoImg
}

export function drawWheel(canvas, lb, angle) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W=canvas.width, H=canvas.height
  const CX=W/2, CY=H/2
  const R=Math.min(W,H)/2 - 18
  const HUB = R * 0.34
  ctx.clearRect(0, 0, W, H)

  const n = Math.min(lb.length, 10)

  // Outer glow ring
  const glow = ctx.createRadialGradient(CX,CY,R-4,CX,CY,R+14)
  glow.addColorStop(0,'rgba(0,82,255,.35)')
  glow.addColorStop(.5,'rgba(0,82,255,.12)')
  glow.addColorStop(1,'rgba(0,82,255,0)')
  ctx.beginPath(); ctx.arc(CX,CY,R+10,0,Math.PI*2)
  ctx.fillStyle=glow; ctx.fill()

  if (n === 0) {
    // Empty state — show pulsing logo
    drawHub(ctx, CX, CY, HUB * 1.6, angle)
    // Spinning dashed ring
    ctx.save()
    ctx.setLineDash([8,6])
    ctx.lineDashOffset = -angle * 30
    ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2)
    ctx.strokeStyle='rgba(0,82,255,.3)'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.restore()
    return
  }

  const arc = (Math.PI*2) / n
  // Draw segments
  for (let i=0; i<n; i++) {
    const s = angle + i*arc - Math.PI/2
    const e = s + arc - 0.03
    const col = WHEEL_COLS[i % WHEEL_COLS.length]
    const isLeader = i===0

    // Segment fill
    ctx.beginPath(); ctx.moveTo(CX,CY); ctx.arc(CX,CY,R,s,e); ctx.closePath()
    if (isLeader) {
      const sg = ctx.createRadialGradient(CX,CY,0,CX,CY,R)
      sg.addColorStop(0, col+'55')
      sg.addColorStop(1, col+'22')
      ctx.fillStyle=sg
    } else {
      ctx.fillStyle = col+'18'
    }
    ctx.fill()

    // Segment border
    ctx.beginPath(); ctx.moveTo(CX,CY); ctx.arc(CX,CY,R,s,e); ctx.closePath()
    ctx.strokeStyle = isLeader ? col+'cc' : col+'33'
    ctx.lineWidth = isLeader ? 1.5 : 0.8
    ctx.stroke()

    // Emoji icon on segment
    const mid = s + arc/2
    const ir = R * 0.68
    ctx.save()
    ctx.font = `${Math.max(11, R*0.18)}px serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    if (isLeader) { ctx.shadowColor=col; ctx.shadowBlur=8 }
    ctx.fillText(lb[i].ico||'⚡', CX+ir*Math.cos(mid), CY+ir*Math.sin(mid))
    ctx.restore()

    // Short name on segment for larger wheels
    if (R > 80 && lb[i].n) {
      const nr = R * 0.42
      ctx.save()
      ctx.font = `${Math.max(6,R*0.085)}px monospace`
      ctx.fillStyle = isLeader ? '#fff' : 'rgba(255,255,255,.4)'
      ctx.textAlign='center'; ctx.textBaseline='middle'
      ctx.fillText(lb[i].n.slice(0,6), CX+nr*Math.cos(mid), CY+nr*Math.sin(mid))
      ctx.restore()
    }
  }

  // Outer rim
  ctx.beginPath(); ctx.arc(CX,CY,R+1,0,Math.PI*2)
  ctx.strokeStyle='rgba(0,82,255,.6)'; ctx.lineWidth=2; ctx.stroke()

  // Spinning tick marks on rim
  ctx.save()
  ctx.setLineDash([2,8])
  ctx.lineDashOffset = -angle*20
  ctx.beginPath(); ctx.arc(CX,CY,R+7,0,Math.PI*2)
  ctx.strokeStyle='rgba(0,82,255,.2)'; ctx.lineWidth=3; ctx.stroke()
  ctx.restore()

  // Draw hub with logo
  drawHub(ctx, CX, CY, HUB, angle)

  // Crown indicator for leader
  if (n > 0) {
    const leaderAngle = angle - Math.PI/2
    const px = CX + (R+14) * Math.cos(leaderAngle)
    const py = CY + (R+14) * Math.sin(leaderAngle)
    ctx.font='14px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText('👑', px, py)
  }
}

function drawHub(ctx, CX, CY, HUB, angle) {
  // Hub background
  ctx.beginPath(); ctx.arc(CX,CY,HUB+3,0,Math.PI*2)
  const hbg = ctx.createRadialGradient(CX,CY,0,CX,CY,HUB+3)
  hbg.addColorStop(0,'#0e1d33')
  hbg.addColorStop(1,'#060d1a')
  ctx.fillStyle=hbg; ctx.fill()

  // Logo image clipped to circle
  const img = getLogoImg()
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save()
    ctx.beginPath(); ctx.arc(CX,CY,HUB-1,0,Math.PI*2); ctx.clip()
    ctx.drawImage(img, CX-HUB+1, CY-HUB+1, (HUB-1)*2, (HUB-1)*2)
    ctx.restore()
    // Logo overlay glow
    ctx.beginPath(); ctx.arc(CX,CY,HUB-1,0,Math.PI*2)
    const lg = ctx.createRadialGradient(CX,CY,HUB*.4,CX,CY,HUB)
    lg.addColorStop(0,'rgba(0,0,0,0)')
    lg.addColorStop(1,'rgba(0,82,255,.3)')
    ctx.fillStyle=lg; ctx.fill()
  } else {
    // Fallback: text hub
    ctx.beginPath(); ctx.arc(CX,CY,HUB-1,0,Math.PI*2)
    ctx.fillStyle='#0a1525'; ctx.fill()
    ctx.font=`${HUB*.7}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText('⚔', CX, CY)
  }

  // Hub ring
  ctx.beginPath(); ctx.arc(CX,CY,HUB,0,Math.PI*2)
  ctx.strokeStyle='#0052FF'; ctx.lineWidth=2
  ctx.shadowColor='#0052FF'; ctx.shadowBlur=10
  ctx.stroke(); ctx.shadowBlur=0

  // Spinning inner ring
  ctx.save()
  ctx.setLineDash([4,4])
  ctx.lineDashOffset = angle*15
  ctx.beginPath(); ctx.arc(CX,CY,HUB+5,0,Math.PI*2)
  ctx.strokeStyle='rgba(0,82,255,.35)'; ctx.lineWidth=1; ctx.stroke()
  ctx.restore()
}

// Draw price chart on a canvas
export function drawChart(canvas, priceHist) {
  if (!canvas || priceHist.length < 2) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const pad = { t:32, b:18, l:6, r:6 }
  const W2 = W - pad.l - pad.r, H2 = H - pad.t - pad.b
  ctx.clearRect(0, 0, W, H)
  const mn  = Math.min(...priceHist) * .998
  const mx  = Math.max(...priceHist) * 1.002
  const rng = mx - mn || 1
  const xf  = i => pad.l + (i / (priceHist.length - 1)) * W2
  const yf  = v => pad.t + H2 - ((v - mn) / rng) * H2
  const isUp = priceHist[priceHist.length - 1] >= priceHist[0]
  const lc   = isUp ? '#00d4aa' : '#ff3355'
  // Grid
  ctx.strokeStyle = 'rgba(0,82,255,.07)'; ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const y = pad.t + (i/3) * H2
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W2, y); ctx.stroke()
  }
  // Fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + H2)
  grad.addColorStop(0, isUp ? 'rgba(0,212,170,.16)' : 'rgba(255,51,85,.1)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath(); ctx.moveTo(xf(0), yf(priceHist[0]))
  priceHist.forEach((v, i) => { if (i > 0) ctx.lineTo(xf(i), yf(v)) })
  ctx.lineTo(xf(priceHist.length-1), pad.t+H2); ctx.lineTo(xf(0), pad.t+H2); ctx.closePath()
  ctx.fillStyle = grad; ctx.fill()
  // Line
  ctx.beginPath(); ctx.moveTo(xf(0), yf(priceHist[0]))
  priceHist.forEach((v, i) => { if (i > 0) ctx.lineTo(xf(i), yf(v)) })
  ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.stroke()
  // Dot
  const lx = xf(priceHist.length-1), ly = yf(priceHist[priceHist.length-1])
  ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI*2); ctx.fillStyle = lc; ctx.fill()
  ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI*2); ctx.fillStyle = lc+'22'; ctx.fill()
}
