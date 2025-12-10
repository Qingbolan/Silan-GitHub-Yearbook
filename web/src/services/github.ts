import type { Commit } from '../types';
import {
  readCache,
  writeCache,
  getCachedCommits,
  updateCacheData,
  type CommitStats,
} from './gistCache';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export interface RepoContribution {
  repo: string;
  fullName?: string;
  owner?: string;
  count: number;
  isPrivate: boolean;
  isOrg?: boolean;
  stars?: number;
  forks?: number;
  language?: string;
  description?: string;
  url?: string;
}

export interface LanguageStats {
  name: string;
  color: string;
  size: number;       // bytes (from repo languages)
  loc: number;        // lines of code (from commits)
  percentage: number;
  repoCount: number;
}

export interface FullRepoInfo {
  name: string;
  fullName: string;
  isPrivate: boolean;
  isFork: boolean;
  description: string;
  url: string;
  stars: number;
  forks: number;
  primaryLanguage: string;
  primaryLanguageColor: string;
  languages: Array<{ name: string; color: string; size: number }>;
  pushedAt: string;
  commits: number; // commits in period
}

export interface ContributionData {
  totalCommits: number;
  totalContributions: number;
  restrictedContributions: number; // Private org contributions not visible in calendar
  dailyContributions: Array<{ date: string; count: number }>;
  repositoryContributions: RepoContribution[];
  commits: Commit[];
  // Extended stats
  pullRequests: number;
  pullRequestReviews: number;
  issues: number;
  linesAdded: number;
  linesDeleted: number;
  followers: number;
  following: number;
  publicRepos: number;
  privateRepos: number;
  totalRepos: number;
  createdAt: string;
  bio: string;
  company: string;
  location: string;
  avatarUrl: string;
  // Full language stats across all repos
  languageStats: LanguageStats[];
  // All repos with full info
  allRepos: FullRepoInfo[];
  // Organizations
  organizations: Array<{ login: string; avatarUrl: string }>;
  // Debug info
  missingScopes: string[];
  tokenType?: 'classic' | 'fine-grained' | 'none';
}

export async function fetchUserContributions(
  username: string,
  startDate: string,
  endDate: string,
  token?: string,
  onProgress?: (message: string) => void
): Promise<ContributionData> {
  // If we have a token, use GraphQL API for full data including private repos
  if (token) {
    return fetchWithGraphQL(username, startDate, endDate, token, onProgress);
  }

  // Without token, use REST API (public only, but faster)
  return fetchWithRestAPI(username, startDate, endDate, onProgress);
}

async function fetchWithGraphQL(
  username: string,
  startDate: string,
  endDate: string,
  token: string,
  onProgress?: (message: string) => void
): Promise<ContributionData> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Split into 1-year chunks
  const chunks: Array<{ from: Date; to: Date }> = [];
  let chunkStart = new Date(start);

  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setFullYear(chunkEnd.getFullYear() + 1);
    chunkEnd.setDate(chunkEnd.getDate() - 1);

    chunks.push({
      from: new Date(chunkStart),
      to: chunkEnd > end ? end : chunkEnd,
    });

    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  onProgress?.(`Fetching contribution data (${chunks.length} period${chunks.length > 1 ? 's' : ''})...`);

  let totalCommits = 0;
  let totalContributions = 0;
  let totalRestrictedContributions = 0;
  let totalPRs = 0;
  let totalReviews = 0;
  let totalIssues = 0;
  let userInfo = {
    avatarUrl: '', bio: '', company: '', location: '', createdAt: '',
    followers: 0, following: 0, publicRepos: 0, privateRepos: 0, totalRepos: 0
  };
  const allDailyContributions: Array<{ date: string; count: number }> = [];
  const repoMap = new Map<string, RepoContribution>();
  const allReposMap = new Map<string, FullRepoInfo>();
  const langSizeMap = new Map<string, { size: number; color: string; repos: Set<string> }>();
  const langLocMap = new Map<string, number>(); // LOC per language from commit file stats
  let organizations: Array<{ login: string; avatarUrl: string }> = [];
  let missingScopes: string[] = [];
  let tokenType: 'classic' | 'fine-grained' | 'none' = 'none';
  let linesAdded = 0;
  let linesDeleted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.(`Fetching period ${i + 1}/${chunks.length}...`);

    // Use viewer query to get authenticated user's data (includes private repos)
    // Note: Private org contributions are only visible if user has enabled
    // "Include private contributions on my profile" in their GitHub settings
    const query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          id
          login
          avatarUrl
          bio
          company
          location
          createdAt
          followers { totalCount }
          following { totalCount }
          repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) {
            totalCount
            nodes {
              name
              nameWithOwner
              isPrivate
              isFork
              description
              url
              stargazerCount
              forkCount
              primaryLanguage { name color }
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node { name color }
                }
                totalSize
              }
              owner { login }
              pushedAt
            }
          }
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            totalIssueContributions
            restrictedContributionsCount
            hasAnyContributions
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                name
                nameWithOwner
                isPrivate
                description
                url
                stargazerCount
                forkCount
                defaultBranchRef { name }
                primaryLanguage {
                  name
                  color
                }
                owner {
                  login
                  avatarUrl
                  __typename
                }
              }
              contributions {
                totalCount
              }
            }
            pullRequestContributionsByRepository(maxRepositories: 100) {
              repository {
                owner {
                  login
                  avatarUrl
                  __typename
                }
              }
            }
            issueContributionsByRepository(maxRepositories: 100) {
              repository {
                owner {
                  login
                  avatarUrl
                  __typename
                }
              }
            }
          }
          organizations(first: 100) {
            nodes {
              login
              name
              avatarUrl
            }
          }
        }
      }
    `;

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          from: chunk.from.toISOString(),
          to: new Date(chunk.to.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
        },
      }),
    });

    // Check scopes on first request
    if (i === 0) {
      const scopesHeader = response.headers.get('x-oauth-scopes');
      console.log('Auth Headers:', {
        scopes: scopesHeader,
        accepted: response.headers.get('x-accepted-oauth-scopes'),
        type: response.headers.get('x-github-media-type')
      });

      if (scopesHeader) {
        const scopes = scopesHeader.split(',').map(s => s.trim());
        const requiredScopes = ['repo', 'read:org'];
        const missing = requiredScopes.filter(s => !scopes.includes(s) && !scopes.includes('admin:org')); // admin:org implies read:org

        if (missing.length > 0) {
          console.warn('Missing scopes:', missing);
          missingScopes = missing;
        }
        tokenType = 'classic';
      } else {
        console.log('No x-oauth-scopes header found. Likely a fine-grained token.');
        tokenType = 'fine-grained';
      }
    }

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(result.errors[0].message);
    }

    if (!result.data?.viewer) {
      throw new Error('Could not fetch viewer data. Check your token permissions.');
    }

    const collection = result.data.viewer.contributionsCollection;
    const viewerLogin = result.data.viewer.login;
    const viewerId = result.data.viewer.id;

    // Log for debugging
    const orgs = result.data.viewer.organizations?.nodes || [];
    console.log(`Period ${i + 1}:`, {
      totalCommitContributions: collection.totalCommitContributions,
      restrictedContributions: collection.restrictedContributionsCount,
      calendarTotal: collection.contributionCalendar.totalContributions,
      hasAnyContributions: collection.hasAnyContributions,
      repoCount: collection.commitContributionsByRepository?.length || 0,
      organizations: orgs.map((o: { login: string }) => o.login),
    });

    totalCommits += collection.totalCommitContributions;
    totalPRs += collection.totalPullRequestContributions || 0;
    totalReviews += collection.totalPullRequestReviewContributions || 0;
    totalIssues += collection.totalIssueContributions || 0;

    // Capture user info and repos from first chunk (repos don't change per time period)
    if (i === 0) {
      const viewer = result.data.viewer;
      const repos = viewer.repositories?.nodes || [];
      const publicCount = repos.filter((r: { isPrivate: boolean }) => !r.isPrivate).length;
      const privateCount = repos.filter((r: { isPrivate: boolean }) => r.isPrivate).length;

      userInfo = {
        avatarUrl: viewer.avatarUrl || '',
        bio: viewer.bio || '',
        company: viewer.company || '',
        location: viewer.location || '',
        createdAt: viewer.createdAt || '',
        followers: viewer.followers?.totalCount || 0,
        following: viewer.following?.totalCount || 0,
        publicRepos: publicCount,
        privateRepos: privateCount,
        totalRepos: viewer.repositories?.totalCount || 0,
      };

      // Collect organizations
      organizations = orgs.map((o: { login: string; avatarUrl: string }) => ({
        login: o.login,
        avatarUrl: o.avatarUrl
      }));
      console.log('Fetched organizations:', organizations);

      // Process all repos for language stats
      repos.forEach((repo: {
        name: string;
        nameWithOwner: string;
        isPrivate: boolean;
        isFork: boolean;
        description: string;
        url: string;
        stargazerCount: number;
        forkCount: number;
        primaryLanguage: { name: string; color: string } | null;
        languages: { edges: Array<{ size: number; node: { name: string; color: string } }>; totalSize: number };
        owner: { login: string };
        pushedAt: string;
      }) => {
        // Collect language stats from all repos
        if (repo.languages?.edges) {
          repo.languages.edges.forEach(edge => {
            const lang = edge.node.name;
            const existing = langSizeMap.get(lang);
            if (existing) {
              existing.size += edge.size;
              existing.repos.add(repo.nameWithOwner);
            } else {
              langSizeMap.set(lang, {
                size: edge.size,
                color: edge.node.color || '#8b949e',
                repos: new Set([repo.nameWithOwner])
              });
            }
          });
        }

        // Store full repo info
        allReposMap.set(repo.nameWithOwner, {
          name: repo.name,
          fullName: repo.nameWithOwner,
          isPrivate: repo.isPrivate,
          isFork: repo.isFork || false,
          description: repo.description || '',
          url: repo.url,
          stars: repo.stargazerCount || 0,
          forks: repo.forkCount || 0,
          primaryLanguage: repo.primaryLanguage?.name || '',
          primaryLanguageColor: repo.primaryLanguage?.color || '#8b949e',
          languages: repo.languages?.edges?.map(e => ({
            name: e.node.name,
            color: e.node.color || '#8b949e',
            size: e.size
          })) || [],
          pushedAt: repo.pushedAt || '',
          commits: 0, // Will be updated below
        });
      });
    }

    // Include restricted contributions (private org contributions that aren't shown in public calendar)
    // But note: the daily breakdown only includes public contributions
    // The restrictedContributionsCount gives us the total hidden contributions
    const restrictedCount = collection.restrictedContributionsCount || 0;
    totalContributions += collection.contributionCalendar.totalContributions;

    // Track restricted contributions
    totalRestrictedContributions += restrictedCount;
    if (restrictedCount > 0) {
      console.log(`Period ${i + 1} has ${restrictedCount} restricted (private org) contributions not visible in calendar`);
    }

    // Collect daily contributions (including zeros for proper heatmap rendering)
    collection.contributionCalendar.weeks.forEach((week: { contributionDays: Array<{ date: string; contributionCount: number }> }) => {
      week.contributionDays.forEach(day => {
        allDailyContributions.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });

    // Collect repo contributions
    if (collection.commitContributionsByRepository) {
      const reposToFetchStats: Array<{ owner: string; name: string; branch: string }> = [];

      collection.commitContributionsByRepository.forEach((item: {
        repository: {
          name: string;
          nameWithOwner: string;
          isPrivate: boolean;
          description?: string;
          url?: string;
          stargazerCount?: number;
          forkCount?: number;
          defaultBranchRef?: { name: string };
          primaryLanguage?: { name: string; color?: string };
          owner?: { login: string; avatarUrl: string; __typename: string }
        };
        contributions: { totalCount: number }
      }) => {
        if (!item?.repository) return;

        // Collect organization from repo owner if it's an organization
        if (item.repository.owner?.__typename === 'Organization') {
          const orgLogin = item.repository.owner.login;
          const orgAvatar = item.repository.owner.avatarUrl;

          // Add to organizations list if not already present
          if (!organizations.some(o => o.login === orgLogin)) {
            organizations.push({ login: orgLogin, avatarUrl: orgAvatar });
          }
        }

        const key = item.repository.nameWithOwner || item.repository.name;
        const existing = repoMap.get(key);
        if (existing) {
          existing.count += item.contributions?.totalCount || 0;
        } else {
          repoMap.set(key, {
            repo: item.repository.name,
            fullName: item.repository.nameWithOwner,
            owner: item.repository.owner?.login || viewerLogin,
            count: item.contributions?.totalCount || 0,
            isPrivate: item.repository.isPrivate,
            isOrg: item.repository.owner?.login !== viewerLogin,
            stars: item.repository.stargazerCount || 0,
            forks: item.repository.forkCount || 0,
            language: item.repository.primaryLanguage?.name,
            description: item.repository.description,
            url: item.repository.url,
          });
        }

        // Add to list for fetching stats
        if (item.repository.owner && item.repository.defaultBranchRef) {
          reposToFetchStats.push({
            owner: item.repository.owner.login,
            name: item.repository.name,
            branch: item.repository.defaultBranchRef.name
          });
        }
      });

      // Fetch commit stats for these repos
      // TODO: Re-enable when backend cache is ready
      // For now, skip detailed stats to make page load faster
      if (reposToFetchStats.length > 0 && false) { // Disabled temporarily
        console.log('Repos to fetch stats:', reposToFetchStats.map(r => `${r.owner}/${r.name}`));
        onProgress?.(`Fetching detailed stats for ${reposToFetchStats.length} repositories...`);
        const stats = await fetchCommitStats(reposToFetchStats, chunk.from, chunk.to, viewerId, token, onProgress);
        console.log('Commit stats result:', { additions: stats.additions, deletions: stats.deletions });
        linesAdded += stats.additions;
        linesDeleted += stats.deletions;
        // Merge language LOC stats
        stats.langLoc.forEach((loc, lang) => {
          langLocMap.set(lang, (langLocMap.get(lang) || 0) + loc);
        });
      }

      // Process PR contributions for organizations
      collection.pullRequestContributionsByRepository?.forEach((item: { repository: { owner: { login: string; avatarUrl: string; __typename: string } } }) => {
        if (item?.repository?.owner?.__typename === 'Organization') {
          const orgLogin = item.repository.owner.login;
          const orgAvatar = item.repository.owner.avatarUrl;
          if (!organizations.some(o => o.login === orgLogin)) {
            organizations.push({ login: orgLogin, avatarUrl: orgAvatar });
          }
        }
      });

      // Process Issue contributions for organizations
      collection.issueContributionsByRepository?.forEach((item: { repository: { owner: { login: string; avatarUrl: string; __typename: string } } }) => {
        if (item?.repository?.owner?.__typename === 'Organization') {
          const orgLogin = item.repository.owner.login;
          const orgAvatar = item.repository.owner.avatarUrl;
          if (!organizations.some(o => o.login === orgLogin)) {
            organizations.push({ login: orgLogin, avatarUrl: orgAvatar });
          }
        }
      });
    }
  }

  const repositoryContributions = Array.from(repoMap.values())
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  // Check for missing commits (private org contributions not listed)
  const repoSum = repositoryContributions.reduce((sum, r) => sum + r.count, 0);
  if (totalCommits > repoSum) {
    const missing = totalCommits - repoSum;
    console.log(`Total commits: ${totalCommits}, Repo sum: ${repoSum}, Missing: ${missing}`);
    repositoryContributions.push({
      repo: 'Other Private Repos',
      fullName: 'private/other',
      owner: 'private',
      count: missing,
      isPrivate: true,
      isOrg: true,
    });
    repositoryContributions.sort((a, b) => b.count - a.count);
  }

  onProgress?.(`Found ${totalCommits} commits across ${repositoryContributions.length} repositories`);

  // Create commit-like objects
  const commits: Commit[] = [];
  repositoryContributions.forEach(repo => {
    for (let i = 0; i < Math.min(repo.count, 100); i++) {
      commits.push({
        repo: repo.repo,
        hash: `${repo.repo}-${i}`,
        date: startDate,
        author: username,
        message: '',
        files: [],
        insertions: 0,
        deletions: 0,
        source: 'github',
      });
    }
  });

  // Update allRepos with commit counts from this period
  repositoryContributions.forEach(rc => {
    const repo = allReposMap.get(rc.fullName || '');
    if (repo) {
      repo.commits = rc.count;
    }
  });

  // Build language stats
  // Prefer actual LOC data from commit file stats if available
  const totalLangSize = Array.from(langSizeMap.values()).reduce((sum, l) => sum + l.size, 0) || 1;
  const totalLangLoc = Array.from(langLocMap.values()).reduce((sum, loc) => sum + loc, 0) || 0;
  const hasLocData = totalLangLoc > 0;

  // If we have LOC data, build stats from langLocMap; otherwise use langSizeMap
  let languageStats: LanguageStats[];

  if (hasLocData) {
    // Use actual LOC data from commit file stats
    languageStats = Array.from(langLocMap.entries())
      .map(([name, loc]) => {
        // Try to get color from langSizeMap, or use default
        const sizeData = langSizeMap.get(name);
        return {
          name,
          color: sizeData?.color || '#8b949e',
          size: sizeData?.size || 0,
          loc,
          percentage: (loc / totalLangLoc) * 100,
          repoCount: sizeData?.repos.size || 0,
        };
      })
      .sort((a, b) => b.loc - a.loc);
  } else {
    // Fallback: estimate LOC based on repo language size
    languageStats = Array.from(langSizeMap.entries())
      .map(([name, data]) => {
        const percentage = (data.size / totalLangSize) * 100;
        const estimatedLoc = linesAdded > 0 ? Math.round((data.size / totalLangSize) * linesAdded) : 0;
        return {
          name,
          color: data.color,
          size: data.size,
          loc: estimatedLoc,
          percentage,
          repoCount: data.repos.size,
        };
      })
      .sort((a, b) => b.size - a.size);
  }

  const allRepos = Array.from(allReposMap.values())
    .sort((a, b) => b.commits - a.commits || new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime());

  return {
    totalCommits,
    totalContributions,
    restrictedContributions: totalRestrictedContributions,
    dailyContributions: allDailyContributions.sort((a, b) => a.date.localeCompare(b.date)),
    repositoryContributions,
    commits,
    pullRequests: totalPRs,
    pullRequestReviews: totalReviews,
    issues: totalIssues,
    linesAdded,
    linesDeleted,
    followers: userInfo.followers,
    following: userInfo.following,
    publicRepos: userInfo.publicRepos,
    privateRepos: userInfo.privateRepos,
    totalRepos: userInfo.totalRepos,
    createdAt: userInfo.createdAt,
    bio: userInfo.bio,
    company: userInfo.company,
    location: userInfo.location,
    avatarUrl: userInfo.avatarUrl,
    languageStats,
    allRepos,
    organizations,
    missingScopes,
    tokenType,
  };
}

// Map file extensions to language names
const EXT_TO_LANG: Record<string, string> = {
  'py': 'Python', 'go': 'Go', 'rs': 'Rust', 'js': 'JavaScript',
  'ts': 'TypeScript', 'tsx': 'TypeScript', 'jsx': 'JavaScript',
  'sh': 'Shell', 'bash': 'Shell', 'zsh': 'Shell',
  'md': 'Markdown', 'mdx': 'Markdown',
  'cpp': 'C++', 'cc': 'C++', 'cxx': 'C++', 'hpp': 'C++',
  'c': 'C', 'h': 'C',
  'java': 'Java', 'kt': 'Kotlin',
  'html': 'HTML', 'htm': 'HTML',
  'css': 'CSS', 'scss': 'SCSS', 'sass': 'Sass', 'less': 'Less',
  'json': 'JSON', 'yaml': 'YAML', 'yml': 'YAML',
  'rb': 'Ruby', 'php': 'PHP', 'swift': 'Swift', 'dart': 'Dart',
  'cs': 'C#', 'scala': 'Scala', 'vue': 'Vue', 'svelte': 'Svelte',
  'ipynb': 'Jupyter Notebook', 'sql': 'SQL', 'graphql': 'GraphQL',
};

function getLanguageFromFile(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_TO_LANG[ext] || null;
}

async function fetchCommitStats(
  repos: Array<{ owner: string; name: string; branch: string }>,
  since: Date,
  until: Date,
  authorId: string,
  token: string,
  onProgress?: (message: string) => void
): Promise<{ additions: number; deletions: number; langLoc: Map<string, number> }> {
  let totalAdditions = 0;
  let totalDeletions = 0;
  const langLoc = new Map<string, number>();

  // Try to read cache
  let cache = await readCache(token);
  if (!cache) {
    cache = {
      version: '1.0',
      userId: authorId,
      username: '',
      lastUpdated: new Date().toISOString(),
      commits: {},
    };
  }

  let cacheHits = 0;
  let cacheMisses = 0;
  let cacheUpdated = false;

  // Process in batches to avoid query complexity limits
  const BATCH_SIZE = 2;
  console.log(`Starting to fetch commit stats for ${repos.length} repos in batches of ${BATCH_SIZE}`);

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(repos.length / BATCH_SIZE)}:`, batch.map(r => `${r.owner}/${r.name}`));

    // Add a small delay between batches to avoid rate limiting
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));

    // First, get commit hashes via GraphQL
    const queryParts = batch.map((repo, idx) => `
      repo${idx}: repository(owner: "${repo.owner}", name: "${repo.name}") {
        ref(qualifiedName: "${repo.branch}") {
          target {
            ... on Commit {
              history(since: "${since.toISOString()}", until: "${until.toISOString()}", author: {id: "${authorId}"}, first: 100) {
                nodes {
                  oid
                  additions
                  deletions
                }
              }
            }
          }
        }
      }
    `);

    const query = `query { ${queryParts.join('\n')} }`;

    try {
      const response = await fetch(GITHUB_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();
      console.log('GraphQL batch response:', result.errors ? 'has errors' : 'ok', result.errors || '');
      if (!result.data) {
        console.warn('No data in GraphQL response, skipping batch');
        continue;
      }

      // Process each repo in the batch
      for (let idx = 0; idx < batch.length; idx++) {
        const repo = batch[idx];
        const repoFullName = `${repo.owner}/${repo.name}`;
        const repoData = result.data[`repo${idx}`];
        const commits = repoData?.ref?.target?.history?.nodes || [];
        console.log(`Repo ${repoFullName}: ${commits.length} commits to process`);
        const cachedRepoCommits = getCachedCommits(cache, repoFullName);

        for (const commit of commits) {
          const commitHash = commit.oid;

          // Check cache first
          if (cachedRepoCommits[commitHash]) {
            const cached = cachedRepoCommits[commitHash];
            totalAdditions += cached.additions;
            totalDeletions += cached.deletions;

            // Accumulate language LOC from cached data
            for (const file of cached.files) {
              const lang = getLanguageFromFile(file.filename);
              if (lang) {
                langLoc.set(lang, (langLoc.get(lang) || 0) + file.additions);
              }
            }

            cacheHits++;
            continue;
          }

          // Cache miss - need to fetch from REST API
          cacheMisses++;

          try {
            console.log(`Fetching commit ${commitHash.slice(0, 7)} from ${repoFullName}...`);
            const commitResponse = await fetch(
              `https://api.github.com/repos/${repoFullName}/commits/${commitHash}`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/vnd.github.v3+json',
                },
              }
            );
            console.log(`Commit response: ${commitResponse.status}`);

            if (commitResponse.ok) {
              const commitData = await commitResponse.json();
              const files = commitData.files || [];

              const commitStats: CommitStats = {
                additions: commitData.stats?.additions || 0,
                deletions: commitData.stats?.deletions || 0,
                files: files.map((f: { filename: string; additions: number; deletions: number }) => ({
                  filename: f.filename,
                  additions: f.additions || 0,
                  deletions: f.deletions || 0,
                })),
              };

              totalAdditions += commitStats.additions;
              totalDeletions += commitStats.deletions;

              // Accumulate language LOC
              for (const file of commitStats.files) {
                const lang = getLanguageFromFile(file.filename);
                if (lang) {
                  langLoc.set(lang, (langLoc.get(lang) || 0) + file.additions);
                }
              }

              // Update cache
              updateCacheData(cache, repoFullName, commitHash, commitStats);
              cacheUpdated = true;
            } else {
              // Fallback to GraphQL data
              totalAdditions += commit.additions || 0;
              totalDeletions += commit.deletions || 0;
            }
          } catch (e) {
            // Fallback to GraphQL data on error
            totalAdditions += commit.additions || 0;
            totalDeletions += commit.deletions || 0;
          }

          // Small delay between REST API calls
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      onProgress?.(`Processing commits... (${cacheHits} cached, ${cacheMisses} fetched)`);
    } catch (e) {
      console.error('Error fetching commit stats batch:', e);
    }
  }

  // Save cache asynchronously (don't block return)
  if (cacheUpdated) {
    writeCache(token, cache).catch(e => console.error('Failed to save cache:', e));
  }

  console.log(`Commit stats: ${cacheHits} cache hits, ${cacheMisses} cache misses`);

  return { additions: totalAdditions, deletions: totalDeletions, langLoc };
}

async function fetchWithRestAPI(
  username: string,
  startDate: string,
  endDate: string,
  onProgress?: (message: string) => void
): Promise<ContributionData> {
  onProgress?.('Fetching public events...');

  // Use Events API - fast, gets recent activity (up to 90 days, 300 events)
  const events = await fetchUserEvents(username);

  const start = new Date(startDate);
  const end = new Date(endDate + 'T23:59:59');

  // Filter push events within date range
  const pushEvents = events.filter(e => {
    if (e.type !== 'PushEvent') return false;
    const eventDate = new Date(e.created_at);
    return eventDate >= start && eventDate <= end;
  });

  // Aggregate commits
  const commits: Commit[] = [];
  const dailyMap = new Map<string, number>();
  const repoMap = new Map<string, number>();

  pushEvents.forEach(event => {
    const repoName = event.repo.name.split('/')[1];
    const eventDate = event.created_at.substring(0, 10);
    const commitCount = event.payload.size || event.payload.commits?.length || 0;

    // Daily
    dailyMap.set(eventDate, (dailyMap.get(eventDate) || 0) + commitCount);

    // Repo
    repoMap.set(repoName, (repoMap.get(repoName) || 0) + commitCount);

    // Create commit entries
    event.payload.commits?.forEach((c: { sha: string; message: string; author: { name: string } }) => {
      commits.push({
        repo: repoName,
        hash: c.sha,
        date: event.created_at,
        author: c.author?.name || username,
        message: c.message?.split('\n')[0] || '',
        files: [],
        insertions: 0,
        deletions: 0,
        source: 'github',
      });
    });
  });

  const dailyContributions = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const repositoryContributions = Array.from(repoMap.entries())
    .map(([repo, count]) => ({ repo, count, isPrivate: false }))
    .sort((a, b) => b.count - a.count);

  const totalCommits = commits.length;

  onProgress?.(`Found ${totalCommits} commits from recent events`);

  // If events API doesn't cover the full range, warn user
  if (totalCommits === 0 || new Date(startDate) < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
    onProgress?.('Note: Events API only covers last 90 days. For full history, add a GitHub token.');
  }

  return {
    totalCommits,
    totalContributions: totalCommits,
    restrictedContributions: 0, // REST API cannot see restricted contributions
    dailyContributions,
    repositoryContributions,
    commits,
    pullRequests: 0,
    pullRequestReviews: 0,
    issues: 0,
    linesAdded: 0,
    linesDeleted: 0,
    followers: 0,
    following: 0,
    publicRepos: 0,
    privateRepos: 0,
    totalRepos: 0,
    createdAt: '',
    bio: '',
    company: '',
    location: '',
    avatarUrl: '',
    languageStats: [],
    allRepos: [],
    organizations: [],
    missingScopes: [],
    tokenType: 'none',
  };
}

async function fetchUserEvents(username: string): Promise<GitHubEvent[]> {
  const allEvents: GitHubEvent[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 3; // Max 300 events

  while (page <= maxPages) {
    const response = await fetch(
      `https://api.github.com/users/${username}/events/public?per_page=${perPage}&page=${page}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`User "${username}" not found`);
      }
      break;
    }

    const events: GitHubEvent[] = await response.json();
    if (events.length === 0) break;

    allEvents.push(...events);
    if (events.length < perPage) break;
    page++;
  }

  return allEvents;
}

interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: {
    size?: number;
    commits?: Array<{
      sha: string;
      message: string;
      author: { name: string };
    }>;
  };
}

export async function checkRateLimit(token?: string): Promise<{ remaining: number; reset: Date }> {
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('https://api.github.com/rate_limit', { headers });
  const data = await response.json();
  return {
    remaining: data.rate?.remaining || 60,
    reset: new Date((data.rate?.reset || Date.now() / 1000) * 1000),
  };
}
