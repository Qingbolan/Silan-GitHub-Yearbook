// Backend API service

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://yearbook.silan.tech/api'

// ============== Token Management ==============

export interface TokenInfo {
  exists: boolean
  masked_token?: string
  token_type?: string
  scopes?: string
  is_valid?: boolean
  updated_at?: string
}

export async function saveToken(
  username: string,
  token: string,
  tokenType?: string,
  scopes?: string
): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      github_token: token,
      token_type: tokenType,
      scopes,
    }),
  })
  return response.json()
}

export async function getToken(username: string): Promise<TokenInfo> {
  const response = await fetch(`${API_BASE}/token/${username}`)
  return response.json()
}

export async function deleteToken(username: string): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/token/${username}`, {
    method: 'DELETE',
  })
  return response.json()
}

// ============== Visit Logging ==============

export interface VisitData {
  target_username: string
  target_year: number
  visitor_country?: string
  visitor_city?: string
  visitor_lat?: number
  visitor_lng?: number
  visitor_fingerprint?: string
  referer?: string
}

export interface VisitLocation {
  lat: number
  lng: number
  city?: string
  country?: string
  visited_at: string
}

export interface VisitStats {
  total: number
  by_country: Array<{ country: string; count: number }>
  map_data: VisitLocation[]
}

export async function logVisit(data: VisitData): Promise<{ status: string; visit_id: number }> {
  const response = await fetch(`${API_BASE}/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}

export async function getVisitStats(username: string, year?: number): Promise<VisitStats> {
  const url = year
    ? `${API_BASE}/visits/${username}/stats?year=${year}`
    : `${API_BASE}/visits/${username}/stats`
  const response = await fetch(url)
  return response.json()
}

// ============== Yearbook Stats ==============

export interface RepoContribution {
  repo: string
  fullName?: string
  count: number
  isPrivate: boolean
  stars?: number
  forks?: number
  language?: string
  description?: string
  url?: string
}

export interface LanguageStat {
  name: string
  color: string
  size: number
  percentage: number
  repoCount: number
}

export interface YearbookStats {
  username: string
  year: number
  // User profile info
  avatarUrl?: string
  bio?: string
  company?: string
  location?: string
  followers: number
  following: number
  // Contribution stats
  totalContributions: number
  totalCommits: number
  pullRequests: number
  pullRequestReviews: number
  issues: number
  // Streak stats
  longestStreak: number
  currentStreak: number
  activeDays: number
  // Repo stats
  repoCount: number
  publicRepoCount: number
  privateRepoCount: number
  totalRepoCount: number
  // Data
  dailyContributions: Array<{ date: string; count: number }>
  languageStats: LanguageStat[]
  repositoryContributions: RepoContribution[]
  organizations: Array<{ login: string; avatarUrl: string }>
  cached: boolean
}

export async function getYearbookStats(
  username: string,
  year: number,
  token?: string,
  start?: string,
  end?: string
): Promise<YearbookStats> {
  let url = token
    ? `${API_BASE}/stats/${username}/${year}?token=${encodeURIComponent(token)}`
    : `${API_BASE}/stats/${username}/${year}`

  if (start && end) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}start=${start}&end=${end}`
  }
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to fetch stats')
  }
  return response.json()
}

export async function refreshYearbookStats(
  username: string,
  year: number,
  token?: string
): Promise<YearbookStats> {
  const url = token
    ? `${API_BASE}/stats/${username}/${year}/refresh?token=${encodeURIComponent(token)}`
    : `${API_BASE}/stats/${username}/${year}/refresh`
  const response = await fetch(url, { method: 'POST' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to refresh stats')
  }
  return response.json()
}

// ============== Geo Location Helper ==============

export interface GeoLocation {
  ip: string
  city: string
  country: string
  countryCode: string
  lat: number
  lon: number
}

export async function getCurrentLocation(): Promise<GeoLocation | null> {
  // Skip geolocation in screenshot mode to avoid rate limits and unnecessary API calls
  if (typeof window !== 'undefined' && window.location.search.includes('screenshot=1')) {
    return null
  }

  try {
    const response = await fetch('https://ipapi.co/json/')
    if (!response.ok) return null
    const data = await response.json()
    return {
      ip: data.ip,
      city: data.city || 'Unknown',
      country: data.country_name || 'Unknown',
      countryCode: data.country_code || '',
      lat: data.latitude || 0,
      lon: data.longitude || 0,
    }
  } catch (e) {
    // Silent fail for ad-blockers or network issues
    console.warn('Geolocation failed (likely ad-blocker or rate limit):', e)
    return null
  }
}
