// 12단계 제작 1: 작전실 화면 시험입니다. 새 패키지 없이 가짜 fetch·가짜 화면으로 실행합니다. 로컬 시험이며 심판 판정이 아닙니다.
// - 브라우저용 시험 목록 사본(public/ops-catalog.js)과 서버용 목록(src/ops-catalog.mjs)이 같은지
// - 화면은 받은 응답만 표에 적고(요청 ID = 보낸 X-Request-Id), 보내지 않거나 못 보낸 항목은 미실행인지
// - 수치는 행을 센 값이고 미실행을 성공으로 세지 않는지, 메모 본문이 결과에 남지 않는지, 점검 버튼 전에는 요청하지 않는지
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { OPS_CATALOG as WEB_CATALOG } from '../public/ops-catalog.js';
import { countRows, createOpsRoom, runOpsRows } from '../public/ops-room.js';
import { OPS_CATALOG as SERVER_CATALOG } from '../src/ops-catalog.mjs';
import { RULE_IDS } from '../src/decider.mjs';
import { buildOpsSummary } from '../scripts/ops-summary.mjs';

const ORIGIN = 'https://choi-bujang-secret-vault-2-gray.vercel.app';
const MEMO_BODY = '이 문장은 메모 본문이라 결과에 나오면 안 됨';
const NOTE_ID = '0a0a0a0a-0000-4000-8000-0000000000a1';
const summary = await buildOpsSummary(resolve(import.meta.dirname, '..'), {});

function fakeServer({ failOriginal = false } = {}) {
  const calls = [];
  const respond = (status, body) => ({ ok: status < 400, status, headers: new Headers({ 'X-Vercel-Id': 'icn1::fake' }), json: async () => body });
  const plainFetch = async (url, init) => {
    calls.push({ kind: 'plain', url, method: init.method, headers: init.headers });
    if (failOriginal && url.startsWith('https://yldhutxatzstfanadlsg')) throw new TypeError('Failed to fetch');
    return init.method === 'HEAD' ? respond(url.endsWith('/') ? 200 : 404, null) : respond(url.endsWith('/') ? 200 : 401, url.endsWith('/') ? null : { error: 'LOGIN_REQUIRED' });
  };
  const signedFetch = async (path, init) => {
    calls.push({ kind: 'signed', url: path, method: init.method, headers: init.headers });
    if (path === '/api/notes') return respond(200, [{ id: NOTE_ID, title: '가상', body: MEMO_BODY }]);
    if (path === `/api/notes/${NOTE_ID}`) return respond(200, { id: NOTE_ID, title: '가상', body: MEMO_BODY });
    if (path === '/api/devices/status') return respond(200, { deviceId: '0123456789abcdef', status: 'approved', approved: true });
    return respond(200, []);
  };
  return { calls, plainFetch, signedFetch };
}

test('브라우저용 시험 목록 사본은 서버용 목록과 같다', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(WEB_CATALOG)), JSON.parse(JSON.stringify(SERVER_CATALOG)));
});

test('작전실은 받은 응답만 적고, 요청 ID는 보낸 X-Request-Id와 같으며 GET·HEAD만 보낸다', async () => {
  const server = fakeServer();
  const { rows, counts, deviceStatus } = await runOpsRows({ summary, origin: ORIGIN, plainFetch: server.plainFetch, signedFetch: server.signedFetch });
  assert.equal(rows.length, SERVER_CATALOG.length);
  assert.ok(server.calls.every(call => ['GET', 'HEAD'].includes(call.method)));
  assert.equal(server.calls.length, rows.filter(row => row.executed === '실행').length, '실행 행 하나 = 요청 하나');
  for (const row of rows.filter(item => item.executed === '실행')) {
    const call = server.calls.find(c => c.headers['X-Aleph-Attack-Id'] === row.attackId);
    assert.equal(call.headers['X-Request-Id'], row.requestId, row.attackId);
    assert.ok(Number.isInteger(row.status) && row.checkedAt);
  }
  for (const row of rows.filter(item => item.executed === '미실행')) {
    assert.equal(row.status, null); assert.equal(row.requestId, null); assert.equal(row.statusMatches, null);
    assert.ok(row.notRunReason);
  }
  // 로그인 + 기기 서명 항목 5개는 서명 요청으로, own_note_read는 목록에서 얻은 내 메모 id로 보냅니다.
  assert.deepEqual(server.calls.filter(c => c.kind === 'signed').map(c => c.url),
    ['/api/notes', `/api/notes/${NOTE_ID}`, '/api/notices', '/api/notices/c8c8c8c8-0000-4000-8000-00000000c008', '/api/devices/status']);
  assert.equal(deviceStatus, 'approved');
  assert.deepEqual(counts, countRows(rows));
  assert.equal(counts.executed + counts.notRun, counts.rows);
  assert.equal(JSON.stringify(rows).includes(MEMO_BODY), false, '메모 본문은 결과에 없음');
  for (const id of ['anonymous_create_note', 'server_function_crud', 'notice_write_rejected', 'burst_read_revocation']) {
    assert.equal(rows.find(row => row.attackId === id).executed, '미실행', id);
  }
});

test('요청이 나가지 못하거나 서명할 수 없으면 미실행이고 성공으로 세지 않는다', async () => {
  const server = fakeServer({ failOriginal: true });
  const { rows, counts } = await runOpsRows({ summary, origin: ORIGIN, plainFetch: server.plainFetch, signedFetch: null });
  const original = rows.find(row => row.attackId === 'original_api_direct_read');
  assert.equal(original.executed, '미실행');
  assert.match(original.notRunReason, /not_run/u);
  for (const id of ['own_list_notes', 'own_note_read', 'own_notice_list', 'notice_item_read', 'own_device_status']) {
    assert.equal(rows.find(row => row.attackId === id).executed, '미실행', id);
  }
  assert.equal(counts.statusMatched, rows.filter(row => row.statusMatches === true).length);
  assert.ok(rows.filter(row => row.executed === '미실행').every(row => row.statusMatches === null));
});

test('작전실 요약은 저장소 파일 값 그대로이고 비밀값이 없다', () => {
  assert.equal(summary.decider.ruleCount, RULE_IDS.length);
  assert.deepEqual(summary.decider.ruleIds, [...RULE_IDS]);
  assert.deepEqual(summary.detect.reasonCodes, ['burst_read']);
  assert.equal(summary.restore.policyVersion, 'safe-policy-step9-4e3e743');
  assert.equal(/sb_secret_|sb_publishable_|eyJ|BEGIN [A-Z ]*PRIVATE KEY|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(JSON.stringify(summary)), false);
});

test('작전실 화면은 점검 버튼을 누르기 전에는 점검 요청을 보내지 않고, 누르면 행을 그대로 그린다', async () => {
  class El {
    constructor(tag) { Object.assign(this, { tag, textContent: '', children: [], listeners: {}, disabled: false, type: '' }); }
    append(...kids) { this.children.push(...kids); }
    replaceChildren(...kids) { this.children = kids; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    get text() { return [this.textContent, ...this.children.map(child => child.text)].join(' '); }
  }
  const originalFetch = globalThis.fetch;
  const fetched = [];
  globalThis.document = { createElement: tag => new El(tag) };
  globalThis.location = { origin: ORIGIN };
  const server = fakeServer();
  globalThis.fetch = async (url, init = {}) => {
    fetched.push(String(url));
    if (url === '/ops-summary.json') return { ok: true, json: async () => summary };
    return server.plainFetch(String(url), init);
  };
  try {
    const root = new El('section');
    const room = createOpsRoom({ root, signedFetch: server.signedFetch });
    await room.show();
    assert.deepEqual(fetched, ['/ops-summary.json'], '보여 주기만 할 때는 요약 파일만 읽음');
    assert.match(root.text, /판정기 규칙 수 16개/u);
    assert.match(root.text, /복구 버전 safe-policy-step9-4e3e743/u);
    const button = root.children.find(child => child.tag === 'button');
    for (const fn of button.listeners.click) await fn();
    const table = root.children.find(child => child.tag === 'table');
    const body = table.children.find(child => child.tag === 'tbody');
    assert.equal(body.children.length, SERVER_CATALOG.length);
    const countsText = root.children.find(child => child.tag === 'p').textContent;
    assert.match(countsText, new RegExp(`행 ${SERVER_CATALOG.length} · 실행 \\d+ · 미실행 \\d+`, 'u'));
    assert.match(root.text, /회수 상태\(이 기기\) 승인됨\(서버 응답\)/u);
    assert.equal(root.text.includes(MEMO_BODY), false, '메모 본문은 화면에 없음');
    room.clear();
    assert.equal(body.children.length, 0, '자료실이 닫히면 표를 비움');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.location;
  }
});
