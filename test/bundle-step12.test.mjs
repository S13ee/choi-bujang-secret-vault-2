// 12단계: 심판은 격리 환경에서 npm run bundle을 실행합니다. 그 환경에서는 node:fs·node:path·node:url·node:child_process·
// node:crypto만 쓸 수 있고, 요청은 공개 HTTPS 주소로 보내는 GET·HEAD만 됩니다.
// 이 시험은 fetch를 가짜로 바꿔 step 12 점검이 GET·HEAD 외의 요청을 하나라도 보내면 실패합니다.
// 로컬 시험이며 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const ALLOWED_MODULES = ['node:fs', 'node:path', 'node:url', 'node:child_process', 'node:crypto'];
const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const WRITE_CHECKS = ['anonymous_create_note', 'anonymous_admin_notice_update', 'anonymous_note_restore'];

async function runWithFakeFetch(stepConfig) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalBuffer = globalThis.Buffer;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method ?? 'GET').toUpperCase(), hasBody: init.body !== undefined });
    return { ok: false, status: 401, json: async () => ({ error: 'LOGIN_REQUIRED' }) };
  };
  // step 12 점검이 전역 Buffer·crypto에 기대지 않는지 보려고 실행하는 동안 지웁니다.
  globalThis.Buffer = undefined;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    return { attempts: await runAttackChecks(stepConfig), calls };
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
