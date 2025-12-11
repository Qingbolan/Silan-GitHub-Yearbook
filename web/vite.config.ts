import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get base path for GitHub Pages deployment
// GITHUB_REPOSITORY is set by GitHub Actions (e.g., "owner/repo-name")
const getBasePath = () => {
  if (process.env.GITHUB_REPOSITORY) {
    const repoName = process.env.GITHUB_REPOSITORY.split('/')[1]
    return `/${repoName}/`
  }
  return '/'
}

export default defineConfig({
  plugins: [react()],
  base: getBasePath(),
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://yearbook.silan.tech',
        changeOrigin: true,
      },
    },
  },
})
