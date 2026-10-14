// 11단계 탐색: 심판이 보내는 요청 모양을 관찰하려고, 서버 함수가 요청을 받을 때 Vercel 로그에 [req11] 한 줄을 남깁니다.
// 남기는 것: 메서드, 경로(쿼리 값은 뺌), 요청 헤더 이름 목록(소문자 정렬), user-agent 앞 120자,
// signature-input 헤더 값 앞 200자(있을 때만).
// 남기지 않는 것: 본문, 토큰, 쿠키, authorization 값, 쿼리 값, 그 밖의 모든 헤더 값.
// 기록은 동기로 한 번만 하고 원래 함수를 그대로 부릅니다. 기록이 실패해도 응답과 동작은 바뀌지 않습니다.
// 12단계 탐색: 응답을 보낼 때 [res12] 한 줄을 더 남깁니다(아래 logResponse).
import { randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };

const headerValue = value => (Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : null);
const DEVICE_HEADERS = ['x-aleph-device-id', 'x-aleph-timestamp', 'x-aleph-nonce', 'x-aleph-signature'];

function headerOf(request, wanted) {
  const headers = request?.headers && typeof request.headers === 'object' ? request.headers : {};
  return headerValue(Object.entries(headers).find(([name]) => name.toLowerCase() === wanted)?.[1]);
}

const pathOf = request => (typeof request?.url === 'string' ? request.url : '').split(/[?#]/u)[0].slice(0, 300);

export function logRequest(request) {
  try {
    const headers = request?.headers && typeof request.headers === 'object' ? request.headers : {};
    const names = Object.keys(headers).map(name => name.toLowerCase()).sort();
    const userAgent = headerOf(request, 'user-agent');
    const signatureInput = headerOf(request, 'signature-input');
    const entry = {
      method: typeof request?.method === 'string' ? request.method : null,
      path: pathOf(request),
      headers: names,
      userAgent: userAgent === null ? null : userAgent.slice(0, 120),
      ...(signatureInput === null ? {} : { signatureInput: signatureInput.slice(0, 200) }),
    };
    // JSON 한 줄로 남겨 값 안의 줄바꿈이 로그 줄을 나누지 못하게 합니다.
    console.log(`[req11] ${JSON.stringify(entry)}`);
  } catch {
    // 기록 실패는 무시합니다.
  }
}

// 12단계 탐색: 기록용 로그인 분류. Authorization 토큰의 iss만 서명 검증 없이 읽어
// judgeIssuer면 "judge", 학생 Supabase 발급자면 "student", 토큰이 없으면 "none", 그 밖이면 "other"입니다.
// 심판 신원은 judge일 때만 aleph_identity(a/b)를 적습니다. 이 값은 기록에만 쓰고 권한 판단에는 절대 쓰지 않습니다.
// 토큰 원문·sub·aleph_run·서명은 읽어도 남기지 않습니다.
export function classifyLogin(authorization) {
  if (typeof authorization !== 'string' || !authorization.trim()) return { login: 'none', identity: null };
  try {
    const token = /^Bearer\s+(\S+)$/u.exec(authorization.trim())?.[1];
    const payloadPart = token?.split('.')[1];
    if (!payloadPart) return { login: 'other', identity: null };
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const issuer = typeof payload?.iss === 'string' ? payload.iss : null;
    if (issuer && issuer === config.judgeIssuer) {
      return { login: 'judge', identity: ['a', 'b'].includes(payload.aleph_identity) ? payload.aleph_identity : null };
    }
    if (issuer && issuer === config.identityProvider?.issuer) return { login: 'student', identity: null };
    return { login: 'other', identity: null };
  } catch {
    return { login: 'other', identity: null };
  }
}

// [res12] 한 줄: 메서드, 경로(쿼리 값 뺌), 응답 상태 코드, 응답 JSON의 error(있을 때만), 로그인 분류, 심판 신원,
// 기기 서명 헤더 4개가 모두 있었는지. 헤더 값·본문·쿼리 값·쿠키는 남기지 않습니다.
// 12단계: 모든 api 응답에 X-Request-Id 응답 헤더를 넣습니다. 요청에 UUID 형식의 x-request-id가 있으면 그 값을 그대로,
// 없거나 형식이 아니면 randomUUID로 새로 만듭니다. 응답 상태와 본문은 바꾸지 않습니다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ATTACK_ID = /^[a-z0-9_.-]{1,80}$/u;

export function responseRequestId(request) {
  const given = headerOf(request, 'x-request-id');
  return typeof given === 'string' && UUID.test(given) ? given : randomUUID();
}

export function logResponse(request, status, body, requestId = null) {
  try {
    const { login, identity } = classifyLogin(headerOf(request, 'authorization'));
    const attackId = headerOf(request, 'x-aleph-attack-id');
    const entry = {
      method: typeof request?.method === 'string' ? request.method : null,
      ...(requestId ? { requestId } : {}),
      ...(typeof attackId === 'string' && ATTACK_ID.test(attackId) ? { attackId } : {}),
      path: pathOf(request),
      status: Number.isInteger(status) ? status : null,
      ...(body && typeof body === 'object' && typeof body.error === 'string' ? { error: body.error.slice(0, 80) } : {}),
      login,
      ...(login === 'judge' ? { identity } : {}),
      deviceSigned: DEVICE_HEADERS.every(name => {
        const value = headerOf(request, name);
        return typeof value === 'string' && value.length > 0;
      }),
    };
    console.log(`[res12] ${JSON.stringify(entry)}`);
  } catch {
    // 기록 실패는 무시합니다.
  }
}

// 응답 객체의 status·json을 그대로 부르면서 상태 코드와 error만 옆에서 읽습니다. 응답 내용은 바꾸지 않습니다.
function watchResponse(request, response, requestId) {
  if (!response || typeof response !== 'object' || typeof response.json !== 'function') return;
  let status = null;
  let logged = false;
  if (typeof response.status === 'function') {
    const originalStatus = response.status;
    response.status = function status12(code) {
      status = code;
      return originalStatus.apply(this, arguments);
    };
  }
  const originalJson = response.json;
  response.json = function json12(body) {
    const result = originalJson.apply(this, arguments);
    if (!logged) {
      logged = true;
      logResponse(request, status ?? response.statusCode, body, requestId);
    }
    return result;
  };
}

export function withRequestLog(handler) {
  return function loggedHandler(request, response) {
    logRequest(request);
    let requestId = null;
    try {
      requestId = responseRequestId(request);
      if (typeof response?.setHeader === 'function') response.setHeader('X-Request-Id', requestId);
    } catch { /* 응답 헤더를 못 붙여도 동작은 그대로입니다. */ }
    try { watchResponse(request, response, requestId); } catch { /* 감싸기 실패는 무시합니다. */ }
    return handler(request, response);
  };
}
