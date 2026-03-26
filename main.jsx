import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  trustWallet,
  phantomWallet,
  okxWallet,
  uniswapWallet,
} from '@rainbow-me/rainbowkit/wallets'
import App from './App'
import './styles.css'

// ── WalletConnect project ID
// Get yours free at https://cloud.walletconnect.com
// Replace this with your own before deploying to production
const WALLET_CONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || 'feewars_demo_project_id'

// ── Wagmi / RainbowKit config
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        coinbaseWallet,   // Best for Base — native support
        metaMaskWallet,
        rainbowWallet,
        walletConnectWallet,
      ],
    },
    {
      groupName: 'More',
      wallets: [
        trustWallet,
        phantomWallet,
        okxWallet,
        uniswapWallet,
      ],
    },
  ],
  {
    appName:   'FeeWars Arena',
    projectId: WALLET_CONNECT_PROJECT_ID,
  }
)

const config = createConfig({
  connectors,
  chains:    [base, baseSepolia],
  transports: {
    [base.id]:        http('https://mainnet.base.org'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
})

const queryClient = new QueryClient()

// ── Custom RainbowKit theme matching FeeWars colours
const feeWarsTheme = darkTheme({
  accentColor:          '#0052FF',   // Base blue
  accentColorForeground:'#ffffff',
  borderRadius:         'small',
  fontStack:            'system',
  overlayBlur:          'small',
})

// Override specific tokens to match the dashboard's palette
const customTheme = {
  ...feeWarsTheme,
  colors: {
    ...feeWarsTheme.colors,
    modalBackground:       '#0e1d33',
    modalBorder:           '#1f3a5f',
    modalText:             '#f0f6ff',
    modalTextSecondary:    '#6a8aaa',
    menuItemBackground:    '#0a1525',
    profileForeground:     '#0a1525',
    selectedOptionBorder:  '#0052FF',
    actionButtonBorder:    '#1f3a5f',
    actionButtonBorderMobile: '#1f3a5f',
    closeButton:           '#6a8aaa',
    closeButtonBackground: '#0a1525',
    connectButtonBackground:       '#0052FF',
    connectButtonBackgroundError:  '#ff3355',
    connectButtonInnerBackground:  '#0052FF',
    connectButtonText:             '#ffffff',
    connectButtonTextError:        '#ffffff',
    connectionIndicator:           '#00d4aa',
    downloadBottomCardBackground:  '#0e1d33',
    downloadTopCardBackground:     '#0a1525',
    error:                 '#ff3355',
    generalBorder:         '#1a2e4a',
    generalBorderDim:      '#1a2e4a',
    standby:               '#ffc940',
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={customTheme}
          locale="en-US"
          showRecentTransactions={true}
          modalSize="compact"
          appInfo={{
            appName:  'FeeWars Arena',
            learnMoreUrl: 'https://feewars.xyz',
          }}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
