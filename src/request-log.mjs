// 11단계 탐색: 심판이 보내는 요청 모양을 관찰하려고, 서버 함수가 요청을 받을 때 Vercel 로그에 [req11] 한 줄을 남깁니다.
// 남기는 것: 메서드, 경로(쿼리 값은 뺌), 요청 헤더 이름 목록(소문자 정렬), user-agent 앞 120자,
// signature-input 헤더 값 앞 200자(있을 때만).
// 남기지 않는 것: 본문, 토큰, 쿠키, authorization 값, 쿼리 값, 그 밖의 모든 헤더 값.
// 기록은 동기로 한 번만 하고 원래 함수를 그대로 부릅니다. 기록이 실패해도 응답과 동작은 바뀌지 않습니다.
const headerValue = value => (Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : null);

export function logRequest(request) {
  try {
    const headers = request?.headers && typeof request.headers === 'object' ? request.headers : {};
    const names = Object.keys(headers).map(name => name.toLowerCase()).sort();
    const find = wanted => headerValue(Object.entries(headers).find(([name]) => name.toLowerCase() === wanted)?.[1]);
    const userAgent = find('user-agent');
    const signatureInput = find('signature-input');
    const url = typeof request?.url === 'string' ? request.url : '';
    const entry = {
      method: typeof request?.method === 'string' ? request.method : null,
      path: url.split(/[?#]/u)[0].slice(0, 300),
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

export function withRequestLog(handler) {
  return function loggedHandler(request, response) {
    logRequest(request);
    return handler(request, response);
  };
}
