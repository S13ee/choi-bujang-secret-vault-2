// 5단계 보완: 로그인·토큰 갱신·로그아웃을 서버 함수에서 처리합니다.
// 브라우저 코드에는 Supabase 주소·공개 키·SDK가 없고, 이 파일만 환경변수
// SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY로 Supabase Auth 공식 SDK를 부릅니다.
// - access token은 응답 JSON으로 화면에 넘기고, 화면은 이것으로 /api/notes를 부릅니다.
// - refresh token은 화면 코드가 읽을 수 없는 HttpOnly 쿠키(Path=/api/auth)로만 둡니다.
// - 비밀번호·토큰은 로그에 남기지 않습니다. 실패 로그에는 오류 코드만 남깁니다.
import { createClient } from '@supabase/supabase-js';

const COOKIE = 'byteback_refresh';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const EMAIL_MAX = 320;
const PASSWORD_MAX = 1024;
const REFRESH_MAX = 4096;

const send = (response, status, body) => response.status(status).json(body);

function refreshCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(request) {
  const header = request.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=') || null;
  }
  return null;
}

function readJson(request) {
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// 환경변수를 확인하고 요청마다 세션을 저장하지 않는 Auth 클라이언트를 만듭니다.
function authClient(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    return null;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url?.startsWith('https://') || !key) {
    console.error('auth: SUPABASE_URL 또는 SUPABASE_PUBLISHABLE_KEY 환경변수가 없습니다.');
    send(response, 500, { error: 'AUTH_NOT_CONFIGURED' });
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// 화면에 넘길 값만 고릅니다. refresh token은 쿠키로만 보냅니다.
function sendSession(response, session) {
  response.setHeader('Set-Cookie', refreshCookie(encodeURIComponent(session.refresh_token), COOKIE_MAX_AGE));
  send(response, 200, {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
    email: session.user?.email ?? null,
  });
}

function authFailed(response, error, label) {
  console.error(`auth: ${label} 실패`, error?.code ?? error?.name ?? 'unknown');
  const status = error?.status === 429 ? 429 : error?.status >= 500 || !error?.status ? 502 : 401;
  send(response, status, { error: 'AUTH_FAILED', code: typeof error?.code === 'string' ? error.code : null });
}

// POST /api/auth/login  {email, password}
export async function handleLogin(request, response) {
  const supabase = authClient(request, response);
  if (!supabase) return;
  const input = readJson(request);
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!email || email.length > EMAIL_MAX || !password || password.length > PASSWORD_MAX) {
    return send(response, 400, { error: 'INVALID_LOGIN_INPUT', code: 'validation_failed' });
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return authFailed(response, error, '로그인');
    return sendSession(response, data.session);
  } catch (error) {
    return authFailed(response, error, '로그인');
  }
}

// POST /api/auth/refresh  (본문 없음, HttpOnly 쿠키의 refresh token 사용)
export async function handleRefresh(request, response) {
  const supabase = authClient(request, response);
  if (!supabase) return;
  let token = readCookie(request);
  try { token = token && decodeURIComponent(token); } catch { token = null; }
  if (!token || token.length > REFRESH_MAX) {
    response.setHeader('Set-Cookie', refreshCookie('', 0));
    return send(response, 401, { error: 'NO_SESSION' });
  }
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
    if (error || !data?.session) {
      response.setHeader('Set-Cookie', refreshCookie('', 0));
      return authFailed(response, error, '토큰 갱신');
    }
    return sendSession(response, data.session);
  } catch (error) {
    response.setHeader('Set-Cookie', refreshCookie('', 0));
    return authFailed(response, error, '토큰 갱신');
  }
}

// POST /api/auth/logout  (Authorization: Bearer <access token>)
// 쿠키는 항상 지우고, access token이 있으면 Supabase에서도 이 세션을 끝냅니다.
export async function handleLogout(request, response) {
  const supabase = authClient(request, response);
  if (!supabase) return;
  response.setHeader('Set-Cookie', refreshCookie('', 0));
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.exec(request.headers?.authorization ?? '');
  if (match) {
    try {
      const { error } = await supabase.auth.admin.signOut(match[1], 'local');
      if (error) console.error('auth: 로그아웃 세션 종료 실패', error.code ?? 'unknown');
    } catch (error) {
      console.error('auth: 로그아웃 세션 종료 실패', error?.name ?? 'unknown');
    }
  }
  return send(response, 200, { ok: true });
}
