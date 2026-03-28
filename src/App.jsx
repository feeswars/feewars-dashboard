import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContracts, useBalance } from 'wagmi'
import { base } from 'wagmi/chains'
import { formatEther } from 'viem'
import {
  WETH_USD, CHART_LEN,
  createTraders, buy, sell,
  getLeaderboard, drawWheel, drawChart,
} from './sim'

const ARENA_ADDRESS  = import.meta.env.VITE_ARENA_ADDRESS
const TOKEN_ADDRESS  = import.meta.env.VITE_TOKEN_ADDRESS
const ORACLE_API_URL = import.meta.env.VITE_ORACLE_API_URL || ''
const BANKR_URL      = 'https://bankr.bot/launches/0xa31fbab1c431225a444afbd8acd0aa8cd0d2eba3'
const BANKR_SWAP_URL = 'https://swap.bankr.bot/?inputToken=ETH&outputToken=0xa31fbab1c431225a444afbd8acd0aa8cd0d2eba3'
const X_URL          = 'https://x.com/feewars'
const UNISWAP_URL    = BANKR_SWAP_URL
const WETH_BASE      = '0x4200000000000000000000000000000000000006'
const ROUND_DURATION = 3600
const DEXSCREENER_PAIR = '0x26494e2be99bde2f02800b71e87bf4623b0df94dd3041d0b09799501bc81b945'
const DEXSCREENER_URL  = `https://dexscreener.com/base/${DEXSCREENER_PAIR}`

const ARENA_ABI = [
  {inputs:[],name:'currentRoundId',  outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
  {inputs:[],name:'roundStartTime',  outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
  {inputs:[],name:'arenaCarry',      outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
  {inputs:[],name:'feeCrownHolder',  outputs:[{type:'address'}],stateMutability:'view',type:'function'},
  {inputs:[],name:'feesTokenPool',   outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
  // v5: claimable returns (wethAmount, feesAmount) tuple
  {inputs:[{type:'address'}],name:'claimable',outputs:[{type:'uint256',name:'wethAmount'},{type:'uint256',name:'feesAmount'}],stateMutability:'view',type:'function'},
  {inputs:[{type:'address'}],name:'pendingFeesTokenClaims',outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
  {inputs:[],name:'claim',           outputs:[],stateMutability:'nonpayable',type:'function'},
  {inputs:[],name:'claimFeesToken',  outputs:[],stateMutability:'nonpayable',type:'function'},
]
const ERC20_ABI = [
  {inputs:[{type:'address'}],name:'balanceOf',outputs:[{type:'uint256'}],stateMutability:'view',type:'function'},
]

const fmt4     = v => parseFloat(v||0).toFixed(4)
const fmt2     = v => parseFloat(v||0).toFixed(2)
const weiToEth = v => { try { return parseFloat(formatEther(BigInt(v||'0'))) } catch { return 0 } }
const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : '—'

function Starfield() {
  const ref = useRef(null)
  useEffect(()=>{
    const cv=ref.current,ctx=cv.getContext('2d')
    let W,H,stars=[],sy=0,raf
    const resize=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;stars=Array.from({length:100},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()<.2?1.5:.7,a:Math.random(),da:(.003+Math.random()*.008)*(Math.random()<.5?1:-1),c:Math.random()<.18?'#0052FF':Math.random()<.1?'#00d4aa':'#b0c8e8'}))}
    const draw=()=>{ctx.clearRect(0,0,W,H);stars.forEach(s=>{s.a=Math.max(0,Math.min(1,s.a+s.da));if(s.a<=0||s.a>=1)s.da*=-1;ctx.globalAlpha=s.a*.6;ctx.fillStyle=s.c;ctx.fillRect(s.x,s.y,s.r,s.r)});ctx.globalAlpha=.025;ctx.fillStyle='#0052FF';ctx.fillRect(0,sy,W,2);sy=(sy+.5)%H;ctx.globalAlpha=1;raf=requestAnimationFrame(draw)}
    resize();draw();window.addEventListener('resize',resize)
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])
  return <canvas ref={ref} style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'}}/>
}

function MyPosition({oracleData,usdPrice=0}) {
  const {address,isConnected} = useAccount()
  const {data:wethBal} = useBalance({address,token:WETH_BASE,chainId:base.id,enabled:!!address,watch:true})
  const {data:feesTokenBal} = useBalance({address,token:TOKEN_ADDRESS,chainId:base.id,enabled:!!address,watch:true})
  const {data:claimData} = useReadContracts({
    contracts:[
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'claimable',args:[address],chainId:base.id},
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'pendingFeesTokenClaims',args:[address],chainId:base.id},
    ],
    enabled:!!address&&!!ARENA_ADDRESS,
  })
  // v5: claimable() returns [wethAmount, feesAmount] tuple
  const claimResult = claimData?.[0]?.result
  const claimEth = claimResult ? parseFloat(formatEther(Array.isArray(claimResult) ? claimResult[0] : claimResult)) : 0
  const claimFeesAmt = claimData?.[1]?.result ? parseFloat(formatEther(claimData[1].result)) : 0
  const myEntry = oracleData?.leaderboard?.find(e=>e.wallet?.toLowerCase()===address?.toLowerCase())
  const pnlEth  = myEntry ? weiToEth(myEntry.realized) : 0
  const volEth  = myEntry ? weiToEth(myEntry.volume)   : 0

  if (!isConnected) return (
    <div className="pos-connect-prompt">
      <div className="ico">🔗</div>
      <p>Connect your wallet to see your PNL, claimable rewards and vesting</p>
      <ConnectButton.Custom>{({openConnectModal})=>(
        <button className="claim-btn" onClick={openConnectModal}>CONNECT WALLET</button>
      )}</ConnectButton.Custom>
    </div>
  )
  return (
    <div className="pos-inner">
      <div className="pos-lbl">WALLET</div>
      <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--base)',marginBottom:8}}>{shortAddr(address)}</div>
      {wethBal&&<><div className="pos-lbl">WETH BALANCE</div><div className="pos-val">{parseFloat(wethBal.formatted).toFixed(4)} Ξ</div></>}
      <div className="pos-lbl" style={{marginTop:10}}>MY PNL THIS ROUND</div>
      <div className={`pos-val ${pnlEth>=0?'pos':'neg'}`}>{pnlEth>=0?'+':''}{fmt4(pnlEth)} Ξ</div>
      <div className="pos-lbl">MY VOLUME</div>
      <div className="pos-val">{fmt4(volEth)} Ξ</div>
      {feesTokenBal&&parseFloat(feesTokenBal.formatted)>0&&<>
        <div className="pos-lbl" style={{marginTop:8}}>$FEES HOLDINGS</div>
        <div className="pos-val" style={{color:'var(--gold)',fontSize:'clamp(10px,1.5vw,13px)'}}>
          {parseFloat(feesTokenBal.formatted).toLocaleString('en-US',{maximumFractionDigits:0})} FEES
        </div>
        {usdPrice>0&&<div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)',marginTop:2}}>
          ≈ ${(parseFloat(feesTokenBal.formatted)*usdPrice).toFixed(4)} USD
        </div>}
      </>}

      <div className="pos-lbl">INSTANT CLAIMABLE</div>
      <div className="pos-val pos">{fmt4(claimEth)} Ξ</div>
      <button className="claim-btn" disabled={claimEth===0}
        onClick={()=>alert('Connect wallet and call claim() on the Arena contract')}>
        CLAIM WETH {claimEth>0?`(${fmt4(claimEth)} Ξ)`:''}
      </button>
      {claimFeesAmt>0&&<button className="claim-btn" style={{marginTop:6,background:'rgba(255,201,64,.15)',border:'1px solid rgba(255,201,64,.4)',color:'var(--gold)'}}
        onClick={()=>alert('Connect wallet and call claimFeesToken() on the Arena contract')}>
        CLAIM $FEES ({claimFeesAmt.toLocaleString('en-US',{maximumFractionDigits:0})} FEES)
      </button>}
      {myEntry?.rank&&<><div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--border)'}}><div className="pos-lbl">CURRENT RANK</div><div className="pos-val">#{myEntry.rank}</div></div></>}
    </div>
  )
}

function HowToPlay({onClose}) {
  const [tab,setTab]=useState(0)
  const [openFaq,setOpenFaq]=useState(null)
  const TABS=['OVERVIEW','PRIZES','VESTING','KILL SHOT','STREAKS','FAQ']
  return (
    <div className="overlay show" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="htp-box">
        <div className="htp-hdr"><span className="htp-title">? HOW TO PLAY FEE WARS</span><button className="htp-close" onClick={onClose}>✕ CLOSE</button></div>
        <div className="htp-tabs">{TABS.map((t,i)=><div key={i} className={`htp-tab${tab===i?' on':''}`} onClick={()=>setTab(i)}>{t}</div>)}</div>
        <div className="htp-body">
          {tab===0&&<><div className="htp-sec"><div className="htp-h">WHAT IS FEE WARS?</div><div className="htp-p">FeeWars is a <strong>live hourly trading competition</strong> on Base. Every swap of $FEEWARS on Uniswap sends fees into the hourly prize pool. The wallet with the <strong>highest realized profit</strong> wins 50% each hour.</div><div className="htp-p">No entry fee. No sign-up. Just trade and compete.</div></div>
          <div className="htp-sec"><div className="htp-h">HOW A ROUND WORKS</div>{[['🔔','ROUND STARTS','A new 60-minute round begins automatically after each settlement.'],['📈','TRADE TO COMPETE','Buy $FEEWARS then sell for profit. You must sell to score — unrealized gains count for nothing.'],['⚡','FINAL 10 MINUTES','Kill Shot window opens. Dethroning the leader earns a bonus.'],['🏆','SETTLEMENT','Prizes distribute automatically on-chain every hour.']].map(([ico,title,desc])=><div key={title} className="step-row"><div className="step-ico">{ico}</div><div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div></div>)}</div>
          <div className="htp-sec"><div className="htp-h">REALIZED PNL EXAMPLE</div><div className="htp-card"><div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--gray)',lineHeight:2}}>Buy 10,000 tokens @ Ξ0.001 = cost <span style={{color:'var(--red)'}}>10 WETH</span><br/>Sell 10,000 tokens @ Ξ0.0015 = receive <span style={{color:'var(--teal)'}}>15 WETH</span><br/>Realized PNL = <strong style={{color:'var(--teal)'}}>+5 WETH ✓ scored</strong></div></div></div></>}
          {tab===1&&<><div className="htp-sec"><div className="htp-h">PRIZE SPLIT</div><div className="split-bar">{[['50%','var(--gold)'],['20%','var(--base)'],['10%','var(--teal)'],['5%','var(--amber)'],['15%','var(--gray2)']].map(([w,c])=><div key={w} style={{width:w,background:c,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--px)',fontSize:7,color:'#000'}}>{w}</div>)}</div></div>
          <div className="htp-sec">{[['🥇','WINNER (50%)','Highest PNL wallet. 25% instant, 75% vested over 4 rounds.'],['🥈','TOP 2–10 (20%)','Rank 2–10 share proportionally. Paid instantly.'],['📊','VOLUME REBATE (10%)','Every active trader earns a share by volume.'],['🏛','ARENA CARRY (5%)','Rolls into the next round — pools grow over time.']].map(([ico,title,desc])=><div key={title} className="step-row"><div className="step-ico">{ico}</div><div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div></div>)}</div></>}
          {tab===2&&<div className="htp-sec"><div className="htp-h">4-ROUND UNLOCK SCHEDULE</div><div className="vest-grid">{[{label:'ROUND WIN',val:'0.25 Ξ',note:'INSTANT',now:true},{label:'+1 ROUND',val:'+0.1875 Ξ',note:'unlocks'},{label:'+2 ROUNDS',val:'+0.1875 Ξ',note:'unlocks'},{label:'+3 ROUNDS',val:'+0.1875 Ξ',note:'+remainder'}].map((b,i)=><div key={i} className={`vb${b.now?' now':''}`}><div className="vb-lbl">{b.label}</div><div className={`vb-pct${b.now?' teal':''}`}>{b.val}</div><div className="vb-note">{b.note}</div></div>)}</div><div className="htp-p">You don't lose it — it just unlocks gradually over 4 rounds.</div></div>}
          {tab===3&&<div className="htp-sec"><div className="htp-h">THE KILL SHOT WINDOW</div><div className="htp-p">In the <strong>final 10 minutes</strong>, if the #1 leader changes, the new leader fired a Kill Shot earning a <strong>5% bonus</strong> from the dethroned wallet's prize.</div><div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)',margin:'12px 0 6px'}}><span>ROUND START</span><span>KILL SHOT → END</span></div><div className="ks-tl"><div className="ks-normal"/><div className="ks-window"/></div></div>}
          {tab===4&&<div className="htp-sec"><div className="htp-h">STREAK MULTIPLIERS</div><div className="htp-card">{[['1 round','1.00×'],['2 consecutive','1.25×'],['3 consecutive','1.50×'],['4+ consecutive','2.00× MAX']].map(([r,m])=><div key={r} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontFamily:'var(--mono)',fontSize:11,borderBottom:'1px solid var(--border)'}}><span style={{color:'var(--gray)'}}>{r}</span><span style={{color:m.includes('MAX')?'var(--gold)':'var(--amber)'}}>{m}</span></div>)}</div></div>}
          {tab===5&&<div className="htp-sec"><div className="htp-h">FAQ</div>{[['Do I need to sign up?','No. Just trade $FEEWARS on Uniswap. The contract tracks every wallet automatically.'],['What network?','Base mainnet (Chain ID: 8453).'],['How do I claim?','Connect wallet. My Position panel shows claimable amounts.'],['Is it fair?','On-chain oracle verification. PNL tracked via Transfer events.'],['Can I lose money?','Yes — this is real trading. DYOR.'],['Where do fees come from?','1.2% on every Uniswap swap. 57% routes to the Arena as WETH.']].map(([q,a],i)=><div key={i} className={`faq-item${openFaq===i?' open':''}`} onClick={()=>setOpenFaq(openFaq===i?null:i)}><div className="faq-q">{q}<span className="faq-arr">▶</span></div><div className="faq-a">{a}</div></div>)}</div>}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [oracleData,setOracleData] = useState(null)
  const [oracleLive,setOracleLive] = useState(false)
  const [recentTrades,setRecentTrades] = useState([])
  const [dexData,setDexData] = useState(null)
  const [sim,setSim]=useState(()=>({traders:createTraders(),pool:0,vol:0,price:.001,price0:.001,priceHist:[],crown:null,ksWallet:null,ksFired:false,roundId:1,tLeft:ROUND_DURATION,settled:null,autoCount:8,history:[]}))
  const simRef=useRef(sim)
  const [feedItems,setFeedItems]=useState([])
  const [toast,setToast]=useState(null)
  const [showHTP,setShowHTP]=useState(false)
  const [wIdx,setWIdx]=useState(0)
  const wAngleRef=useRef(0);const wIdxRef=useRef(0);const wTickRef=useRef(0)
  const wheelRef=useRef(null);const chartRef=useRef(null)
  const price0Ref=useRef(.001)
  const addFeed=useCallback((ico,html)=>{const t=new Date();const ts=String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0');setFeedItems(p=>[{ico,html,ts,id:Date.now()+Math.random()},...p].slice(0,60))},[])

  // Contract reads
  const {data:contractData,refetch:refetchContract} = useReadContracts({
    contracts:[
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'currentRoundId',chainId:base.id},
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'roundStartTime', chainId:base.id},
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'arenaCarry',     chainId:base.id},
      {address:ARENA_ADDRESS,abi:ARENA_ABI,functionName:'feeCrownHolder', chainId:base.id},
      {address:WETH_BASE,abi:ERC20_ABI,functionName:'balanceOf',args:[ARENA_ADDRESS],chainId:base.id},
    ],
    enabled:!!ARENA_ADDRESS,
  })

  const chainRoundId   = contractData?.[0]?.result ? Number(contractData[0].result) : null
  const chainStartTime = contractData?.[1]?.result ? Number(contractData[1].result) : null
  const chainCarry     = contractData?.[2]?.result ? weiToEth(contractData[2].result.toString()) : 0
  const chainCrown     = contractData?.[3]?.result || null
  const chainWeth      = contractData?.[4]?.result ? weiToEth(contractData[4].result.toString()) : 0
  const chainPool      = chainWeth + chainCarry

  const [now,setNow] = useState(Math.floor(Date.now()/1000))
  useEffect(()=>{const t=setInterval(()=>setNow(Math.floor(Date.now()/1000)),1000);return()=>clearInterval(t)},[])
  useEffect(()=>{const t=setInterval(()=>refetchContract(),30000);return()=>clearInterval(t)},[refetchContract])

  // Poll recent trades from oracle
  useEffect(()=>{
    if(!ORACLE_API_URL)return
    const poll=async()=>{
      try{
        const r=await fetch(`${ORACLE_API_URL}/api/trades`,{signal:AbortSignal.timeout(5000)})
        if(r.ok){const d=await r.json();setRecentTrades(d.trades||[])}
      }catch{}
    }
    poll();const t=setInterval(poll,8000);return()=>clearInterval(t)
  },[])

  // Poll DexScreener for real price/volume data
  useEffect(()=>{
    const poll=async()=>{
      try{
        const r=await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${DEXSCREENER_PAIR}`,{signal:AbortSignal.timeout(8000)})
        if(r.ok){const d=await r.json();if(d.pair)setDexData(d.pair)}
      }catch{}
    }
    poll();const t=setInterval(poll,30000);return()=>clearInterval(t)
  },[])

  const timeLeft = chainStartTime ? Math.max(0,chainStartTime+ROUND_DURATION-now) : null
  const inKW = timeLeft!==null && timeLeft/ROUND_DURATION < 0.167

  // Oracle polling
  useEffect(()=>{
    if(!ORACLE_API_URL)return
    const poll=async()=>{
      try{
        const res=await fetch(`${ORACLE_API_URL}/api/state`,{signal:AbortSignal.timeout(5000)})
        if(!res.ok)throw new Error('bad')
        const d=await res.json()
        setOracleData(d);setOracleLive(true)
      }catch{setOracleLive(false)}
    }
    poll();const t=setInterval(poll,10000);return()=>clearInterval(t)
  },[])

  // Simulation state

  useEffect(()=>{
    if(oracleLive)return
    const trdrs=simRef.current.traders
    trdrs.forEach(t=>{const w=t.lo+Math.random()*t.hi;t.pos=w/simRef.current.price;t.avgCost=simRef.current.price})
    let lastT=Date.now(),elapsed=0
    const iv=setInterval(()=>{
      const s=simRef.current
      if(s.settled)return
      const dt=(Date.now()-lastT)/1000;lastT=Date.now();elapsed+=dt
      const ticks=Math.floor(elapsed);elapsed-=ticks
      for(let i=0;i<Math.min(ticks,40);i++){
        const newP=Math.max(.00008,s.price*(1+(Math.random()-.492)*.013))
        const newH=[...s.priceHist,newP].slice(-CHART_LEN)
        trdrs.forEach(t=>{if(Math.random()>t.agg*.44)return;const isBuy=Math.random()<t.bias;const w=t.lo+Math.random()*(t.hi-t.lo);if(isBuy){buy(t,w,newP)}else if(t.pos>0){sell(t,w,newP)}})
        const lb=getLeaderboard(trdrs)
        const nc=lb[0]?.n
        setSim(prev=>({...prev,price:newP,priceHist:newH,crown:nc!==prev.crown?nc:prev.crown}))
        if(Math.random()<.04&&lb.length){addFeed(lb[0].ico||'⚡',`<span class="fa">${lb[0].n}</span> leading with <span class="fu">+${fmt4(lb[0].pnl)} Ξ</span>`)}
      }
      setSim(prev=>{
        const newTLeft=Math.max(0,prev.tLeft-dt)
        if(newTLeft<=0){
          const lb=getLeaderboard(trdrs)
          if(!lb.length)return{...prev,tLeft:ROUND_DURATION}
          const p=prev.pool+.05,winner=lb[0]
          const settled={p,winner,wShare:p*.5,carry:p*.05,lb}
          let ct=8
          const timer=setInterval(()=>{ct--;setSim(s2=>({...s2,autoCount:ct}));if(ct<=0){clearInterval(timer);trdrs.forEach(t=>{t.pnl=0;t.vol=0});setSim(s2=>({...s2,settled:null,roundId:s2.roundId+1,tLeft:ROUND_DURATION,pool:settled.carry,vol:0,ksFired:false,ksWallet:null,crown:null,history:[{rnd:s2.roundId,p,ico:winner.ico,n:winner.n,ks:0,ft:lb.length},...s2.history]}))}},1000)
          return{...prev,tLeft:0,settled,autoCount:8}
        }
        return{...prev,tLeft:newTLeft}
      })
    },50)
    return()=>clearInterval(iv)
  },[oracleLive,addFeed])

  const isLive=oracleLive&&!!ORACLE_API_URL
  const roundId=isLive?(chainRoundId??1):sim.roundId
  const pool=isLive?chainPool:sim.pool
  const displayTLeft=isLive?(timeLeft??ROUND_DURATION):sim.tLeft
  const crown=isLive?(chainCrown?shortAddr(chainCrown):'—'):(sim.crown??'—')
  // Use DexScreener price (most accurate), fallback to oracle estimate
  const dexPriceEth = dexData?.priceNative ? parseFloat(dexData.priceNative) : 0
  const rawPrice = oracleData?.price ? parseInt(oracleData.price) : 0
  const price = dexPriceEth > 0 ? dexPriceEth : (isLive?(rawPrice > 0 ? rawPrice / 1e36 : 0):sim.price)
  const dexVol24h = dexData?.volume?.h24 ? parseFloat(dexData.volume.h24) : 0
  const dexTxns24h = dexData?.txns?.h24 ? (dexData.txns.h24.buys||0)+(dexData.txns.h24.sells||0) : 0
  const dexMcap = dexData?.marketCap ? parseFloat(dexData.marketCap) : 0
  if(!isLive)price0Ref.current=sim.price0
  const chgPct=price0Ref.current>0?((price-price0Ref.current)/price0Ref.current*100):0
  const isUp=chgPct>=0

  const ICONS=['🐋','⚡','🎯','🔥','🛡','🤖','🐳','🤝']
  const liveBoard=isLive&&oracleData?.leaderboard?oracleData.leaderboard.map((e,i)=>({n:e.short||shortAddr(e.wallet),fullAddr:e.wallet,cls:'trader',ico:ICONS[i%ICONS.length],pnl:weiToEth(e.realized),vol:weiToEth(e.volume),rank:e.rank,d:i*.18+'s'})):null
  const board=liveBoard??getLeaderboard(simRef.current.traders)

  const showToast=useCallback((msg,dur=3000)=>{setToast(msg);setTimeout(()=>setToast(null),dur)},[])

  useEffect(()=>{
    if(!board.length)return
    wAngleRef.current+=.007;wTickRef.current++
    if(wTickRef.current%160===0&&board.length>1){wIdxRef.current=(wIdxRef.current+1)%Math.min(board.length,6);setWIdx(wIdxRef.current)}
    drawWheel(wheelRef.current,board.map(e=>({...e,ico:e.ico||'⚡'})),wAngleRef.current)
  })

  useEffect(()=>{
    if(!chartRef.current)return
    chartRef.current.width=chartRef.current.parentElement?.offsetWidth||400
    chartRef.current.height=190
    drawChart(chartRef.current,sim.priceHist)
  },[sim.priceHist])

  useEffect(()=>{
    if(oracleLive)addFeed('🔴','<span class="fb">ORACLE LIVE</span> — real traders, real swaps on Base')
  },[oracleLive])

  const roundExpired = displayTLeft === 0 && chainStartTime !== null
  const m=Math.floor(displayTLeft/60),s2=Math.floor(displayTLeft%60)
  const cdClass=roundExpired?'cd hot':displayTLeft<8?'cd hot':displayTLeft<20?'cd warn':'cd'
  const wheelEntry=board[wIdx]||board[0]
  const {settled,autoCount,history}=sim

  return (
    <>
      <Starfield/>
      <div className="crt"/>
      <div className="app">
        <header className="header">
          <div className="logo-row">
            <div className="base-ball">B</div>
            <div>
              <div className="logo"><em>FEE</em> WARS</div>
              <div className="logo-sub">
                THE ARENA · BUILT ON BASE &nbsp;
                <a href="https://x.com/feewars" target="_blank" rel="noopener noreferrer"
                  style={{color:'var(--base)',textDecoration:'none',fontSize:9,fontFamily:'var(--mono)',letterSpacing:1}}>
                  𝕏 FOLLOW
                </a>
              </div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="chip live">{isLive?'LIVE':'SIM'}</div>
            <div className="chip">ROUND #{roundId}</div>
            <div className="chip" style={{color:'var(--teal)',borderColor:'rgba(0,212,170,.3)'}}>
              {dexData?.priceUsd ? `$${parseFloat(dexData.priceUsd).toFixed(8)}` : `Ξ${price.toFixed(5)}`}
            </div>
            <div className="chip" style={{color:'var(--gold)',borderColor:'rgba(255,201,64,.3)'}}>👑 {crown}</div>
            <button className="hdr-btn howto" onClick={()=>setShowHTP(true)}>? HOW TO PLAY</button>
            <a href="https://x.com/feewars" target="_blank" rel="noreferrer" className="hdr-btn" style={{textDecoration:'none',color:'inherit'}}>𝕏 FOLLOW</a>
            <button className="hdr-btn bankr-page" onClick={()=>window.open(BANKR_URL,'_blank')}>BANKR PAGE ↗</button>
            <button className="hdr-btn buy" onClick={()=>window.open(BANKR_SWAP_URL,'_blank')}>BUY ON BANKR ↗</button>
            <ConnectButton label="CONNECT" accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>

                  {dexData && <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
            {[['24H VOL',`$${dexVol24h>=1000?(dexVol24h/1000).toFixed(1)+'K':dexVol24h.toFixed(0)}`,'var(--teal)'],['TXNS 24H',dexTxns24h,'var(--white)'],['MCAP',dexMcap>=1000000?`$${(dexMcap/1000000).toFixed(2)}M`:dexMcap>=1000?`$${(dexMcap/1000).toFixed(1)}K`:`$${dexMcap.toFixed(0)}`,'var(--gold)'],['BUYS',dexData?.txns?.h24?.buys||0,'var(--teal)'],['SELLS',dexData?.txns?.h24?.sells||0,'var(--red)']].map(([l,v,c])=>(
              <div key={l} style={{background:'var(--s1)',border:'1px solid var(--border)',padding:'4px 10px',fontFamily:'var(--mono)',fontSize:9,display:'flex',gap:7,alignItems:'center'}}>
                <span style={{color:'var(--gray)',letterSpacing:2}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span>
              </div>
            ))}
            <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer" style={{background:'var(--s1)',border:'1px solid rgba(0,82,255,.3)',padding:'4px 10px',fontFamily:'var(--mono)',fontSize:9,color:'var(--base)',textDecoration:'none',display:'flex',alignItems:'center',gap:5}}>📊 CHART ↗</a>
          </div>}
          <div className="stats">
          <div className="sc ab"><div className="sc-lbl">Prize Pool</div><div className="sc-val blue">Ξ{fmt4(pool)}</div><div className="sc-sub">${(pool*WETH_USD).toLocaleString('en-US',{maximumFractionDigits:0})}</div></div>
          <div className="sc ag" style={{position:'relative'}}><div className="sc-lbl">Round Timer</div><span className={cdClass}>{roundExpired ? 'SETTLING' : `${String(m).padStart(2,'0')}:${String(s2).padStart(2,'0')}`}</span><div className="sc-sub">ROUND #{roundId}</div><div className={`kw-bar${inKW?' active':''}`}/></div>
          <div className="sc at"><div className="sc-lbl">Token Price</div><div className={`sc-val ${isUp?'teal':'red'}`}>Ξ{price>0?price.toFixed(7):'0.0000000'}</div><div className="sc-sub" style={{color:isUp?'var(--teal)':'var(--red)'}}>{isUp?'+':''}{fmt2(chgPct)}%</div>{dexData?.priceUsd&&<div className="sc-sub">${parseFloat(dexData.priceUsd).toFixed(8)}</div>}</div>
          <div className="sc ar"><div className="sc-lbl">{isLive?'Traders':'Volume'}</div><div className="sc-val red">{isLive?(oracleData?.traders>0?oracleData.traders:(recentTrades.length>0?new Set(recentTrades.map(t=>t.wallet)).size:0)):fmt2(sim.vol)+' Ξ'}</div><div className="sc-sub">this round</div></div>
          <div className="sc aw"><div className="sc-lbl">Fighters</div><div className="sc-val">{board.length}</div><div className="sc-sub">active</div></div>
        </div>

        <div className="main">
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div className="panel" style={{borderColor:'rgba(0,82,255,.4)'}}>
                <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}><span className="pt blue">◈ BATTLE WHEEL</span><span className="pm">{isLive?'LIVE':'SIMULATED'}</span></div>
                <div className="wheel-wrap">
                  <canvas ref={wheelRef} width={220} height={220} style={{flexShrink:0,maxWidth:'100%'}}/>
                  {wheelEntry&&<div className="wi"><div className="wi-rank">{wIdx===0?'RANK #1 · 👑 CROWN':`RANK #${wIdx+1}`}</div><div className="wi-name">{wheelEntry.n}</div><div className={`wi-pnl${wheelEntry.pnl<0?' neg':''}`}>{wheelEntry.pnl>=0?'+':''}{fmt4(wheelEntry.pnl)} Ξ</div><div className="wi-vol">VOL: {fmt4(wheelEntry.vol||0)} Ξ</div><div className={`wi-cls ${wheelEntry.cls||'trader'}`}>{(wheelEntry.cls||'TRADER').toUpperCase()}</div></div>}
                </div>
              </div>
              <div className="panel" style={{display:'flex',flexDirection:'column'}}>
                <div className="ph"><span className="pt teal">◈ TOKEN PRICE</span>
                  <span style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:isUp?'var(--teal)':'var(--red)',fontFamily:'var(--mono)',fontSize:9}}>{isUp?'▲ +':'▼ '}{Math.abs(chgPct).toFixed(2)}%</span>
                    <span className="pm">LIVE</span>
                  </span>
                </div>
                <div style={{width:'100%',height:320,overflow:'hidden',position:'relative',flexGrow:1}}>
                  <iframe
                    src="https://dexscreener.com/base/0x26494e2be99bde2f02800b71e87bf4623b0df94dd3041d0b09799501bc81b945?embed=1&theme=dark&trades=0&info=0"
                    style={{width:'100%',height:352,border:'none',position:'absolute',top:0,left:0}}
                    title="$FEES Price Chart"
                  />
                </div>
              </div>
            </div>

            <div className="panel" style={{marginBottom:12,borderColor:'rgba(0,82,255,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}><span className="pt blue">◈ FIGHTER RANKINGS</span><span className="pm">{isLive?'REALIZED PNL · LIVE':'SIMULATED'} · {board.length} FIGHTERS</span></div>
              <table className="lb">
                <thead><tr><th className="lb-th">#</th><th className="lb-th" colSpan={2}>FIGHTER</th><th className="lb-th">VOLUME</th><th className="lb-th" style={{textAlign:'right'}}>REALIZED PNL</th></tr></thead>
                <tbody>{board.slice(0,12).map((t,i)=>{const rank=i+1;const rkC=rank===1?'r1':rank===2?'r2':rank===3?'r3':'';const maxA=Math.max(...board.map(x=>Math.abs(x.pnl)),.001);const bp=Math.min(100,Math.abs(t.pnl)/maxA*100);return(<tr key={t.n+i} className="fr"><td><span className={`rk ${rkC}`}>{rank}</span></td><td style={{width:42,paddingRight:0}}><div className={`spr${rank===1?' leader':''}`} style={{animationDelay:t.d||'0s'}}>{t.ico||'⚡'}</div></td><td><div className="fn">{t.n}</div><span className={`fc ${t.cls||'trader'}`}>{(t.cls||'trader').toUpperCase()}</span><div className="hp"><div className={`hpf ${t.pnl>=0?'p':'n'}`} style={{width:`${bp}%`}}/></div></td><td className="vc">{fmt4(t.vol||0)} Ξ</td><td className={`pcc ${t.pnl>=0?'pos':'neg'}`}>{t.pnl>=0?'+':''}{fmt4(t.pnl)} Ξ</td></tr>)})}</tbody>
              </table>
            </div>

            <div className="panel">
              <div className="ph"><span className="pt gray">◈ BATTLE HISTORY</span><span className="pm">SETTLED ROUNDS</span></div>
              {history.length===0?<div style={{padding:'16px',fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)'}}>FIRST ROUND IN PROGRESS...</div>:history.slice(0,8).map((h,i)=><div key={i} className="hist-row"><div><div className="hr-rnd">ROUND #{h.rnd} · {h.ft} FIGHTERS</div><div className="hr-win">{h.ico} {h.n}</div></div><div className="hr-pool">{fmt4(h.p)} Ξ</div></div>)}
            </div>
          </div>

          <div className="sidebar">
            <div className="panel" style={{borderColor:'rgba(0,212,170,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,212,170,.2)'}}><span className="pt teal">◈ MY POSITION</span><span className="pm">WALLET</span></div>
              <MyPosition oracleData={oracleData} usdPrice={dexData?.priceUsd?parseFloat(dexData.priceUsd):0}/>
            </div>

            <div className="panel" style={{borderColor:'rgba(255,201,64,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(255,201,64,.15)'}}><span className="pt gold">◈ PRIZE SPLIT</span><span className="pm">RND #{roundId}</span></div>
              {[['🏆 Winner (50%)','25% instant · 75% vested','pb-pct g',pool*.50],['🥈 Top 2–10 (20%)','rank-weighted','pb-pct p',pool*.20],['📈 Vol Rebate (10%)','streak multiplier','pb-pct t',pool*.10],['🏛 Arena Carry (5%)','rolls to next round','pb-pct a',pool*.05]].map(([lbl,note,cls,val])=><div key={lbl} className="pb-row"><div><div className="pb-lbl">{lbl}</div><div className="pb-note">{note}</div></div><div className="pb-r"><div className={cls}>{lbl.match(/\d+%/)?.[0]}</div><div className="pb-eth">{fmt4(val)} Ξ</div></div></div>)}
              <div className="pb-bar"><div className="pb-seg" style={{width:'50%',background:'var(--gold)'}}/><div className="pb-seg" style={{width:'20%',background:'var(--base)'}}/><div className="pb-seg" style={{width:'10%',background:'var(--teal)'}}/><div className="pb-seg" style={{width:'5%',background:'var(--amber)'}}/><div className="pb-seg" style={{width:'15%',background:'var(--gray2)'}}/></div>
            </div>

            <div className="panel">
              <div className="ph"><span className="pt blue">◈ RECENT TRADES</span><span className="pm">{isLive?'LIVE':'SIMULATED'}</span></div>
              <div style={{overflowY:'auto',maxHeight:220}}>
                {isLive && recentTrades.length > 0 ? (
                  <>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',padding:'4px 8px',fontFamily:'var(--mono)',fontSize:8,color:'var(--gray)',borderBottom:'1px solid var(--border)'}}>
                      <span>TIME</span><span>TYPE</span><span>WALLET</span><span style={{textAlign:'right'}}>WETH</span>
                    </div>
                    {recentTrades.map((t,i)=>{
                      const isBuy = t.action==='BUY'
                      const wethEth = (parseInt(t.weth||'0')/1e18).toFixed(4)
                      const age = Math.floor((Date.now()/1000 - parseInt(t.ts||'0'))/60)
                      const timeStr = age < 1 ? 'now' : age < 60 ? `${age}m` : `${Math.floor(age/60)}h`
                      return(
                        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',padding:'5px 8px',fontFamily:'var(--mono)',fontSize:9,borderBottom:'1px solid rgba(255,255,255,.04)',background:isBuy?'rgba(0,212,170,.04)':'rgba(255,51,85,.04)'}}>
                          <span style={{color:'var(--gray)'}}>{timeStr}</span>
                          <span style={{color:isBuy?'var(--teal)':'var(--red)',fontWeight:700}}>{t.action}</span>
                          <span style={{color:'var(--base)'}}>{t.short}</span>
                          <span style={{textAlign:'right',color:isBuy?'var(--teal)':'var(--red)'}}>{wethEth}Ξ</span>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className="feed">{feedItems.map(f=><div key={f.id} className="fi"><span className="fi-t">{f.ts}</span><span className="fi-i">{f.ico}</span><span className="fi-b" dangerouslySetInnerHTML={{__html:f.html}}/></div>)}</div>
                )}
              </div>
            </div>

            <div className="panel" style={{borderColor:'rgba(0,82,255,.3)'}}>
              <div className="ph" style={{borderColor:'rgba(0,82,255,.2)'}}><span className="pt blue">◈ BASE NETWORK</span><span className="pm">STATS</span></div>
              {[['NETWORK',<span style={{color:'var(--base)'}}>Base Mainnet</span>],['STATUS',<span style={{color:isLive?'var(--teal)':'var(--amber)'}}>{isLive?'🟢 ORACLE LIVE':'🟡 SIMULATION'}</span>],['ROUND',`#${roundId}`],['SWAP FEE',<span style={{color:'var(--teal)'}}>1.2%</span>],['CARRY',<span style={{color:'var(--gold)'}}>{fmt4(chainCarry)} Ξ</span>],['CONTRACT',<span style={{color:'var(--base)',fontSize:9,cursor:'pointer'}} onClick={()=>{navigator.clipboard?.writeText(ARENA_ADDRESS);showToast('📋 Copied!')}}>{ARENA_ADDRESS?ARENA_ADDRESS.slice(0,8)+'...'+ARENA_ADDRESS.slice(-6):'—'}</span>]].map(([k,v])=><div key={k} className="info-row"><span>{k}</span><span>{v}</span></div>)}
            </div>
          </div>
        </div>
      </div>

      {settled&&!isLive&&<div className="overlay show"><div className="settle-box"><div className="m-top"><span className="m-title">⚔ ROUND COMPLETE</span><div className="m-sub">ROUND #{roundId-1} · {settled.lb.length} FIGHTERS</div></div><div className="m-winner"><span className="m-ico">{settled.winner.ico}</span><div className="m-name">{settled.winner.n}</div></div><div className="m-rows"><div className="m-row"><span className="m-l">Prize Pool</span><span className="mv-g">{fmt4(settled.p)} Ξ</span></div><div className="m-row"><span className="m-l">Winner Instant</span><span className="mv-t">{fmt4(settled.wShare*.25)} Ξ</span></div><div className="m-row"><span className="m-l">Winner Vested</span><span className="mv-a">{fmt4(settled.wShare*.75)} Ξ — 4 rounds</span></div><div className="m-row"><span className="m-l">Arena Carry</span><span className="mv-a">{fmt4(settled.carry)} Ξ</span></div></div><div className="m-auto"><span>NEXT ROUND IN <strong>{autoCount}s</strong></span><div className="m-prog"><div className="m-prog-fill" style={{width:`${(autoCount/8)*100}%`,transition:'width 1s linear'}}/></div></div></div></div>}

      {showHTP&&<HowToPlay onClose={()=>setShowHTP(false)}/>}
      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
