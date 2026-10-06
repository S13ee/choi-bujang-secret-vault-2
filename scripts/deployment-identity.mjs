const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;
const ROUTE = /^(?:GET|POST|PUT|PATCH|DELETE) \/[A-Za-z0-9/_:.-]{0,200}$/u;

// 원본 자료 주소: 쿼리·해시·계정 정보 없는 HTTPS 주소만 받습니다.
function isOriginalApiUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && !url.search && !url.hash && !value.includes('?') && !value.includes('#');
  } catch {
    return false;
  }
}

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step) || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)
      || (config.allowedRoutes !== undefined && (!Array.isArray(config.allowedRoutes)
        || config.allowedRoutes.length > 50
        || config.allowedRoutes.some(route => typeof route !== 'string' || !ROUTE.test(route))))
      // 5단계부터는 필수이고, 그 전이라도 값이 있으면 형식을 검사합니다.
      || ((config.step >= 5 || (config.originalApiUrl !== undefined && config.originalApiUrl !== null))
        && !isOriginalApiUrl(config.originalApiUrl))) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 aleph.config.json의 step을 확인하세요.');
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    // 5단계부터 허용 경로도 함께 기록합니다. 설정에 없으면 넣지 않습니다.
    ...(Array.isArray(config.allowedRoutes) ? { allowedRoutes: [...config.allowedRoutes] } : {}),
    // 5단계부터 원본 자료 주소도 함께 기록합니다. 설정에 없으면 넣지 않습니다.
    ...(typeof config.originalApiUrl === 'string' ? { originalApiUrl: config.originalApiUrl } : {}),
  };
}
