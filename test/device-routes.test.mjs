// 11단계: 기기 승인 경로(api/devices/[action].js)와 보호 경로의 기기 서명 검사 모의 시험입니다.
// Supabase와 로그인 검사는 가짜로 바꾸고(메모리 안 가상 자료), 기기 키와 서명은 실제 WebCrypto로 만듭니다.
// 실행: npm run test:device (Node 내장 --experimental-test-module-mocks 사용, 새 패키지 없음)
// 로컬 시험이며 배포나 심판 판정이 아닙니다. 실제 계정·비밀번호·토큰은 쓰지 않습니다.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const I = 'eeeeeeee-0000-4000-8000-00000000000e', J = 'dddddddd-0000-4000-8000-00000000000d';
const NOTICE = 'c8c8c8c8-0000-4000-8000-00000000c008';
const FAKE_PASSWORDS = { [A]: 'fake-pass-A', [B]: 'fake-pass-B' };

const db = {
  byteback_vault_notes: [], byteback_vault_note_backups: [], byteback_vault_audit: [],
  byteback_vault_notices: [{ id: NOTICE, title: '가상 공지', content: '가상', created_at: 0 }],
  byteback_vault_instructors: [{ user_id: I }], byteback_vault_devices: [], byteback_vault_device_nonces: [],
};
const KEY = {
  byteback_vault_notes: r => r.id, byteback_vault_note_backups: r => r.note_id,
  byteback_vault_devices: r => `${r.owner_id}|${r.device_id}`, byteback_vault_device_nonces: r => `${r.device_id}|${r.nonce}`,
};
let seq = 0;
function from(table) {
  const q = { op: 'select', filters: [], cols: null };
  const pick = r => (q.cols ? Object.fromEntries(q.cols.map(c => [c, r[c]])) : { ...r });
  const run = () => {
    if (q.op === 'insert') {
      if (KEY[table] && db[table].some(r => KEY[table](r) === KEY[table](q.row))) return { error: { code: '23505' } };
      const row = { ...q.row, id: q.row.id ?? ++seq, created_at: ++seq };
      db[table].push(row);
      return { data: [pick(row)], error: null };
    }
    const hit = db[table].filter(r => q.filters.every(f => f(r)));
    if (q.op === 'update') hit.forEach(r => Object.assign(r, q.patch));
    if (q.op === 'delete') db[table] = db[table].filter(r => !hit.includes(r));
    return { data: hit.map(pick), error: null };
  };
  const b = {
    select(c) { if (c) q.cols = c.split(',').map(s => s.trim()); return b; },
    eq(k, v) { q.filters.push(r => r[k] === v); return b; },
    neq(k, v) { q.filters.push(r => r[k] !== v); return b; },
    order() { return b; },
    insert(row) { q.op = 'insert'; q.row = row; return b; },
    update(p) { q.op = 'update'; q.patch = p; return b; },
    delete() { q.op = 'delete'; return b; },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error ?? null }); },
    then(ok, bad) { return Promise.resolve(run()).then(ok, bad); },
  };
  return b;
}
const fakeEmail = id => `user-${id.slice(0, 4)}`;
const client = {
  from,
  auth: {
    admin: { getUserById: async id => ({ data: { user: { id, email: fakeEmail(id) } }, error: null }) },
    signInWithPassword: async ({ email, password }) => {
      const id = Object.keys(FAKE_PASSWORDS).find(key => fakeEmail(key) === email);
      return id && FAKE_PASSWORDS[id] === password ? { data: { user: { id }, session: {} }, error: null } : { data: {}, error: { code: 'invalid_credentials' } };
    },
    signOut: async () => ({ error: null }),
  },
};
const logins = { 'Bearer tokA': { kind: 'student', userId: A }, 'Bearer tokB': { kind: 'student', userId: B },
  'Bearer tokI': { kind: 'student', userId: I }, 'Bearer tokJ': { kind: 'judge', userId: J, runId: 'r', identity: 'a' } };
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => client } });
mock.module(new URL('../src/verify-login.mjs', import.meta.url).href, {
  namedExports: { createLoginVerifier: () => async header => logins[header] ?? null },
});
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'placeholder-not-a-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'placeholder-publishable';
const logs = [];
mock.method(console, 'log', (...a) => logs.push(a.join(' ')));
mock.method(console, 'warn', (...a) => logs.push(a.join(' ')));
mock.method(console, 'error', (...a) => logs.push(a.join(' ')));

const { bodySha256, signingString, deviceIdFromJwk } = await import('../src/device-auth.mjs');
const devices = (await import('../api/devices/[action].js')).default;
const notesList = (await import('../api/notes/index.js')).default;
const noteItem = (await import('../api/notes/[id]/index.js')).default;
const restore = (await import('../api/notes/[id]/restore.js')).default;
const noticeList = (await import('../api/notices/index.js')).default;
const noticeItem = (await import('../api/notices/[id].js')).default;
const admin = (await import('../api/admin/notices/[id].js')).default;

async function newDevice() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const full = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const jwk = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };
  return { pair, jwk, deviceId: await deviceIdFromJwk(jwk) };
}
async function seedDevice(owner, status) {
  const device = await newDevice();
  db.byteback_vault_devices.push({ owner_id: owner, device_id: device.deviceId, public_key_jwk: device.jwk, status });
  return device;
}
let nonceSeq = 0;
// 요청 만들기. dev가 있으면 그 키로 서명합니다. sendUrl·sendBody는 서명 뒤 바꿔치기(또는 Vercel이 덧붙인 쿼리)를 흉내 냅니다.
async function req({ method, url, query = {}, body, token, dev, timestamp = Date.now(), deviceId, sendUrl, sendBody }) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (dev) {
    const id = deviceId ?? dev.deviceId;
    const nonce = `n${++nonceSeq}`;
    const message = signingString({ method, url, timestamp, nonce, deviceId: id, bodyHash: await bodySha256(body) });
    const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, dev.pair.privateKey, new TextEncoder().encode(message))).toString('base64url');
    Object.assign(headers, { 'x-aleph-device-id': id, 'x-aleph-timestamp': String(timestamp), 'x-aleph-nonce': nonce, 'x-aleph-signature': signature });
  }
  return { method, url: sendUrl ?? url, headers, query, body: sendBody !== undefined ? sendBody : body };
}
async function send(handler, request) {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler(request, response);
  return response;
}
const call = async (handler, spec) => send(handler, await req(spec));
const expect = (response, code, error) => {
  assert.equal(response.code, code, JSON.stringify(response.body));
  if (error) assert.equal(response.body?.error, error);
};
const deviceCall = (action, spec) => call(devices, { ...spec, url: spec.url ?? `/api/devices/${action}`, query: { action } });

test('기기 승인 경로: 등록·상태·승인과 거부 사유', async () => {
  const dA = await newDevice(), dB = await newDevice();
  const reg = d => ({ deviceId: d.deviceId, publicKeyJwk: d.jwk });
  expect(await deviceCall('request', { method: 'POST', body: reg(dA), token: 'tokA', dev: dA }), 201);
  const again = await deviceCall('request', { method: 'POST', body: reg(dA), token: 'tokA', dev: dA });
  expect(again, 200); assert.equal(again.body.status, 'pending');
  expect(await deviceCall('request', { method: 'POST', body: reg(dB), token: 'tokB', dev: dB }), 201);

  expect(await deviceCall('status', { method: 'GET', token: 'tokA' }), 401, 'DEVICE_SIGNATURE_REQUIRED');
  const ok = await deviceCall('status', { method: 'GET', token: 'tokA', dev: dA });
  expect(ok, 200); assert.deepEqual(ok.body, { deviceId: dA.deviceId, status: 'pending', approved: false });
  expect(await deviceCall('status', { method: 'GET', token: 'tokA', dev: dA, sendUrl: '/api/devices/status?x=1' }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await deviceCall('approve', { method: 'POST', body: { password: 'fake-pass-X' }, sendBody: { password: 'fake-pass-A' }, token: 'tokA', dev: dA }), 401, 'DEVICE_SIGNATURE_INVALID');
  const once = await req({ method: 'GET', url: '/api/devices/status', query: { action: 'status' }, token: 'tokA', dev: dA });
  expect(await send(devices, once), 200);
  expect(await send(devices, once), 401, 'DEVICE_NONCE_REUSED');
  expect(await deviceCall('status', { method: 'GET', token: 'tokA', dev: dA, timestamp: Date.now() - 61_000 }), 401, 'DEVICE_SIGNATURE_EXPIRED');
  expect(await deviceCall('request', { method: 'POST', body: { deviceId: dA.deviceId, publicKeyJwk: { ...dA.jwk, d: 'AAAA' } }, token: 'tokA', dev: dA }), 400, 'INVALID_PUBLIC_KEY');
  expect(await deviceCall('request', { method: 'POST', body: { deviceId: dA.deviceId, publicKeyJwk: { ...dA.jwk, ext: true, key_ops: ['verify'] } }, token: 'tokA', dev: dA }), 400, 'INVALID_PUBLIC_KEY');
  expect(await deviceCall('request', { method: 'POST', body: { deviceId: dB.deviceId, publicKeyJwk: dA.jwk }, token: 'tokA', dev: dA, deviceId: dB.deviceId }), 400, 'DEVICE_ID_MISMATCH');
  expect(await deviceCall('request', { method: 'POST', body: reg(dA), token: 'tokA', dev: dB, deviceId: dA.deviceId }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await deviceCall('status', { method: 'GET', token: 'tokB', dev: dA }), 403, 'DEVICE_NOT_REGISTERED');
  expect(await deviceCall('approve', { method: 'POST', body: { password: 'fake-pass-WRONG' }, token: 'tokA', dev: dA }), 401, 'PASSWORD_INVALID');
  expect(await deviceCall('approve', { method: 'POST', body: { password: 'fake-pass-A' }, token: 'tokJ', dev: dA }), 403, 'APPROVAL_REQUIRES_PASSWORD');
  const approved = await deviceCall('approve', { method: 'POST', body: { password: 'fake-pass-A' }, token: 'tokA', dev: dA });
  expect(approved, 200); assert.equal(approved.body.approved, true);
  const after = await deviceCall('status', { method: 'GET', token: 'tokA', dev: dA });
  assert.deepEqual(after.body, { deviceId: dA.deviceId, status: 'approved', approved: true });
  assert.equal((await deviceCall('status', { method: 'GET', token: 'tokB', dev: dB })).body.status, 'pending');
  assert.equal((await deviceCall('request', { method: 'POST', body: reg(dA), token: 'tokA', dev: dA })).body.status, 'approved');
  expect(await deviceCall('status', { method: 'GET', dev: dA }), 401, 'LOGIN_REQUIRED');
  expect(await deviceCall('request', { method: 'GET', token: 'tokA' }), 405, 'METHOD_NOT_ALLOWED');
  expect(await deviceCall('status', { method: 'POST', token: 'tokA' }), 405, 'METHOD_NOT_ALLOWED');
  expect(await deviceCall('approve', { method: 'GET', token: 'tokA' }), 405, 'METHOD_NOT_ALLOWED');
  expect(await deviceCall('delete', { method: 'POST', token: 'tokA' }), 404, 'NOT_FOUND');
  expect(await deviceCall('__proto__', { method: 'GET' }), 404, 'NOT_FOUND');
  const stored = db.byteback_vault_devices.find(row => row.device_id === dA.deviceId);
  assert.deepEqual(Object.keys(stored.public_key_jwk).sort(), ['crv', 'kty', 'x', 'y']);
  assert.ok(stored.approved_at);
  const all = logs.join('\n');
  assert.equal(all.includes('fake-pass'), false, '로그에 비밀번호가 없어야 함');
  assert.equal(all.includes(dA.jwk.x), false, '로그에 공개 키 좌표가 없어야 함');
});

test('보호 경로: 로그인 → 승인된 기기 서명 → 기존 처리', async () => {
  const dev = { A: await seedDevice(A, 'approved'), Apending: await seedDevice(A, 'pending'), B: await seedDevice(B, 'approved'),
    I: await seedDevice(I, 'approved'), J: await seedDevice(J, 'approved') };
  const nA = '0a0a0a0a-0000-4000-8000-0000000000a1';
  expect(await call(notesList, { method: 'POST', url: '/api/notes', body: { id: nA, title: 'A 가상', body: 'A 원본' }, token: 'tokA', dev: dev.A }), 201);
  const routes = [
    ['GET /api/notes', notesList, { method: 'GET', url: '/api/notes' }, 200],
    ['POST /api/notes', notesList, { method: 'POST', url: '/api/notes', body: { title: '가상 추가', body: '가상' } }, 201],
    ['GET /api/notes/:id', noteItem, { method: 'GET', url: `/api/notes/${nA}`, query: { id: nA } }, 200],
    ['PUT /api/notes/:id', noteItem, { method: 'PUT', url: `/api/notes/${nA}`, query: { id: nA }, body: { title: 'A 수정', body: 'A 수정 본문' } }, 200],
    ['POST /api/notes/:id/restore', restore, { method: 'POST', url: `/api/notes/${nA}/restore`, query: { id: nA } }, 200],
    ['GET /api/notices', noticeList, { method: 'GET', url: '/api/notices' }, 200],
    ['GET /api/notices/:id', noticeItem, { method: 'GET', url: `/api/notices/${NOTICE}`, query: { id: NOTICE } }, 200],
    ['PUT /api/admin/notices/:id (A, 강사 아님)', admin, { method: 'PUT', url: `/api/admin/notices/${NOTICE}`, query: { id: NOTICE }, body: { title: '수정', body: '수정' } }, 403],
    ['DELETE /api/notes/:id', noteItem, { method: 'DELETE', url: `/api/notes/${nA}`, query: { id: nA } }, 200],
  ];
  for (const [name, handler, spec, okCode] of routes) {
    expect(await call(handler, { ...spec }), 401, 'LOGIN_REQUIRED');
    expect(await call(handler, { ...spec, token: 'tokA' }), 401, 'DEVICE_SIGNATURE_REQUIRED');
    expect(await call(handler, { ...spec, token: 'tokA', dev: dev.Apending }), 403, 'DEVICE_NOT_APPROVED');
    const ok = await call(handler, { ...spec, token: 'tokA', dev: dev.A });
    assert.equal(ok.code, okCode, `${name}: ${JSON.stringify(ok.body)}`);
    if (name.includes('restore')) {
      assert.equal(ok.body.ownerId, A);
      assert.match(ok.body.contentSha256, /^[0-9a-f]{64}$/u);
    }
    if (name.includes('admin')) assert.equal(ok.body.error, 'NOT_INSTRUCTOR');
  }
  const nA2 = '0a0a0a0a-0000-4000-8000-0000000000a2';
  expect(await call(notesList, { method: 'POST', url: '/api/notes', body: { id: nA2, title: 'A 가상 2', body: 'A 원본 2' }, token: 'tokA', dev: dev.A }), 201);
  expect(await call(noteItem, { method: 'GET', url: `/api/notes/${nA2}`, query: { id: nA2 }, sendUrl: `/api/notes/${nA2}?x=1`, token: 'tokA', dev: dev.A }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await call(noteItem, { method: 'PUT', url: `/api/notes/${nA2}`, query: { id: nA2 }, body: { title: '서명한 제목', body: 'x' }, sendBody: { title: '바꾼 제목', body: 'x' }, token: 'tokA', dev: dev.A }), 401, 'DEVICE_SIGNATURE_INVALID');
  assert.equal(db.byteback_vault_notes.find(row => row.id === nA2).title, 'A 가상 2');
  expect(await call(notesList, { method: 'GET', url: '/api/notes', token: 'tokB', dev: dev.A }), 403, 'DEVICE_NOT_REGISTERED');
  expect(await call(noteItem, { method: 'GET', url: `/api/notes/${nA2}`, query: { id: nA2 }, token: 'tokB', dev: dev.B }), 404, 'NOTE_NOT_FOUND');
  expect(await call(noteItem, { method: 'PUT', url: `/api/notes/${nA2}`, query: { id: nA2 }, body: { title: 'x', body: 'x' }, token: 'tokB', dev: dev.B }), 404, 'NOTE_NOT_FOUND');
  expect(await call(noteItem, { method: 'DELETE', url: `/api/notes/${nA2}`, query: { id: nA2 }, token: 'tokB', dev: dev.B }), 404, 'NOTE_NOT_FOUND');
  expect(await call(restore, { method: 'POST', url: `/api/notes/${nA2}/restore`, query: { id: nA2 }, token: 'tokB', dev: dev.B }), 404, 'BACKUP_NOT_FOUND');
  expect(await call(noticeList, { method: 'GET', url: '/api/notices', token: 'tokJ' }), 401, 'DEVICE_SIGNATURE_REQUIRED');
  expect(await call(noticeList, { method: 'GET', url: '/api/notices', token: 'tokJ', dev: dev.J }), 200);
  expect(await call(admin, { method: 'PUT', url: `/api/admin/notices/${NOTICE}`, query: { id: NOTICE }, body: { title: 'x', body: 'x' }, token: 'tokJ', dev: dev.J }), 403, 'NOT_INSTRUCTOR');
  expect(await call(admin, { method: 'PUT', url: `/api/admin/notices/${NOTICE}`, query: { id: NOTICE }, body: { title: '강사 수정', body: 'y' }, token: 'tokI', dev: dev.I }), 200);
});

test('Vercel이 덧붙인 경로 쿼리: 그 값만 빼고 서명 확인, 다른 변경은 401', async () => {
  const dA = await seedDevice(A, 'approved'), dI = await seedDevice(I, 'approved'), dNew = await newDevice();
  const id = '0a0a0a0a-0000-4000-8000-0000000000a3';
  expect(await call(notesList, { method: 'POST', url: '/api/notes', body: { id, title: 'A 가상 3', body: 'A 원본 3' }, token: 'tokA', dev: dA }), 201);
  expect(await call(devices, { method: 'POST', url: '/api/devices/request', sendUrl: '/api/devices/request?action=request', query: { action: 'request' }, body: { deviceId: dNew.deviceId, publicKeyJwk: dNew.jwk }, token: 'tokA', dev: dNew }), 201);
  expect(await call(devices, { method: 'GET', url: '/api/devices/status', sendUrl: '/api/devices/status?action=status', query: { action: 'status' }, token: 'tokA', dev: dNew }), 200);
  const withId = (method, handler, path, extra = {}) => call(handler, { method, url: path, sendUrl: `${path}?id=${extra.idValue ?? path.match(/[0-9a-f-]{36}/u)[0]}`, query: { id: path.match(/[0-9a-f-]{36}/u)[0] }, token: extra.token ?? 'tokA', dev: extra.dev ?? dA, body: extra.body });
  expect(await withId('GET', noteItem, `/api/notes/${id}`), 200);
  expect(await withId('PUT', noteItem, `/api/notes/${id}`, { body: { title: '변조', body: '변조' } }), 200);
  expect(await withId('POST', restore, `/api/notes/${id}/restore`), 200);
  expect(await withId('GET', noticeItem, `/api/notices/${NOTICE}`), 200);
  expect(await withId('PUT', admin, `/api/admin/notices/${NOTICE}`, { token: 'tokI', dev: dI, body: { title: '강사 수정 2', body: 'z' } }), 200);
  expect(await withId('DELETE', noteItem, `/api/notes/${id}`), 200);
  const before = logs.length;
  expect(await call(noticeItem, { method: 'GET', url: `/api/notices/${NOTICE}`, sendUrl: `/api/notices/${id}?id=${id}`, query: { id }, token: 'tokA', dev: dA }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await call(noticeItem, { method: 'GET', url: `/api/notices/${NOTICE}`, sendUrl: `/api/notices/${NOTICE}?x=1&id=${NOTICE}`, query: { id: NOTICE }, token: 'tokA', dev: dA }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await withId('GET', noticeItem, `/api/notices/${NOTICE}`, { idValue: 'other' }), 401, 'DEVICE_SIGNATURE_INVALID');
  expect(await call(devices, { method: 'GET', url: '/api/devices/status', sendUrl: '/api/devices/status?action=request', query: { action: 'status' }, token: 'tokA', dev: dNew }), 401, 'DEVICE_SIGNATURE_INVALID');
  const sig = logs.slice(before).filter(line => line.startsWith('[sig11]'));
  assert.equal(sig.length, 4);
  for (const line of sig) {
    assert.deepEqual(Object.keys(JSON.parse(line.slice(8))), ['method', 'url', 'signedPath']);
    assert.equal(/Bearer|x-aleph|signature/u.test(line), false);
  }
});
