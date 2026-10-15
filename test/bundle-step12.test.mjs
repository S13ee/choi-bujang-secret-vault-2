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

// observed 형식: "<메서드> <쿼리 포함 전체 주소> → HTTP <실제 받은 상태>[ <error>] · requestId=<우리 ID> · checkedAt=<ISO 시각>"
const OBSERVED = /^(GET|HEAD) (https:\/\/\S+) → HTTP (\d{3})(?: ([A-Za-z0-9_.-]{1,60}))?(?: · requestId=(\S+))?(?: · checkedAt=(\S+))?$/u;
const parse = observed => {
  const match = OBSERVED.exec(observed);
  return match ? { method: match[1], url: match[2], status: Number(match[3]), error: match[4] ?? null,
    requestId: match[5] ?? null, checkedAt: match[6] ?? null } : null;
};

test('요청한 점검마다 요청을 한 번 보내고, X-Request-Id·X-Aleph-Attack-Id가 observed와 같다', async () => {
  const { attempts, calls } = await runWithFakeFetch(config);
  const sent = attempts.filter(item => item.observed !== 'not_run');
  assert.equal(sent.length, 8, '실제로 요청하는 점검 8개');
  assert.equal(calls.length, sent.length, '점검 하나당 요청 한 번');
  for (const item of sent) {
    const mine = calls.filter(call => call.headers['X-Aleph-Attack-Id'] === item.attackId);
    assert.equal(mine.length, 1, `${item.attackId}: 요청 ${mine.length}번`);
    const [call] = mine;
    const parsed = parse(item.observed);
    assert.ok(parsed, `${item.attackId}: 형식 ${item.observed}`);
    assert.ok(item.observed.startsWith(`${call.method} ${call.url} → HTTP `), '메서드와 전체 주소를 맨 앞에');
    assert.ok(item.observed.length <= 300);
    assert.equal(parsed.requestId, call.headers['X-Request-Id'], item.attackId);
    assert.match(call.headers['X-Request-Id'], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.equal(parsed.status, 401);
    assert.ok(!Number.isNaN(Date.parse(parsed.checkedAt)));
    assert.equal(/Bearer|eyJ|responseIds/u.test(item.observed), false, '토큰·responseIds를 적지 않음');
  }
  assert.equal(new Set(calls.map(call => call.headers['X-Request-Id'])).size, calls.length, '요청 ID는 모두 다름');
  const query = attempts.find(item => item.attackId === 'query_appended_note_read');
  assert.match(parse(query.observed).url, /\?x=1$/u);
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

test('observed는 "<메서드> https://…"로 시작하고 HTTP 상태는 실제로 받은 값이며 300자 이하, 넘치면 checkedAt·requestId 순서로 뺀다', async () => {
  // 점검마다 다른 상태를 돌려줘, observed의 숫자가 실제로 받은 response.status인지 확인합니다.
  const STATUS = { original_api_direct_read: 403, anonymous_list_notes: 401, anonymous_read_other_note: 404,
    forged_token_read_other_note: 401, query_appended_note_read: 400, anonymous_list_notices: 401,
    anonymous_device_status: 429, public_data_json_head: 404 };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const attackId = init.headers['X-Aleph-Attack-Id'];
    calls.push({ url: String(url), method: init.method, headers: { ...init.headers } });
    const status = STATUS[attackId] ?? 500;
    return { ok: false, status, headers: new Headers({ 'X-Vercel-Id': 'icn1::fake' }), json: async () => ({ error: `CODE_${status}` }) };
  };
  try {
    const attempts = await runAttackChecks(config);
    const sent = attempts.filter(item => item.observed !== 'not_run');
    assert.equal(sent.length, 8);
    for (const item of sent) {
      const call = calls.find(c => c.headers['X-Aleph-Attack-Id'] === item.attackId);
      const parsed = parse(item.observed);
      assert.match(item.observed, /^(GET|HEAD) https:\/\//u, item.attackId);
      assert.match(item.observed, / → HTTP \d{3}/u);
      assert.equal(parsed.status, STATUS[item.attackId], `${item.attackId}: 받은 상태 그대로`);
      assert.equal(parsed.url, call.url);
      assert.equal(parsed.error, call.method === 'HEAD' ? null : `CODE_${STATUS[item.attackId]}`, 'HEAD는 본문을 읽지 않음');
      assert.ok(item.observed.length <= 300, `${item.attackId}: ${item.observed.length}자`);
    }
    // 주소가 길어지면 checkedAt → requestId 순서로 빠지고, 메서드·주소·HTTP 상태는 그대로 남습니다.
    const base = config.originalApiUrl.replace(/\/[^/]+$/u, '');
    const stages = [];
    for (const extra of [40, 150, 200]) {
      const longUrl = `${base}/${'v'.repeat(extra)}`;
      const item = (await runAttackChecks({ ...config, originalApiUrl: longUrl })).find(a => a.attackId === 'original_api_direct_read');
      const parsed = parse(item.observed);
      assert.ok(item.observed.length <= 300, `${extra}: ${item.observed.length}자`);
      assert.equal(parsed.url, longUrl);
      assert.equal(parsed.status, 403);
      if (!parsed.requestId) assert.equal(parsed.checkedAt, null, 'requestId가 빠졌으면 checkedAt도 빠져 있어야 함(빼는 순서)');
      stages.push(`${parsed.requestId ? 'requestId' : '-'}/${parsed.checkedAt ? 'checkedAt' : '-'}`);
    }
    assert.deepEqual(stages, ['requestId/checkedAt', 'requestId/-', '-/-']);
    // 메서드·주소·HTTP 상태만으로도 300자를 넘는 주소는 자르지 않고 그대로 둡니다(알려야 할 예외).
    const tooLong = `${base}/${'v'.repeat(260)}`;
    const over = (await runAttackChecks({ ...config, originalApiUrl: tooLong })).find(a => a.attackId === 'original_api_direct_read');
    assert.equal(over.observed, `GET ${tooLong} → HTTP 403 CODE_403`);
    process.stdout.write(`# 길이별 남은 항목: ${stages.join(' → ')} · 예외: 주소 ${tooLong.length}자이면 observed ${over.observed.length}자(자르지 않음)\n`);
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
