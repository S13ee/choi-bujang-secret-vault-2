// 11단계: 화면(public/auth.js) 기기 승인 흐름 모의 시험입니다. 새 패키지 없이 가짜 DOM과 가짜 fetch로 실행합니다.
// 가짜 서버는 받은 서명을 서버 함수(src/device-auth.mjs)로 실제 확인합니다.
// 확인: 승인 전 메모 요청 0회, 서버가 approved라고 답한 뒤에만 자료실이 열림, 틀린 비밀번호·pending이면 닫힘,
// 기기 거부 시 메모를 지우고 승인 화면으로, 로그아웃하면 키를 버림, 브라우저 저장소·쿠키·캐시를 쓰지 않음.
// 로컬 시험이며 실제 브라우저·배포·심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodySha256, signingString, verifySignature } from '../src/device-auth.mjs';

class El {
  constructor(tag, id) { Object.assign(this, { tag, id, hidden: false, textContent: '', value: '', children: [], listeners: {}, disabled: false, parent: null }); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  async dispatch(type) { for (const fn of this.listeners[type] ?? []) await fn({ preventDefault() {} }); }
  replaceChildren(...kids) { this.children = kids; kids.forEach(kid => { kid.parent = this; }); }
  append(...kids) { this.children.push(...kids); kids.forEach(kid => { kid.parent = this; }); }
  replaceWith(other) { if (this.parent) { this.parent.children[this.parent.children.indexOf(this)] = other; other.parent = this.parent; } }
  querySelector(selector) { return selector === 'button' ? (this.button ??= new El('button')) : null; }
  setAttribute() {}
  reset() {}
  get text() { return [this.textContent, ...this.children.map(child => child.text)].join(' ').trim(); }
}
const IDS = ['login-form', 'login-email', 'login-password', 'signed-in', 'signed-in-email', 'logout', 'auth-error', 'vault', 'notes',
  'note-form', 'note-title', 'note-body', 'note-error', 'device-gate', 'device-id', 'device-server-status', 'approve-form',
  'approve-password', 'device-error', 'device-approval'];
const dom = Object.fromEntries(IDS.map(id => [id, new El('div', id)]));
dom.vault.hidden = true;
dom['device-gate'].hidden = true;
dom['device-approval'].textContent = '확인 전';
globalThis.document = { querySelector: selector => dom[selector.slice(1)], createElement: tag => new El(tag) };
globalThis.confirm = () => true;
// 저장소·쿠키·캐시를 건드리면 기록되도록 덫을 놓습니다.
const touched = [];
for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); return undefined; } });
}
Object.defineProperty(globalThis.document, 'cookie', { get() { touched.push('document.cookie'); return ''; }, set() { touched.push('document.cookie'); } });

// 가짜 서버. 세션에는 만료 시각을 넣지 않아 화면의 토큰 갱신 타이머가 생기지 않게 합니다.
const calls = [];
const server = { session: null, approved: false, approveMakesApproved: true, notesError: null, deviceJwk: null, deviceId: null,
  notes: [{ id: 'n1', title: '가상 메모', body: '가상 본문' }] };
let badSignatures = 0;
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
globalThis.fetch = async (path, init = {}) => {
  const headers = init.headers ?? {};
  const call = { path, method: init.method ?? 'GET', signed: Boolean(headers['x-aleph-signature']), contentType: headers['Content-Type'], body: init.body };
  calls.push(call);
  if (path === '/api/auth/refresh') return server.session ? reply(200, server.session) : reply(401, { code: 'NO_SESSION' });
  if (path === '/api/auth/login') { server.session = { accessToken: 'fake-access', email: 'user-b' }; return reply(200, server.session); }
  if (path === '/api/auth/logout') { server.session = null; return reply(200, {}); }
  const body = init.body === undefined ? null : JSON.parse(init.body);
  if (path === '/api/devices/request') server.deviceJwk = body.publicKeyJwk;
  const message = signingString({ method: call.method, url: path, timestamp: headers['x-aleph-timestamp'], nonce: headers['x-aleph-nonce'],
    deviceId: headers['x-aleph-device-id'], bodyHash: await bodySha256(body) });
  if (!await verifySignature(server.deviceJwk, headers['x-aleph-signature'], message)) {
    badSignatures += 1;
    return reply(401, { error: 'DEVICE_SIGNATURE_INVALID' });
  }
  if (path === '/api/devices/request') { server.deviceId = body.deviceId; server.approved = false; return reply(201, { deviceId: body.deviceId, status: 'pending' }); }
  if (path === '/api/devices/status') return reply(200, { deviceId: server.deviceId, status: server.approved ? 'approved' : 'pending', approved: server.approved });
  if (path === '/api/devices/approve') {
    if (body.password !== 'fake-pass') return reply(401, { error: 'PASSWORD_INVALID' });
    if (server.approveMakesApproved) server.approved = true;
    return reply(200, { deviceId: server.deviceId, status: 'approved', approved: true });
  }
  if (path.startsWith('/api/notes')) {
    if (!server.approved) return reply(403, { error: 'DEVICE_NOT_APPROVED' });
    if (server.notesError) return reply(server.notesError[0], { error: server.notesError[1] });
    if (call.method === 'GET') return reply(200, server.notes);
    if (call.method === 'POST') { server.notes.push({ id: 'n2', ...body }); return reply(201, { id: 'n2' }); }
  }
  return reply(404, { error: 'NOT_FOUND' });
};

const settle = () => new Promise(resolve => setTimeout(resolve, 60));
const notesRequests = () => calls.filter(call => call.path.startsWith('/api/notes')).length;
const vaultClosed = () => {
  assert.equal(dom.vault.hidden, true, '자료실이 숨겨져 있어야 함');
  assert.equal(dom.notes.children.length, 0, '메모가 화면에 없어야 함');
};

await import('../public/auth.js');
await settle();

test('처음 열기와 로그인 직후: 승인 화면만 보이고 메모를 요청하지 않는다', async () => {
  vaultClosed();
  assert.equal(notesRequests(), 0);
  assert.equal(dom['device-approval'].textContent, '확인 전');
  dom['login-email'].value = 'user-b';
  dom['login-password'].value = 'fake-pass';
  await dom['login-form'].dispatch('submit');
  await settle();
  assert.deepEqual(calls.slice(-3).map(call => `${call.method} ${call.path}`),
    ['POST /api/auth/login', 'POST /api/devices/request', 'GET /api/devices/status']);
  assert.equal(dom['device-gate'].hidden, false);
  assert.match(dom['device-id'].textContent, /^[0-9a-f]{16}$/u);
  assert.equal(dom['device-approval'].textContent, '승인 대기');
  vaultClosed();
  assert.equal(notesRequests(), 0);
});

test('틀린 비밀번호와 「승인 응답 성공·서버 상태 pending」이면 자료실은 닫혀 있다', async () => {
  dom['approve-password'].value = 'wrong-pass';
  await dom['approve-form'].dispatch('submit');
  await settle();
  assert.equal(dom['approve-password'].value, '');
  assert.match(dom['device-error'].textContent, /비밀번호가 맞지 않습니다/u);
  vaultClosed();
  server.approveMakesApproved = false;
  dom['approve-password'].value = 'fake-pass';
  await dom['approve-form'].dispatch('submit');
  await settle();
  assert.equal(dom['approve-password'].value, '');
  assert.equal(dom['device-approval'].textContent, '승인 대기');
  vaultClosed();
  assert.equal(notesRequests(), 0, '승인 전 메모 요청 0회');
  server.approveMakesApproved = true;
});

test('서버가 approved라고 답한 뒤에만 자료실을 열고 그때 처음 메모를 불러온다', async () => {
  const before = calls.length;
  dom['approve-password'].value = 'fake-pass';
  await dom['approve-form'].dispatch('submit');
  await settle();
  assert.deepEqual(calls.slice(before).map(call => `${call.method} ${call.path}`),
    ['POST /api/devices/approve', 'GET /api/devices/status', 'GET /api/notes']);
  assert.equal(dom.vault.hidden, false);
  assert.equal(dom['device-gate'].hidden, true);
  assert.equal(dom['device-approval'].textContent, '서버가 승인 확인');
  assert.match(dom.notes.text, /가상 메모/u);
  dom['note-title'].value = '새 가상 메모';
  dom['note-body'].value = '새 본문';
  await dom['note-form'].dispatch('submit');
  await settle();
  const post = calls.find(call => call.method === 'POST' && call.path === '/api/notes');
  assert.equal(post.signed, true);
  assert.equal(post.contentType, 'application/json');
  assert.equal(post.body, '{"body":"새 본문","title":"새 가상 메모"}');
  assert.equal(dom.notes.children.length, 2);
});

test('보호 요청이 403 DEVICE_NOT_APPROVED면 메모를 지우고 승인 화면으로 돌아간다', async () => {
  server.notesError = [403, 'DEVICE_NOT_APPROVED'];
  await dom['note-form'].dispatch('submit');
  await settle();
  vaultClosed();
  assert.equal(dom['device-gate'].hidden, false);
  assert.match(dom['device-error'].textContent, /승인하지 않았습니다/u);
  server.notesError = null;
});

test('로그아웃하면 화면을 비우고 키를 버린다(다시 로그인하면 새 기기)', async () => {
  const firstDevice = dom['device-id'].textContent;
  await dom.logout.dispatch('click');
  await settle();
  vaultClosed();
  assert.equal(dom['device-gate'].hidden, true);
  assert.equal(dom['device-id'].textContent, '-');
  assert.equal(dom['device-approval'].textContent, '확인 전');
  const notesBefore = notesRequests();
  await dom['login-form'].dispatch('submit');
  await settle();
  assert.match(dom['device-id'].textContent, /^[0-9a-f]{16}$/u);
  assert.notEqual(dom['device-id'].textContent, firstDevice);
  vaultClosed();
  assert.equal(notesRequests(), notesBefore, '다시 로그인한 뒤에도 승인 전 메모 요청 없음');
});

test('모든 보호·기기 요청이 서명되고 서버가 통과시키며, 저장소·쿠키·캐시를 쓰지 않는다', () => {
  const signedCalls = calls.filter(call => !call.path.startsWith('/api/auth/'));
  assert.ok(signedCalls.length > 0);
  assert.equal(signedCalls.every(call => call.signed), true);
  assert.equal(badSignatures, 0);
  assert.deepEqual(touched, []);
});
