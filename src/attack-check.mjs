// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 실제로 보낸 요청의 결과만 기록합니다. 심판의 판정이 아닙니다.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (config.step === 4) return runStepFourChecks(app, config);
  if (config.step === 5) return runStepFiveChecks(app, config);
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

// 4단계: B 소유의 공개 가능한 시험 메모(고정 id)를 대상으로, 계정 없이 할 수 있는 요청만 실제로 보냅니다.
// A/B 교차 점검은 실제 계정 토큰이 필요하므로 자동으로 실행하지 않고 미실행으로 남깁니다.
const B_TEST_NOTE_ID = 'b4b4b4b4-0000-4000-8000-00000000b004';

async function runStepFourChecks(app, config) {
  const notes = new URL('/api/notes', app);
  const bNote = new URL(`/api/notes/${B_TEST_NOTE_ID}`, app);
  const forged = { Authorization: `Bearer ${forgedToken(config)}` };
  return [
    { attackId: 'anonymous_list_notes', expected: '로그인 없이 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 목록 조회: ${await attempt(notes, { method: 'GET' })}` },
    { attackId: 'anonymous_read_other_note', expected: '로그인 없이 GET /api/notes/:id(B 시험 메모) 요청은 401 JSON으로 거부',
      observed: `로그인 없이 B 시험 메모 조회: ${await attempt(bNote, { method: 'GET' })}` },
    { attackId: 'anonymous_update_other_note', expected: '로그인 없이 PUT /api/notes/:id(B 시험 메모) 요청은 401 JSON으로 거부',
      observed: `로그인 없이 B 시험 메모 수정: ${await attempt(bNote, { method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'attack-check 비로그인 수정 시도', body: '' }) })}` },
    { attackId: 'forged_token_read_other_note', expected: '형식만 갖춘 가짜 토큰으로 GET /api/notes/:id(B 시험 메모) 요청은 401 JSON으로 거부',
      observed: `가짜 토큰으로 B 시험 메모 조회: ${await attempt(bNote, { method: 'GET', headers: forged })}` },
    { attackId: 'cross_owner_read_update_delete', expected: 'A 로그인 토큰으로 B 메모 GET·PUT·DELETE 요청은 모두 404로 거부',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}

// 5단계: 화면(/auth.js)에 이미 공개된 publishable key만 배포 주소에서 읽어 originalApiUrl을 직접 조회하고,
// 로그인 없이 /api/notes를 요청합니다. 키·토큰·응답 본문은 결과에 남기지 않습니다.
async function publishedKey(app) {
  try {
    const response = await fetch(new URL('/auth.js', app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    return (await response.text()).match(/\bsb_publishable_[A-Za-z0-9_-]{12,200}\b/u)?.[0] ?? null;
  } catch {
    return null;
  }
}

async function directOriginalRead(config, key) {
  let url;
  try {
    url = new URL(config.originalApiUrl);
  } catch {
    return '미실행 (aleph.config.json의 originalApiUrl이 올바른 주소가 아님)';
  }
  if (url.protocol !== 'https:' || url.search || url.hash) return '미실행 (originalApiUrl이 쿼리 없는 HTTPS 주소가 아님)';
  if (!key) return '미실행 (배포된 /auth.js에서 publishable key를 찾지 못함)';
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Accept: 'application/json' } });
  } catch (error) {
    return `요청 실패 (${error.name})`;
  }
  let data = null;
  try { data = await response.json(); } catch { /* JSON이 아니면 아래에 형식 없음으로 기록합니다. */ }
  if (Array.isArray(data)) {
    return `${data.length > 0 ? '메모가 보임' : '거부되지 않았으나 행 0건'} (HTTP ${response.status}, 행 ${data.length}건)`;
  }
  const code = typeof data?.code === 'string' ? `, 오류 코드 ${data.code.slice(0, 20)}` : '';
  return response.ok ? `거부되지 않음 (HTTP ${response.status}${code})` : `거부됨, 메모 없음 (HTTP ${response.status}${code})`;
}

async function runStepFiveChecks(app, config) {
  const key = await publishedKey(app);
  return [
    { attackId: 'original_api_direct_read', expected: '화면에 공개된 publishable key만으로 originalApiUrl을 직접 조회하면 메모 없이 거부',
      observed: `공개 키로 원본 자료 직접 조회: ${await directOriginalRead(config, key)}` },
    { attackId: 'anonymous_list_notes', expected: '로그인 없이 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 목록 조회: ${await attempt(new URL('/api/notes', app), { method: 'GET' })}` },
    { attackId: 'login_token_original_api_direct_read', expected: '로그인 사용자 토큰으로 originalApiUrl을 직접 조회해도 거부',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
    { attackId: 'login_server_function_crud', expected: '로그인한 A는 서버 함수로 자기 메모 목록·추가·수정·삭제 가능, B 메모는 404',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}
