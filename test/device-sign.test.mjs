// 11단계: 브라우저 public/device-sign.js와 서버 src/device-auth.mjs가 같은 서명 규칙을 쓰는지 확인합니다.
// 같은 입력에서 canonical JSON·본문 해시·서명 문자열·deviceId가 같아야 하고, 브라우저 서명을 서버가 통과시켜야 합니다.
// 로컬 시험이며 배포나 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as web from '../public/device-sign.js';
import * as srv from '../src/device-auth.mjs';

const BODIES = [undefined, null, '', {}, { password: 'x' }, { title: '가상 제목', body: '줄1\n줄2 "따옴표" \\ 😀' },
  { b: 1, a: [3, { z: true, y: null }], c: { e: 1.5, d: -0 } }, '{"b":2,"a":1}', 'not json', [1, 'two', { k: 'v' }]];

test('canonical JSON과 본문 해시가 브라우저·서버에서 같다', async () => {
  for (const body of BODIES) {
    if (body !== undefined) assert.equal(web.canonicalJson(body), srv.canonicalJson(body));
    assert.equal(await web.bodySha256(body), await srv.bodySha256(body));
  }
  const sent = { title: 'B', body: 'x', id: undefined, nested: { b: 2, a: 1 } };
  // 브라우저가 보낸 canonical JSON 문자열을 서버가 객체로 풀어 다시 계산해도 같아야 합니다.
  assert.equal(await web.bodySha256(sent), await srv.bodySha256(JSON.parse(web.canonicalJson(sent))));
  assert.equal(await srv.bodySha256(undefined), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('서명 문자열과 deviceId가 같고, 개인 키는 꺼낼 수 없다', async () => {
  const input = { method: 'post', url: '/api/notes/0a0a?x=1&y=%20', timestamp: 1760000000000, nonce: 'abc_-1', deviceId: '0123456789abcdef', bodyHash: 'e3b0' };
  assert.equal(web.signingString(input), srv.signingString(input));
  assert.equal(web.signingString(input).split('\n').length, 7);
  const device = await web.createDeviceKey();
  assert.equal(device.deviceId, await srv.deviceIdFromJwk(device.publicKeyJwk));
  assert.match(device.deviceId, /^[0-9a-f]{16}$/u);
  assert.deepEqual(Object.keys(device.publicKeyJwk).sort(), ['crv', 'kty', 'x', 'y']);
  assert.equal(device.privateKey.extractable, false);
});

test('브라우저가 만든 서명을 서버가 통과시킨다', async () => {
  const device = await web.createDeviceKey();
  const nonces = new Set();
  const supabase = { from: () => ({ insert: async row => (nonces.has(row.nonce) ? { error: { code: '23505' } } : (nonces.add(row.nonce), { error: null })) }) };
  const cases = [['GET', '/api/devices/status'], ['POST', '/api/devices/request', { deviceId: device.deviceId, publicKeyJwk: device.publicKeyJwk }],
    ['PUT', '/api/notes/0a0a0a0a-0000-4000-8000-0000000000a1', { title: '제목', body: '본문 😀' }], ['GET', '/api/notes?x=1']];
  for (const [method, url, body] of cases) {
    const signed = await web.signRequest(device, { method, url, body });
    const request = { method, url, headers: signed.headers, body: signed.bodyText === undefined ? null : JSON.parse(signed.bodyText) };
    const result = await srv.verifySignedRequest({ request, headers: srv.readDeviceHeaders(request), publicKeyJwk: device.publicKeyJwk, supabase });
    assert.equal(result.ok, true, `${method} ${url}`);
  }
});

test('서명 경로는 Vercel이 덧붙인 대괄호 경로 값만 뺀다', () => {
  const id = '0a0a0a0a-0000-4000-8000-0000000000a1';
  const cases = [
    ['/api/devices/request', '/api/devices/request'],
    ['/api/devices/request?action=request', '/api/devices/request'],
    ['/api/devices/status?x=1&action=status', '/api/devices/status?x=1'],
    ['/api/devices/status?action=request', '/api/devices/status?action=request'],
    [`/api/notes/${id}?id=${id}`, `/api/notes/${id}`],
    [`/api/notes/${id}/restore?id=${id}`, `/api/notes/${id}/restore`],
    [`/api/notices/${id}?id=${id}`, `/api/notices/${id}`],
    [`/api/admin/notices/${id}?id=${id}`, `/api/admin/notices/${id}`],
    [`/api/notes/${id}?id=other`, `/api/notes/${id}?id=other`],
    ['/api/notes?id=abc', '/api/notes?id=abc'],
  ];
  for (const [url, expected] of cases) assert.equal(srv.signedPath(url), expected, url);
});
