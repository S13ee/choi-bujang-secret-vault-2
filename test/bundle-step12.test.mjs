// 12단계: 심판은 격리 환경에서 npm run bundle을 실행합니다. 그 환경에서는 node:fs·node:path·node:url·node:child_process·
// node:crypto만 쓸 수 있고, 요청은 공개 HTTPS 주소로 보내는 GET·HEAD만 됩니다.
// 12단계 실험: step 12 점검을 시작 틀 모양으로 줄였습니다. fetch를 가짜로 바꿔 요청이 정확히 두 개(GET /api/notes,
// GET /api/notes/<B 시험 메모 id>)이고 헤더 없이 URL 객체로 나가는지, 나머지 16개는 not_run인지 확인합니다.
// 로컬 시험이며 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';
import { OPS_CATALOG } from '../src/ops-catalog.mjs';

const ALLOWED_MODULES = ['node:fs', 'node:path', 'node:url', 'node:child_process', 'node:crypto'];
const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const WRITE_CHECKS = ['anonymous_create_note', 'anonymous_admin_notice_update', 'anonymous_note_restore'];

async function runWithFakeFetch(stepConfig, run = runAttackChecks, { fail = false } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalBuffer = globalThis.Buffer;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), isUrlObject: url instanceof URL, method: (init.method ?? 'GET').toUpperCase(), hasBody: init.body !== undefined,
      hasHeaders: init.headers !== undefined, initKeys: Object.keys(init).sort() });
    // fail이면 요청이 나가지 못한 것처럼 예외를 던집니다.
    if (fail) throw new TypeError('fetch failed');
    return { ok: false, status: 401, json: async () => ({ error: 'LOGIN_REQUIRED' }) };
  };
  // step 12 점검이 전역 Buffer·crypto에 기대지 않는지 보려고 실행하는 동안 지웁니다.
  globalThis.Buffer = undefined;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    return { attempts: await run(stepConfig), calls };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Buffer = originalBuffer;
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  }
}

const B_TEST_NOTE_ID = 'b4b4b4b4-0000-4000-8000-00000000b004';
const SENT = ['anonymous_list_notes', 'anonymous_read_other_note'];
const EXPERIMENT_NOTE = '(12단계 실험: 시작 틀 모양으로 줄여 요청하지 않음)';

test('12단계 실험: 요청은 정확히 두 개, 이 순서로, 헤더 없이 URL 객체로 보낸다', async () => {
  assert.equal(config.step, 12);
  const { attempts, calls } = await runWithFakeFetch(config);
  const app = new URL(config.publicAppUrl);
  assert.deepEqual(calls.map(call => call.url), [new URL('/api/notes', app).href, new URL(`/api/notes/${B_TEST_NOTE_ID}`, app).href]);
  for (const call of calls) {
    assert.equal(call.isUrlObject, true, `URL 객체를 그대로 넘김: ${call.url}`);
    assert.equal(call.method, 'GET');
    assert.equal(call.hasBody, false);
    assert.equal(call.hasHeaders, false, `헤더를 붙이지 않음: ${call.url}`);
    assert.deepEqual(call.initKeys, ['redirect', 'signal'], '시작 틀과 같은 fetch 옵션만');
  }
  assert.equal(attempts.length, 18, '점검 개수 그대로');
  assert.deepEqual(attempts.map(item => item.attackId), OPS_CATALOG.filter(row => row.bundle).map(row => row.attackId), 'attackId·순서 그대로');
  for (const item of attempts) {
    assert.deepEqual(Object.keys(item).sort(), ['attackId', 'expected', 'observed']);
    assert.ok(item.expected.trim() && item.expected.length <= 300 && item.observed.length <= 300);
  }
  process.stdout.write(`# step 12 실험 요청 ${calls.length}건: ${calls.map(call => new URL(call.url).pathname).join(', ')}\n`);
});

test('12단계 실험: observed는 "GET <경로> → HTTP <받은 상태>[ <error>]"이고, 나머지 16개는 not_run이다', async () => {
  const STATUS = { '/api/notes': 401, [`/api/notes/${B_TEST_NOTE_ID}`]: 404 };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const status = STATUS[new URL(url).pathname] ?? 500;
    return { ok: false, status, json: async () => (status === 401 ? { error: 'LOGIN_REQUIRED' } : {}) };
  };
  try {
    const attempts = await runAttackChecks(config);
    const byId = Object.fromEntries(attempts.map(item => [item.attackId, item]));
    assert.equal(byId.anonymous_list_notes.observed, 'GET /api/notes → HTTP 401 LOGIN_REQUIRED');
    assert.equal(byId.anonymous_read_other_note.observed, `GET /api/notes/${B_TEST_NOTE_ID} → HTTP 404`, 'error가 없으면 적지 않음');
    for (const item of attempts.filter(a => !SENT.includes(a.attackId))) {
      assert.equal(item.observed, 'not_run', item.attackId);
      assert.ok(item.expected.endsWith(EXPERIMENT_NOTE), `${item.attackId}: expected에 실험 이유`);
    }
    assert.equal(attempts.filter(item => item.observed === 'not_run').length, 16);
    assert.equal(/Bearer|eyJ|requestId|checkedAt/u.test(attempts.map(a => a.observed).join(' ')), false, '토큰·요청 ID를 적지 않음');
    process.stdout.write(`# observed: ${byId.anonymous_list_notes.observed} | ${byId.anonymous_read_other_note.observed}\n`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('12단계 실험: fetch가 예외를 던지면 그 점검의 observed는 정확히 not_run이다', async () => {
  const { attempts, calls } = await runWithFakeFetch(config, runAttackChecks, { fail: true });
  assert.equal(calls.length, 2, '요청은 두 번 시도했지만 나가지 못함');
  assert.equal(attempts.length, 18);
  for (const item of attempts) assert.equal(item.observed, 'not_run', item.attackId);
});

test('12단계 실험: step 12 점검은 node:crypto를 부르지 않는다', async () => {
  const used = [];
  const trap = name => () => { used.push(name); throw new Error(`${name} 호출됨`); };
  const cryptoMock = mock.module('node:crypto', { namedExports: { randomUUID: trap('randomUUID'), createHash: trap('createHash') } });
  try {
    const { runAttackChecks: runNoCrypto } = await import('../src/attack-check.mjs?no-crypto');
    const { attempts, calls } = await runWithFakeFetch(config, runNoCrypto);
    assert.deepEqual(used, [], 'randomUUID·createHash를 부르지 않음');
    assert.equal(calls.length, 2);
    assert.equal(attempts.length, 18);
  } finally {
    cryptoMock.restore();
  }
});

test('npm run bundle이 불러오는 파일은 허용된 node: 모듈만 import한다', () => {
  // 프로젝트 안의 상대 경로 파일(./ops-catalog.mjs 등)은 따라가서 그 파일의 import도 같은 규칙으로 검사합니다.
  const queue = ['../scripts/bundle.mjs', '../src/decider.mjs', '../src/attack-check.mjs'].map(file => new URL(file, import.meta.url));
  const seen = new Set();
  while (queue.length) {
    const fileUrl = queue.shift();
    if (seen.has(fileUrl.href)) continue;
    seen.add(fileUrl.href);
    const source = readFileSync(fileUrl, 'utf8');
    const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gmu)].map(match => match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        assert.match(specifier, /\.mjs$/u, `${fileUrl.pathname}: ${specifier}`);
        queue.push(new URL(specifier, fileUrl));
      } else {
        assert.ok(ALLOWED_MODULES.includes(specifier), `${fileUrl.pathname}: ${specifier}`);
      }
    }
  }
  assert.ok([...seen].some(href => href.endsWith('/src/ops-catalog.mjs')), '시험 목록 파일도 검사함');
});

test('서버는 요청의 UUID x-request-id를 응답 헤더로 돌려주고, 없거나 이상하면 새 UUID를 준다', async () => {
  const { default: handler } = await import('../api/ai.js');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  const call = headers => {
    const response = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    handler({ method: 'GET', url: '/api/ai?token=FAKEQUERY', headers }, response);
    return response;
  };
  try {
    const given = 'a1b2c3d4-0000-4000-8000-00000000abcd';
    const same = call({ 'x-request-id': given, 'x-aleph-attack-id': 'anonymous_list_notes', authorization: 'Bearer FAKE-TKN' });
    assert.equal(same.headers['x-request-id'], given);
    assert.equal(same.code, 501);
    assert.deepEqual(same.body, { error: 'AI_PROXY_NOT_IMPLEMENTED' }, '응답 본문은 그대로');
    const odd = call({ 'x-request-id': 'not-a-uuid<script>', 'x-aleph-attack-id': 'BAD ID!' });
    assert.match(odd.headers['x-request-id'], UUID);
    assert.notEqual(odd.headers['x-request-id'], 'not-a-uuid<script>');
    const none = call({});
    assert.match(none.headers['x-request-id'], UUID);
    const res12 = logs.filter(line => line.startsWith('[res12]')).map(line => JSON.parse(line.slice(8)));
    assert.equal(res12[0].requestId, given);
    assert.equal(res12[0].attackId, 'anonymous_list_notes');
    assert.equal(res12[1].requestId, odd.headers['x-request-id']);
    assert.equal('attackId' in res12[1], false, '이상한 attackId는 남기지 않음');
    const all = logs.join('\n');
    assert.equal(/FAKE-TKN|FAKEQUERY|<script>/u.test(all), false, '토큰·쿼리·이상한 값은 남기지 않음');
  } finally {
    console.log = originalLog;
  }
});
