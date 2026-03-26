import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Required for RainbowKit / wagmi / viem to bundle correctly
  resolve: {
    alias: { process: 'process/browser' },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@rainbow-me/rainbowkit', 'wagmi', 'viem'],
  },
})
