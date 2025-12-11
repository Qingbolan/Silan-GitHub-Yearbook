import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import YearbookPage from './pages/YearbookPage'

// Handle redirect from 404.html for GitHub Pages SPA support
function RedirectHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    if (redirect) {
      // Navigate to the original path
      navigate(decodeURIComponent(redirect), { replace: true })
    }
  }, [location.search, navigate])

  return null
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RedirectHandler />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/yearbook/:username/:year" element={<YearbookPage />} />
        <Route path="/yearbook/:username/:start/:end" element={<YearbookPage />} />
      </Routes>
    </BrowserRouter>
  )
}
