// 12단계 제작 2: 기록표(npm run ops:record)가 실제 점검 결과만 옮기고, 미실행을 채우지 않는지 확인합니다. 로컬 시험이며 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';
import { OPS_CATALOG } from '../src/ops-catalog.mjs';
import { buildRecordTable, parseObserved, recordTableMarkdown } from '../src/ops-records.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));

async function bundleLikeAttempts() {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) } });
    return { ok: false, status: init.method === 'HEAD' ? 404 : 401, headers: new Headers({ 'X-Vercel-Id': 'icn1::fake-1' }),
      json: async () => ({ error: 'LOGIN_REQUIRED' }) };
  };
  try {
    return { attempts: await runAttackChecks(config), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('기록표는 bundle의 attackId·observed를 그대로 옮기고, 보낸 요청만 실행으로 적는다', async () => {
  const { attempts, calls } = await bundleLikeAttempts();
  const table = buildRecordTable({ catalog: OPS_CATALOG, attempts, source: 'bundle', commit: 'abc1234',
    publicAppUrl: config.publicAppUrl, generatedAt: '2026-10-14T00:00:00.000Z' });
  assert.equal(table.rows.length, OPS_CATALOG.length, '행 수는 시험 목록 길이 그대로');
  assert.deepEqual(table.rows.map(row => row.attackId), OPS_CATALOG.map(row => row.attackId));
  for (const attempt of attempts) {
    const row = table.rows.find(item => item.attackId === attempt.attackId);
    if (attempt.observed === 'not_run') {
      assert.equal(row.executed, '미실행');
      assert.equal(row.status, null); assert.equal(row.requestId, null); assert.equal(row.checkedAt, null);
      assert.ok(row.notRunReason);
      continue;
    }
    const parsed = parseObserved(attempt.observed);
    assert.equal(row.executed, '실행');
    assert.equal(row.requestId, parsed.requestId);
    assert.equal(row.checkedAt, parsed.checkedAt);
    assert.equal(row.status, parsed.status);
    assert.equal(row.url, parsed.url);
    // 기록표의 요청 ID는 실제로 보낸 요청의 X-Request-Id와 같아야 합니다.
    assert.equal(calls.find(call => call.headers['X-Aleph-Attack-Id'] === row.attackId).headers['X-Request-Id'], row.requestId);
  }
  for (const row of table.rows.filter(item => !OPS_CATALOG.find(c => c.attackId === item.attackId).bundle)) {
    assert.equal(row.executed, '미실행', `${row.attackId}: 묶음 밖 항목은 기록표 명령에서 실행하지 않음`);
    assert.equal(row.requestId, null);
  }
  assert.deepEqual(table.counts, { rows: 27, executed: 8, notRun: 19, statusMatched: 8, statusMismatched: 0 });
  const markdown = recordTableMarkdown(table);
  for (const row of table.rows) assert.ok(markdown.includes(`| ${row.attackId} |`));
  assert.ok(markdown.includes('미실행은 성공으로 세지 않음'));
});

test('결과가 없거나 not_run인 항목은 결과를 채우지 않는다', async () => {
  const attempts = OPS_CATALOG.filter(row => row.bundle).map(row => ({ attackId: row.attackId, observed: 'not_run' }));
  const table = buildRecordTable({ catalog: OPS_CATALOG, attempts, source: 'bundle', commit: 'x', publicAppUrl: config.publicAppUrl, generatedAt: 'x' });
  assert.equal(table.counts.executed, 0);
  assert.equal(table.counts.statusMatched, 0);
  for (const row of table.rows) {
    assert.equal(row.executed, '미실행');
    assert.equal(row.statusMatches, null, '미실행을 성공으로 세지 않음');
  }
});

test('attackId가 목록과 다르거나 observed를 읽을 수 없으면 표를 만들지 않는다', () => {
  const ids = OPS_CATALOG.filter(row => row.bundle).map(row => row.attackId);
  assert.throws(() => buildRecordTable({ catalog: OPS_CATALOG, attempts: ids.slice(1).map(attackId => ({ attackId, observed: 'not_run' })),
    source: 'bundle', commit: 'x', publicAppUrl: '', generatedAt: '' }), /attackId/u);
  const broken = ids.map((attackId, index) => ({ attackId, observed: index === 0 ? '키 없이 조회: 거부됨' : 'not_run' }));
  assert.throws(() => buildRecordTable({ catalog: OPS_CATALOG, attempts: broken, source: 'bundle', commit: 'x', publicAppUrl: '', generatedAt: '' }), /형식/u);
});

test('비밀값이 섞이면 기록표를 만들지 않는다', () => {
  const ids = OPS_CATALOG.filter(row => row.bundle).map(row => row.attackId);
  // 소스에 연락처 모양이 남지 않도록 실행할 때 가짜 이메일을 이어 붙입니다.
  const fakeContact = ['someone', 'example.com'].join('@');
  const leak = ids.map((attackId, index) => ({ attackId, observed: index === 0
    ? `requestId=r1 method=GET status=401 checkedAt=2026-10-14T00:00:00.000Z url=https://x.example/a?e=${fakeContact}` : 'not_run' }));
  assert.throws(() => buildRecordTable({ catalog: OPS_CATALOG, attempts: leak, source: 'bundle', commit: 'x', publicAppUrl: '', generatedAt: '' }), /비밀값/u);
});
