// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 실제로 보낸 요청의 결과만 기록합니다. 심판의 판정이 아닙니다.
// 12단계: 심판 격리 환경에서는 node:fs·node:path·node:url·node:child_process·node:crypto만 쓸 수 있어 step 12 점검은 node:crypto만 씁니다.
import { createHash, randomUUID } from 'node:crypto';

export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (config.step === 6) return runStepSixChecks(app, config);
  if (config.step === 7) return runStepSevenChecks(app, config);
  if (config.step === 8) return runStepEightChecks(app, config);
  if (config.step === 9) return runStepNineChecks(app, config);
  if (config.step === 10) return runStepTenChecks(app, config);
  if (config.step === 11) return runStepElevenChecks(app, config);
  // 12단계: 제출 묶음은 읽기 요청(GET·HEAD)만 보낼 수 있어 11단계 사슬을 다시 쓰지 않고 전용 점검을 씁니다.
  if (config.step === 12) return runStepTwelveChecks(app, config);
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

// 5단계: 키·토큰 없이 originalApiUrl을 직접 조회하고, 로그인 없이 /api/notes를 요청합니다.
// 5단계 보완 뒤 화면 코드에는 Supabase 키가 없으므로 키를 찾거나 보내지 않습니다. 응답 본문은 결과에 남기지 않습니다.
async function directOriginalRead(config) {
  let url;
  try {
    url = new URL(config.originalApiUrl);
  } catch {
    return '미실행 (aleph.config.json의 originalApiUrl이 올바른 주소가 아님)';
  }
  if (url.protocol !== 'https:' || url.search || url.hash) return '미실행 (originalApiUrl이 쿼리 없는 HTTPS 주소가 아님)';
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' } });
  } catch (error) {
    // 주소를 찾지 못함(ENOTFOUND) 같은 원인 코드만 남기고, 메모가 보이지 않았다고 판단하지는 않습니다.
    return `요청 실패, 판단 불가 (${typeof error.cause?.code === 'string' ? error.cause.code.slice(0, 30) : error.name})`;
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
  return [
    { attackId: 'original_api_direct_read', expected: '키·토큰 없이 originalApiUrl을 직접 조회하면 메모 없이 거부',
      observed: `키 없이 원본 자료 직접 조회: ${await directOriginalRead(config)}` },
    { attackId: 'anonymous_list_notes', expected: '로그인 없이 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 목록 조회: ${await attempt(new URL('/api/notes', app), { method: 'GET' })}` },
    { attackId: 'login_token_original_api_direct_read', expected: '로그인 사용자 토큰으로 originalApiUrl을 직접 조회해도 거부',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
    { attackId: 'login_server_function_crud', expected: '로그인한 A는 서버 함수로 자기 메모 목록·추가·수정·삭제 가능, B 메모는 404',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}

// 6단계: 5단계 점검을 그대로 다시 보냅니다. 기기 등록 판정은 반 엔진과 판정기(src/decider.mjs) 몫이고,
// 미등록 기기로 들어오는 공격은 심판이 맡으므로 여기서는 보내지 않고 미실행으로 남깁니다.
async function runStepSixChecks(app, config) {
  return [
    ...await runStepFiveChecks(app, config),
    { attackId: 'unregistered_device_access', expected: '미등록 기기의 자료실 요청은 deny·device_not_registered로 거부',
      observed: '미실행, 심판이 확인 (학생 점검에는 미등록 기기로 접속할 수단이 없음. 로컬 가상 요청 연습은 npm run decider:test)' },
  ];
}

// 7단계: 6단계 점검을 그대로 다시 보냅니다. 평소와 다른 접속의 재인증 전 차단은 반 엔진이 판정기의 step_up을 받아
// 처리하므로, 엔진이 연결되지 않은 학생 점검에서는 보내지 않고 미실행으로 남깁니다. 토큰 원문은 쓰지 않습니다.
async function runStepSevenChecks(app, config) {
  return [
    ...await runStepSixChecks(app, config),
    { attackId: 'unusual_access_before_step_up', expected: '평소와 다른 접속은 새 로그인 확인 전 자료 없이 step_up·step_up_required, 재인증 뒤 다시 판정',
      observed: '미실행, 엔진 연결 필요 (로컬 가상 요청 연습은 npm run decider:test, npm run fixture:7)' },
  ];
}

// 8단계: 7단계 점검에 더해, 로그인 없이 공지 목록과 강사 관리 경로를 실제로 요청해 거부되는지 기록합니다.
// 대상 공지는 공개 가능한 가상 시험 공지(고정 id)입니다. 로그인이 필요한 교차 점검은 미실행으로 남깁니다.
const TEST_NOTICE_ID = 'c8c8c8c8-0000-4000-8000-00000000c008';

async function runStepEightChecks(app, config) {
  return [
    ...await runStepSevenChecks(app, config),
    { attackId: 'anonymous_list_notices', expected: '로그인 없이 GET /api/notices 요청은 401 JSON으로 거부',
      observed: `로그인 없이 공지 목록 조회: ${await attempt(new URL('/api/notices', app), { method: 'GET' })}` },
    { attackId: 'anonymous_admin_notice_update', expected: '로그인 없이 PUT /api/admin/notices/:id 요청은 401 JSON으로 거부',
      observed: `로그인 없이 관리 경로로 공지 수정: ${await attempt(new URL(`/api/admin/notices/${TEST_NOTICE_ID}`, app), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'attack-check 비로그인 수정 시도', body: '', role: 'instructor' }) })}` },
    { attackId: 'student_admin_notice_update', expected: '강사 목록에 없는 학생 A 토큰으로 PUT /api/admin/notices/:id 요청은 403 NOT_INSTRUCTOR',
      observed: '미실행, 화면 밖에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
    { attackId: 'cross_resource_id', expected: '로그인한 A가 메모 경로에 공지 id, 공지 경로에 메모 id를 넣으면 각각 404',
      observed: '미실행, 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}

// 9단계: 8단계 점검을 그대로 다시 보냅니다. 다량 조회 탐지(src/detect.mjs)의 회수 제안을 집행하는 일과
// 회수까지 걸린 시간은 반 엔진과 심판이 맡으므로, 학생 점검에서는 보내지 않고 미실행으로 남깁니다.
// 자기 점검이 배포 주소로 다량 조회를 보내지는 않습니다.
async function runStepNineChecks(app, config) {
  return [
    ...await runStepEightChecks(app, config),
    { attackId: 'burst_read_revocation', expected: '같은 사용자가 10분 안에 GET 121건 이상이면 burst_read 회수 제안 뒤 그 접속 권한이 회수됨',
      observed: '미실행, 엔진 연결 필요 (실제 회수와 경과 시간은 심판이 확인. 로컬 가상 사건 연습은 npm run detect:test)' },
  ];
}

// 10단계: 9단계 점검에 더해, 로그인 없이 복구 경로(POST /api/notes/:id/restore)를 실제로 보내 거부되는지 기록합니다.
// 대상은 B 소유의 공개 가능한 시험 메모(고정 id)이며, 본문에 owner_id·내용을 넣어도 서버는 읽지 않아야 합니다.
// 로그인이 필요한 복구 시험(B의 복구, A가 B 메모 복구)은 실제 계정 토큰이 필요해 미실행으로 남깁니다.
async function runStepTenChecks(app, config) {
  return [
    ...await runStepNineChecks(app, config),
    { attackId: 'anonymous_note_restore', expected: '로그인 없이 POST /api/notes/:id/restore 요청은 401 JSON으로 거부',
      observed: `로그인 없이 B 시험 메모 복구: ${await attempt(new URL(`/api/notes/${B_TEST_NOTE_ID}/restore`, app), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: '00000000-0000-4000-8000-000000000000', title: 'attack-check', body: '' }) })}` },
    { attackId: 'owner_note_restore', expected: 'B 토큰으로 B 메모를 고치거나 지운 뒤 복구하면 200, 처음 만든 내용·소유자·지문이 사본과 같음',
      observed: '미실행, 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
    { attackId: 'cross_owner_note_restore', expected: 'A 토큰으로 B 메모 복구는 404 BACKUP_NOT_FOUND, B 메모는 그대로',
      observed: '미실행, 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}

// 11단계: 10단계 점검에 더해, 로그인 없이 GET /api/devices/status를 실제로 보내 401로 거부되는지 기록합니다.
// 기기 등록·승인과 승인된 기기의 서명 요청은 실제 계정 토큰과 브라우저 기기 키가 필요해 미실행으로 남깁니다.
async function runStepElevenChecks(app, config) {
  return [
    ...await runStepTenChecks(app, config),
    { attackId: 'anonymous_device_status', expected: '로그인 없이 GET /api/devices/status 요청은 401 JSON으로 거부',
      observed: `로그인 없이 기기 상태 조회: ${await attempt(new URL('/api/devices/status', app), { method: 'GET' })}` },
    { attackId: 'unapproved_device_data', expected: '로그인했지만 승인되지 않은 기기의 보호 자료 요청은 403 DEVICE_NOT_APPROVED, 서명 없으면 401 DEVICE_SIGNATURE_REQUIRED',
      observed: '미실행, 직접 확인 (실제 계정 토큰과 브라우저 기기 키가 필요해 자동 점검하지 않음)' },
    { attackId: 'approved_device_signed_access', expected: '비밀번호 재확인으로 승인된 기기의 서명 요청만 기존 자료를 받음',
      observed: '미실행, 화면에서 직접 확인 (실제 계정의 비밀번호·토큰이 필요해 자동 점검하지 않음)' },
  ];
}

// 12단계: 심판이 격리 환경에서 npm run bundle을 실행하므로, 공개 HTTPS 주소(publicAppUrl·originalApiUrl)에
// GET·HEAD 요청만 보냅니다. 쓰기 요청·로그인·기기 서명·엔진이 필요한 점검은 요청을 보내지 않고 observed를 "not_run"으로 두며,
// 이유는 expected에 적습니다. node:crypto(randomUUID·sha256 hex)만 쓰고 Buffer·전역 crypto는 쓰지 않습니다.
const NOT_RUN = 'not_run';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// ASCII JSON만 넣으므로 문자 코드를 바이트로 바로 써서 base64url로 바꿉니다.
function asciiBase64url(text) {
  let out = '';
  for (let index = 0; index < text.length; index += 3) {
    const [a, b, c] = [text.charCodeAt(index), text.charCodeAt(index + 1), text.charCodeAt(index + 2)];
    const triple = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64URL[(triple >> 18) & 63] + B64URL[(triple >> 12) & 63];
    if (index + 1 < text.length) out += B64URL[(triple >> 6) & 63];
    if (index + 2 < text.length) out += B64URL[triple & 63];
  }
  return out;
}

// 형식만 갖춘 가짜 토큰(서명은 무작위 sha256 두 개). 어떤 계정으로도 통하지 않으며 결과에 토큰을 남기지 않습니다.
function readOnlyForgedToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = asciiBase64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'attack-check-forged' }));
  const payload = asciiBase64url(JSON.stringify({ iss: config.identityProvider?.issuer, aud: config.identityProvider?.audience,
    role: 'authenticated', sub: randomUUID(), iat: now, exp: now + 300 }));
  // 심판 격리 환경의 node:crypto는 sha256 결과를 hex로만 줍니다. hex 글자는 base64url 글자 범위 안이라 이어 붙여 씁니다.
  const signature = createHash('sha256').update(randomUUID()).digest('hex')
    + createHash('sha256').update(randomUUID()).digest('hex');
  return `${header}.${payload}.${signature}`;
}

async function headStatus(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) });
    return `HTTP ${response.status}`;
  } catch (error) {
    return `요청 실패 (${error.name})`;
  }
}

async function runStepTwelveChecks(app, config) {
  const bNote = new URL(`/api/notes/${B_TEST_NOTE_ID}`, app);
  const get = (url, headers) => attempt(url, { method: 'GET', ...(headers ? { headers } : {}) });
  return [
    { attackId: 'original_api_direct_read', expected: '키·토큰 없이 originalApiUrl을 직접 GET하면 메모 없이 거부',
      observed: `키 없이 원본 자료 직접 조회: ${await directOriginalRead(config)}` },
    { attackId: 'anonymous_list_notes', expected: '로그인 없이 GET /api/notes 요청은 401 JSON으로 거부',
      observed: `로그인 없이 목록 조회: ${await get(new URL('/api/notes', app))}` },
    { attackId: 'anonymous_read_other_note', expected: '로그인 없이 GET /api/notes/:id(B 시험 메모) 요청은 401 JSON으로 거부',
      observed: `로그인 없이 B 시험 메모 조회: ${await get(bNote)}` },
    { attackId: 'forged_token_read_other_note', expected: '형식만 갖춘 가짜 토큰으로 GET /api/notes/:id(B 시험 메모) 요청은 401 JSON으로 거부',
      observed: `가짜 토큰으로 B 시험 메모 조회: ${await get(bNote, { Authorization: `Bearer ${readOnlyForgedToken(config)}` })}` },
    { attackId: 'query_appended_note_read', expected: '쿼리를 붙인 GET /api/notes/:id?x=1(로그인 없음)도 401 JSON으로 거부',
      observed: `쿼리를 붙인 B 시험 메모 조회: ${await get(new URL(`/api/notes/${B_TEST_NOTE_ID}?x=1`, app))}` },
    { attackId: 'anonymous_list_notices', expected: '로그인 없이 GET /api/notices 요청은 401 JSON으로 거부',
      observed: `로그인 없이 공지 목록 조회: ${await get(new URL('/api/notices', app))}` },
    { attackId: 'anonymous_device_status', expected: '로그인 없이 GET /api/devices/status 요청은 401 JSON으로 거부',
      observed: `로그인 없이 기기 상태 조회: ${await get(new URL('/api/devices/status', app))}` },
    { attackId: 'public_data_json_head', expected: '공개 /data.json은 없어야 함(HEAD 요청, 404 기대)',
      observed: `HEAD /data.json: ${await headStatus(new URL('/data.json', app))}` },
    { attackId: 'anonymous_create_note', expected: '로그인 없이 POST /api/notes는 401이어야 함. 쓰기 요청이라 제출 묶음에서는 보내지 않음', observed: NOT_RUN },
    { attackId: 'anonymous_admin_notice_update', expected: '로그인 없이 PUT /api/admin/notices/:id는 401이어야 함. 쓰기 요청이라 제출 묶음에서는 보내지 않음', observed: NOT_RUN },
    { attackId: 'anonymous_note_restore', expected: '로그인 없이 POST /api/notes/:id/restore는 401이어야 함. 쓰기 요청이라 제출 묶음에서는 보내지 않음', observed: NOT_RUN },
    { attackId: 'login_token_original_api_direct_read', expected: '로그인 사용자 토큰으로 originalApiUrl 직접 조회도 거부. 실제 계정 토큰이 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'cross_owner_access', expected: 'A가 B 메모 GET·PUT·DELETE·복구는 404, 메모·공지 id 교차도 404. 실제 계정 토큰과 기기 서명이 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'student_admin_notice_update', expected: '강사 목록에 없는 학생의 관리 경로 수정은 403 NOT_INSTRUCTOR. 로그인과 쓰기 요청이 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'unapproved_device_data', expected: '승인되지 않은 기기의 보호 자료 요청은 403 DEVICE_NOT_APPROVED. 실제 계정 토큰과 브라우저 기기 키가 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'unregistered_device_access', expected: '미등록 기기의 자료실 요청은 deny·device_not_registered. 엔진과 심판이 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'unusual_access_before_step_up', expected: '평소와 다른 접속은 재인증 전 step_up. 엔진이 필요해 보내지 않음', observed: NOT_RUN },
    { attackId: 'burst_read_revocation', expected: '10분 안에 GET 121건 이상이면 burst_read 회수. 엔진과 심판이 필요하고 다량 요청이라 보내지 않음', observed: NOT_RUN },
  ];
}
