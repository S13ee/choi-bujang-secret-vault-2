// 12단계 제작 1: 탈환 작전실 화면입니다. 승인된 기기로 자료실이 열린 뒤에만 보입니다.
// - 요약(판정기 규칙 수·탐지 규칙·복구 버전)은 빌드가 저장소 파일에서 만든 /ops-summary.json을 그대로 보여 줍니다.
// - 기록표는 시험 목록(./ops-catalog.js, 서버 목록과 같은 사본)으로 「점검 실행」을 눌렀을 때 그 자리에서 요청을 보내고,
//   받은 응답만 그립니다. 요청마다 새 요청 ID를 X-Request-Id에, attackId를 X-Aleph-Attack-Id에 넣어 서버 [res12] 기록과 같은 ID가 됩니다.
// - GET·HEAD만 보냅니다. 쓰기·엔진·별도 계정이 필요한 항목과 요청이 나가지 못한 항목은 「미실행」이고 결과 칸은 비웁니다.
// - 수치는 행을 센 값뿐이며 미실행을 성공으로 세지 않습니다. 회수 상태는 실제 /api/devices/status 응답에서만 읽습니다.
// - 응답 본문은 error 값과(내 메모 목록의) id, 기기 상태만 읽고 화면에 그리지 않습니다. 메모 본문·토큰은 표시·저장하지 않습니다.
// - 기기 키·토큰·자료를 브라우저 저장소·쿠키·캐시에 넣지 않습니다.
import { OPS_CATALOG } from './ops-catalog.js';

const SAFE_ERROR = /^[A-Za-z0-9_.-]{1,60}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RESPONSE_ID_NAME = /request-id|request_id|trace-id|correlation-id/u;
const DEVICE_STATUSES = ['pending', 'approved', 'revoked'];

const b64url = text => btoa(text).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
function forgedToken(identity) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'ops-room-forged' }));
  const payload = b64url(JSON.stringify({ iss: identity?.issuer, aud: identity?.audience, role: 'authenticated',
    sub: crypto.randomUUID(), iat: now, exp: now + 300 }));
  const signature = [...crypto.getRandomValues(new Uint8Array(64))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${header}.${payload}.${signature}`;
}

function responseIds(response, requestId) {
  try {
    const rank = name => (/request[-_]id/u.test(name) ? 0 : name === 'x-vercel-id' ? 1 : 2);
    return [...(response.headers?.entries?.() ?? [])]
      .map(([name, value]) => [String(name).toLowerCase(), String(value ?? '')])
      .filter(([name, value]) => (RESPONSE_ID_NAME.test(name) || name === 'x-vercel-id') && value && value !== requestId)
      .sort((a, b) => rank(a[0]) - rank(b[0])).slice(0, 3)
      .map(([name, value]) => `${name}:${value.replace(/[\s,]/gu, '_').slice(0, 80)}`).join(',') || null;
  } catch {
    return null;
  }
}

export function countRows(rows) {
  return {
    rows: rows.length,
    executed: rows.filter(row => row.executed === '실행').length,
    notRun: rows.filter(row => row.executed === '미실행').length,
    statusMatched: rows.filter(row => row.statusMatches === true).length,
    statusMismatched: rows.filter(row => row.statusMatches === false).length,
  };
}

// 시험 목록대로 요청을 보내 기록표 행을 만듭니다. plainFetch(url, init)는 로그인 없는 요청, signedFetch(path, init)는 로그인 + 기기 서명 요청입니다.
export async function runOpsRows({ catalog = OPS_CATALOG, summary, origin, plainFetch, signedFetch }) {
  const rows = [];
  let ownNoteId = null;
  let deviceStatus = null;
  for (const item of catalog) {
    const base = { attackId: item.attackId, step: item.step, kind: item.kind === 'normal' ? '정상' : '금지', expected: item.expected,
      expectStatus: item.expectStatus ? [...item.expectStatus] : null };
    const notRun = reason => rows.push({ ...base, executed: '미실행', status: null, error: null, requestId: null, responseIds: null,
      checkedAt: null, method: null, url: null, statusMatches: null, notRunReason: reason });
    const run = item.run;
    if (!run || !['GET', 'HEAD'].includes(run.method)) { notRun(item.notRunReason ?? '보낼 요청이 없음'); continue; }
    let path = run.path;
    if (path?.includes(':ownNoteId')) {
      if (!ownNoteId) { notRun('내 메모 id를 얻지 못해 보내지 않음'); continue; }
      path = path.replace(':ownNoteId', ownNoteId);
    }
    let target;
    try {
      target = run.target === 'original' ? new URL(summary?.originalApiUrl) : new URL(path, origin);
    } catch {
      notRun('요청 주소를 만들 수 없음'); continue;
    }
    if (target.protocol !== 'https:' && run.target === 'original') { notRun('원본 주소가 HTTPS가 아님'); continue; }
    if (run.auth === 'device' && typeof signedFetch !== 'function') { notRun('로그인 + 승인된 기기가 없어 보내지 않음'); continue; }
    const requestId = crypto.randomUUID();
    const headers = { 'X-Request-Id': requestId, 'X-Aleph-Attack-Id': item.attackId,
      ...(run.target === 'original' ? { Accept: 'application/json' } : {}),
      ...(run.auth === 'forged' ? { Authorization: `Bearer ${forgedToken(summary?.identity)}` } : {}) };
    let response;
    try {
      response = run.auth === 'device'
        ? await signedFetch(path, { method: run.method, headers })
        : await plainFetch(target.href, { method: run.method, headers, cache: 'no-store', redirect: 'error' });
    } catch {
      notRun('요청이 나가지 못했거나 응답을 받지 못함(not_run)'); continue;
    }
    const checkedAt = new Date().toISOString();
    let error = null;
    if (run.method === 'GET') {
      try {
        const data = await response.json();
        if (typeof data?.error === 'string' && SAFE_ERROR.test(data.error)) error = data.error;
        // 본문에서는 아래 두 값만 읽고, 나머지(메모 제목·본문 등)는 쓰지 않습니다.
        if (item.attackId === 'own_list_notes' && Array.isArray(data)) {
          ownNoteId = data.map(note => note?.id).find(id => typeof id === 'string' && UUID.test(id)) ?? null;
        }
        if (item.attackId === 'own_device_status' && DEVICE_STATUSES.includes(data?.status)) deviceStatus = data.status;
      } catch { /* JSON이 아니면 error를 적지 않습니다. */ }
    }
    rows.push({ ...base, executed: '실행', status: response.status, error, requestId, responseIds: responseIds(response, requestId),
      checkedAt, method: run.method, url: target.href,
      statusMatches: item.expectStatus ? item.expectStatus.includes(response.status) : null, notRunReason: null });
  }
  return { rows, counts: countRows(rows), deviceStatus };
}

// ---------------------------------------------------------------------------------------------
// 화면. root가 없으면(시험용 가짜 화면 등) 아무것도 하지 않습니다. 요청은 「점검 실행」 버튼을 눌렀을 때만 보냅니다.
// ---------------------------------------------------------------------------------------------
const DEVICE_LABEL = { approved: '승인됨(서버 응답)', pending: '승인 대기(서버 응답)', revoked: '회수됨(서버 응답)' };

export function createOpsRoom({ root, signedFetch }) {
  if (!root || typeof root.append !== 'function') return { show() {}, clear() {} };
  const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const summaryList = el('dl');
  const runButton = el('button', '작전실 점검 실행');
  runButton.type = 'button';
  const counts = el('p', '점검 실행 전입니다. 결과 칸은 실제 요청 뒤에만 채워집니다.');
  const table = el('table');
  const head = el('thead');
  const headRow = el('tr');
  for (const name of ['attackId', '단계', '구분', '기대 결과', '실제 API 결과', '요청 ID', '확인 시각', '실행 여부']) headRow.append(el('th', name));
  head.append(headRow);
  const body = el('tbody');
  table.append(head, body);
  root.replaceChildren(el('h2', '탈환 작전실'), summaryList, runButton, counts, table);
  let summary = null;
  let generation = 0;

  const term = (name, value) => summaryList.append(el('dt', name), el('dd', value));
  function drawSummary(deviceStatus) {
    summaryList.replaceChildren();
    if (!summary) { term('요약', '/ops-summary.json을 읽지 못함(미확인)'); return; }
    term('판정기 규칙 수', `${summary.decider.ruleCount}개 (src/decider.mjs RULE_IDS)`);
    term('탐지 규칙', `${summary.detect.reasonCodes.join(', ') || '없음'}${summary.detect.burstLimit ? ` · 같은 사용자 GET이 10분 구간에 ${summary.detect.burstLimit}건 초과면 회수 제안` : ''}`);
    term('회수 상태(이 기기)', deviceStatus ? DEVICE_LABEL[deviceStatus] : '점검 실행 전 또는 응답 없음(미확인)');
    term('엔진의 회수 집행', '이 화면에서 확인할 수 없음(미확인, ALEPH SDP 엔진·심판 몫)');
    term('복구 버전', `${summary.restore.policyVersion} (기준 커밋 ${String(summary.restore.policyBaseCommit).slice(0, 7)}) · 되돌린 기록 ${summary.restore.restoreLogEntries}줄 · 복구 경로 ${summary.restore.restoreRoute ?? '없음'}`);
    term('요약 기준 커밋', summary.commit ? summary.commit.slice(0, 7) : '로컬 빌드(커밋 정보 없음)');
  }

  async function show() {
    const current = ++generation;
    try {
      const response = await fetch('/ops-summary.json', { cache: 'no-store' });
      summary = response.ok ? await response.json() : null;
    } catch { summary = null; }
    if (current === generation) drawSummary(null);
  }

  function clear() {
    generation += 1;
    body.replaceChildren();
    counts.textContent = '점검 실행 전입니다. 결과 칸은 실제 요청 뒤에만 채워집니다.';
    drawSummary(null);
  }

  runButton.addEventListener('click', async () => {
    const current = ++generation;
    runButton.disabled = true;
    counts.textContent = '점검 중입니다…';
    body.replaceChildren();
    try {
      const result = await runOpsRows({ summary, origin: location.origin, plainFetch: (url, init) => fetch(url, init), signedFetch });
      if (current !== generation) return;
      for (const row of result.rows) {
        const tr = el('tr');
        tr.append(el('td', row.attackId), el('td', String(row.step)), el('td', row.kind), el('td', row.expected),
          el('td', row.executed === '실행' ? `${row.status}${row.error ? ` ${row.error}` : ''}` : ''),
          el('td', row.requestId ?? ''), el('td', row.checkedAt ?? ''),
          el('td', row.executed === '실행' ? '실행' : `미실행 (${row.notRunReason})`));
        body.append(tr);
      }
      const c = result.counts;
      counts.textContent = `행 ${c.rows} · 실행 ${c.executed} · 미실행 ${c.notRun} · 기대 상태와 같음 ${c.statusMatched} · 다름 ${c.statusMismatched} (행을 센 값, 미실행은 성공으로 세지 않음)`;
      drawSummary(result.deviceStatus);
    } catch {
      if (current === generation) counts.textContent = '점검을 끝내지 못했습니다(결과 없음).';
    } finally {
      runButton.disabled = false;
    }
  });

  return { show, clear };
}
