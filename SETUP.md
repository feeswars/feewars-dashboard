# FeeWars Arena — React App Setup (Windows)

## Why React?

RainbowKit (the wallet connection library) requires React.
It supports MetaMask, Coinbase Wallet, Rainbow, WalletConnect, Trust Wallet,
OKX, Phantom, Uniswap Wallet, and 100+ others in one polished modal.

---

## Setup (PowerShell)

```powershell
# 1. Navigate into the app folder
cd "$env:USERPROFILE\fee-wars-v3\dashboard-react"

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Copy environment config
copy .env.example .env
notepad .env
```

Fill in `.env`:
- `VITE_WC_PROJECT_ID` — get free at https://cloud.walletconnect.com
  (create project → copy Project ID → paste here)
- Leave `VITE_ARENA_ADDRESS` and `VITE_TOKEN_ADDRESS` blank for now

```powershell
# 4. Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Deploy to production

```powershell
# Build optimised files
npm run build

# Files are in the dist/ folder
# Upload dist/ to Vercel, Netlify, or Cloudflare Pages
```

### Vercel (easiest)
```powershell
npx vercel
# Follow prompts — it detects Vite automatically
# Custom domain can be added in Vercel dashboard
```

### Netlify drag-and-drop
1. `npm run build`
2. Go to netlify.com → Add new site → Deploy manually
3. Drag the `dist` folder into the deploy zone
4. Done — get a URL instantly

---

## After contract deploy

Add your addresses to `.env`:
```
VITE_ARENA_ADDRESS=0xYOUR_ARENA_CONTRACT
VITE_TOKEN_ADDRESS=0xYOUR_TOKEN_CONTRACT
```

Then rebuild:
```powershell
npm run build
```

---

## WalletConnect Project ID

Without this, WalletConnect-based wallets (mobile wallets, Trust Wallet etc) won't work.
MetaMask and Coinbase Wallet work fine without it.

1. Go to https://cloud.walletconnect.com
2. Sign up (free)
3. Create a new project, name it "FeeWars Arena"
4. Copy the Project ID
5. Paste into `.env` as `VITE_WC_PROJECT_ID`

---

## Troubleshooting

### `npm install` fails with peer dependency errors
```powershell
npm install --legacy-peer-deps
```

### Blank page after `npm run dev`
Check browser console (F12). Usually a missing env var or Vite config issue.

### RainbowKit modal doesn't open
Make sure `VITE_WC_PROJECT_ID` is set in `.env` (even a fake one works for local dev).
