// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 실제로 보낸 요청의 결과만 기록합니다. 심판의 판정이 아닙니다.
export async function runAttackChecks(config) {
  if (![1, 2, 3].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 2) return runStepTwoChecks(app, config);
  if (config.step === 3) return runStepThreeChecks(app, config);
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 비로그인 GET 한 번의 결과를 상태 코드와 메모 개수로만 요약합니다. 본문은 남기지 않습니다.
async function anonymousNotes(url, config) {
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch (error) {
    return { reached: false, summary: `요청 실패 (${error.name})` };
  }
  let count = 0;
  try {
    const data = await response.json();
    if (data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)) count = data.notes.length;
  } catch {
    // JSON이 아니면 메모가 없는 응답으로 기록합니다.
  }
  return { reached: true, status: response.status, count,
    summary: `HTTP ${response.status}, 가상 메모 ${count}건` };
}

async function runStepTwoChecks(app, config) {
  const file = await anonymousNotes(new URL('/data.json', app), config);
  const api = await anonymousNotes(new URL('/api/notes', app), config);
  return [
    { attackId: 'anonymous_data_json_read', expected: '비로그인 /data.json 요청에 가상 메모가 없음',
      observed: !file.reached ? `비로그인 /data.json ${file.summary}`
        : file.count > 0 ? `비로그인 /data.json에서 메모가 보임 (${file.summary})`
          : `비로그인 /data.json에서 메모가 보이지 않음 (${file.summary})` },
    { attackId: 'anonymous_api_notes_read', expected: '2단계 남은 약점: 비로그인 /api/notes 요청이 아직 열림',
      observed: !api.reached ? `비로그인 /api/notes ${api.summary}`
        : api.status === 200 && api.count > 0 ? `비로그인 /api/notes가 열려 메모가 보임 (${api.summary})`
          : `비로그인 /api/notes에서 메모가 보이지 않음 (${api.summary})` },
  ];
}

// 3단계: 로그인 없이, 또는 형식만 갖춘 가짜 토큰으로 자료 API를 요청해 거부되는지 기록합니다.
// 실제 계정의 비밀번호·토큰은 쓰지 않습니다. 가짜 토큰은 서명이 무작위라 어떤 계정으로도 통하지 않으며,
// 결과에는 토큰·응답 본문을 남기지 않고 상태 코드·오류 코드·메모 개수만 남깁니다.
function forgedToken(config) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'ES256', typ: 'JWT', kid: 'attack-check-forged' });
  const payload = encode({ iss: config.identityProvider?.issuer, aud: config.identityProvider?.audience,
    role: 'authenticated', sub: crypto.randomUUID(), iat: now, exp: now + 300 });
  const signature = Buffer.from(crypto.getRandomValues(new Uint8Array(64))).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function attempt(url, init) {
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), ...init });
  } catch (error) {
    return `요청 실패 (${error.name})`;
  }
  let data = null;
  try { data = await response.json(); } catch { /* JSON이 아니면 아래에 형식 없음으로 기록합니다. */ }
  if (response.status === 401 && typeof data?.error === 'string') {
    return `거부됨 (HTTP 401, JSON 오류 ${data.error.slice(0, 40)})`;
  }
  const shape = Array.isArray(data) ? `메모 ${data.length}건` : data && typeof data === 'object'
    ? `JSON 칸 ${Object.keys(data).slice(0, 5).join('·') || '없음'}` : 'JSON 아님';
  return `${response.ok ? '거부되지 않음' : '401 JSON이 아닌 응답'} (HTTP ${response.status}, ${shape})`;
}

async function runStepThreeChecks(app, config) {
  const notes = new URL('/api/notes', app);
  return [
    { attackId: 'anonymous_list_notes', expected: '로그인 없이 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 목록 조회: ${await attempt(notes, { method: 'GET' })}` },
    { attackId: 'anonymous_create_note', expected: '로그인 없이 POST /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 메모 추가: ${await attempt(notes, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'attack-check 비로그인 추가 시도', body: '' }) })}` },
    { attackId: 'forged_token_list_notes', expected: '형식만 갖춘 가짜 토큰으로 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `가짜 토큰으로 목록 조회: ${await attempt(notes, { method: 'GET',
        headers: { Authorization: `Bearer ${forgedToken(config)}` } })}` },
  ];
}
