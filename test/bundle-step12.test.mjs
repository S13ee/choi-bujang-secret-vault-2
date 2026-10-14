// 12단계: 심판은 격리 환경에서 npm run bundle을 실행합니다. 그 환경에서는 node:fs·node:path·node:url·node:child_process·
// node:crypto만 쓸 수 있고, 요청은 공개 HTTPS 주소로 보내는 GET·HEAD만 됩니다.
// 이 시험은 fetch를 가짜로 바꿔 step 12 점검이 GET·HEAD 외의 요청을 하나라도 보내면 실패합니다.
// 로컬 시험이며 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { createHash as realCreateHash, randomUUID as realRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const ALLOWED_MODULES = ['node:fs', 'node:path', 'node:url', 'node:child_process', 'node:crypto'];
const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const WRITE_CHECKS = ['anonymous_create_note', 'anonymous_admin_notice_update', 'anonymous_note_restore'];

async function runWithFakeFetch(stepConfig, run = runAttackChecks, { fail = false } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalBuffer = globalThis.Buffer;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method ?? 'GET').toUpperCase(), hasBody: init.body !== undefined, headers: { ...(init.headers ?? {}) } });
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

test('step 12 점검은 공개 HTTPS 주소에 GET·HEAD만 보낸다', async () => {
  assert.equal(config.step, 12);
  const { attempts, calls } = await runWithFakeFetch(config);
  assert.ok(calls.length > 0, '읽기 요청을 하나 이상 보내야 함');
  for (const call of calls) {
    assert.ok(['GET', 'HEAD'].includes(call.method), `${call.method} ${call.url}`);
    assert.equal(call.hasBody, false, `본문을 보내면 안 됨: ${call.url}`);
    assert.equal(new URL(call.url).protocol, 'https:');
    assert.ok([new URL(config.publicAppUrl).origin, new URL(config.originalApiUrl).origin].includes(new URL(call.url).origin), call.url);
  }
  assert.ok(attempts.length >= 1 && attempts.length <= 20);
  assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length);
  for (const item of attempts) {
    assert.deepEqual(Object.keys(item).sort(), ['attackId', 'expected', 'observed']);
    assert.ok(item.expected.trim() && item.expected.length <= 300 && item.observed.length <= 300);
  }
  for (const id of WRITE_CHECKS) {
    assert.equal(attempts.find(item => item.attackId === id)?.observed, 'not_run', id);
  }
  // 요청한 메서드 목록을 남겨 둡니다(시험 출력에서 확인용).
  process.stdout.write(`# step 12 요청 ${calls.length}건: ${[...new Set(calls.map(call => call.method))].join(', ')}\n`);
});

test('npm run bundle이 불러오는 파일은 허용된 node: 모듈만 import한다', () => {
  const files = ['../scripts/bundle.mjs', '../src/decider.mjs', '../src/attack-check.mjs'];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gmu)].map(match => match[1]);
    for (const specifier of specifiers) {
      assert.ok(ALLOWED_MODULES.includes(specifier), `${file}: ${specifier}`);
    }
  }
});

test('node:crypto가 randomUUID와 sha256 hex만 될 때도 step 12 점검이 끝까지 돈다', async () => {
  // 심판 격리 환경처럼 createHash는 sha256·문자열 입력·digest('hex')만 허용하는 가짜로 바꿉니다.
  const used = { algorithms: [], inputs: [], formats: [] };
  const fakeCreateHash = algorithm => {
    used.algorithms.push(algorithm);
    if (algorithm !== 'sha256') throw new Error('hash_algorithm_unsupported');
    const real = realCreateHash('sha256');
    const hash = {
      update(input) {
        used.inputs.push(typeof input);
        if (typeof input !== 'string') throw new Error('hash_input_unsupported');
        real.update(input);
        return hash;
      },
      digest(format) {
        used.formats.push(format);
        if (format !== 'hex') throw new Error('hash_encoding_unsupported');
        return real.digest('hex');
      },
    };
    return hash;
  };
  const cryptoMock = mock.module('node:crypto', { namedExports: { randomUUID: realRandomUUID, createHash: fakeCreateHash } });
  try {
    // 이미 불러온 모듈 대신 가짜 node:crypto로 새로 불러옵니다.
    const { runAttackChecks: runHexOnly } = await import('../src/attack-check.mjs?hex-only');
    const { attempts, calls } = await runWithFakeFetch(config, runHexOnly);
    assert.ok(used.formats.length > 0, 'step 12 가짜 토큰이 sha256을 써야 함');
    assert.deepEqual([...new Set(used.formats)], ['hex']);
    assert.deepEqual([...new Set(used.algorithms)], ['sha256']);
    assert.deepEqual([...new Set(used.inputs)], ['string']);
    assert.ok(calls.every(call => ['GET', 'HEAD'].includes(call.method)));
    assert.ok(attempts.length >= 1 && attempts.length <= 20);
    process.stdout.write(`# hex 전용 node:crypto: createHash ${used.algorithms.length}회, digest 형식 ${[...new Set(used.formats)].join(',')}, 요청 ${calls.length}건
`);
  } finally {
    cryptoMock.restore();
  }
});

const field = (observed, name) => new RegExp(`(?:^| )${name}=(\\S+)`, 'u').exec(observed)?.[1] ?? null;

test('요청한 점검마다 요청을 한 번 보내고, X-Request-Id·X-Aleph-Attack-Id가 observed와 같다', async () => {
  const { attempts, calls } = await runWithFakeFetch(config);
  const sent = attempts.filter(item => item.observed !== 'not_run');
  assert.equal(sent.length, 8, '실제로 요청하는 점검 8개');
  assert.equal(calls.length, sent.length, '점검 하나당 요청 한 번');
  for (const item of sent) {
    const mine = calls.filter(call => call.headers['X-Aleph-Attack-Id'] === item.attackId);
    assert.equal(mine.length, 1, `${item.attackId}: 요청 ${mine.length}번`);
    const [call] = mine;
    assert.match(item.observed, /^requestId=\S+( responseIds=\S+)? method=(GET|HEAD) status=\d{3}( error=\S+)? checkedAt=\S+ url=\S+$/u, item.observed);
    assert.ok(item.observed.length <= 300);
    assert.equal(field(item.observed, 'requestId'), call.headers['X-Request-Id'], item.attackId);
    assert.match(call.headers['X-Request-Id'], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.equal(field(item.observed, 'method'), call.method);
    assert.equal(field(item.observed, 'url'), call.url, '요청 주소 전체(쿼리 포함)');
    assert.equal(field(item.observed, 'status'), '401');
    assert.ok(!Number.isNaN(Date.parse(field(item.observed, 'checkedAt'))));
    assert.equal(/Bearer|eyJ/u.test(item.observed), false, '토큰을 적지 않음');
  }
  assert.equal(new Set(calls.map(call => call.headers['X-Request-Id'])).size, calls.length, '요청 ID는 모두 다름');
  const query = attempts.find(item => item.attackId === 'query_appended_note_read');
  assert.match(field(query.observed, 'url'), /\?x=1$/u);
  const forged = calls.find(call => call.headers['X-Aleph-Attack-Id'] === 'forged_token_read_other_note');
  assert.match(forged.headers.Authorization, /^Bearer /u, '가짜 토큰 헤더는 그대로');
  process.stdout.write(`# observed 예: ${attempts[1].observed}\n`);
});

test('fetch가 예외를 던지면 그 점검의 observed는 not_run이다', async () => {
  const { attempts, calls } = await runWithFakeFetch(config, runAttackChecks, { fail: true });
  assert.equal(calls.length, 8, '요청은 시도했지만 나가지 못함');
  assert.equal(attempts.length, 18);
  for (const item of attempts) assert.equal(item.observed, 'not_run', item.attackId);
});

test('응답 헤더의 x-request-id·x-vercel-id가 observed에 들어가고, 주소가 길어도 ID는 잘리지 않는다', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: { ...(init.headers ?? {}) } });
    const requestId = init.headers['X-Request-Id'];
    const headers = new Headers({ 'X-Request-Id': requestId, 'X-Vercel-Id': 'icn1::fake-vercel-id-123', 'Content-Type': 'application/json' });
    return { ok: false, status: 401, headers, json: async () => ({ error: 'LOGIN_REQUIRED' }) };
  };
  try {
    const attempts = await runAttackChecks(config);
    const sent = attempts.filter(item => item.observed !== 'not_run');
    assert.equal(sent.length, 8);
    for (const item of sent) {
      const call = calls.find(c => c.headers['X-Aleph-Attack-Id'] === item.attackId);
      assert.equal(field(item.observed, 'responseIds'), `x-request-id:${call.headers['X-Request-Id']},x-vercel-id:icn1::fake-vercel-id-123`, item.attackId);
    }
    // 아주 긴 주소(원본 API 경로를 400자 넘게): 300자에서 잘려도 앞의 requestId·responseIds는 온전해야 합니다.
    const { runAttackChecks: run2 } = await import('../src/attack-check.mjs?long-url');
    const longConfig = { ...config, originalApiUrl: `${config.originalApiUrl.replace(/\/[^/]+$/u, '')}/${'v'.repeat(400)}` };
    const longAttempts = await run2(longConfig);
    const longItem = longAttempts.find(item => item.attackId === 'original_api_direct_read');
    assert.equal(longItem.observed.length, 300, '300자에서 잘림');
    const longCall = calls.at(-8);
    assert.equal(field(longItem.observed, 'requestId'), longCall.headers['X-Request-Id'], 'requestId는 온전함');
    assert.equal(field(longItem.observed, 'responseIds'), `x-request-id:${longCall.headers['X-Request-Id']},x-vercel-id:icn1::fake-vercel-id-123`, 'responseIds는 온전함');
    assert.match(longItem.observed, / method=GET status=401 error=LOGIN_REQUIRED checkedAt=\S+ url=https:\/\//u);
    process.stdout.write(`# 응답 ID 포함 observed 예: ${sent[1].observed.slice(0, 160)}…\n`);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
