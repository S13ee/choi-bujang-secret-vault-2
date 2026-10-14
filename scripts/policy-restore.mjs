// 10단계: 검증한 안전 정책 사본(policy/verified-policy.json)으로 시험 정책을 되돌립니다.
// 기본은 미리보기입니다. policy:diff와 같은 검증을 거친 뒤 바뀔 항목만 보여 주고 끝납니다.
// --apply를 붙였을 때만 사본에 있는 항목을 실제로 되돌립니다.
//   - src/decider.mjs: 기준 커밋의 파일을 git에서 꺼내, 그 지문이 사본과 같을 때만 덮어씁니다.
//   - aleph.config.json: 사본에 있는 칸(allowedRoutes·originalApiUrl·identityProvider)만 바꾸고 다른 칸은 그대로 둡니다.
//   - src/detect.mjs, API, 화면, DB, Vercel 설정은 건드리지 않습니다.
// 되돌릴 때마다 policy/restore-log.jsonl에 시각·버전·바뀐 항목 이름만 한 줄 덧붙입니다(기존 줄은 그대로).
// 사본 검증 실패, 기준 커밋 없음, 지문 불일치면 아무것도 바꾸지 않고 멈춥니다. 빌드·배포에서 자동으로 돌지 않습니다.
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { policyDiff, readVerifiedSnapshot, sha256 } from './policy-diff.mjs';

const root = resolve(import.meta.dirname, '..');
const DECIDER = resolve(root, 'src', 'decider.mjs');
const CONFIG = resolve(root, 'aleph.config.json');
const LOG = resolve(root, 'policy', 'restore-log.jsonl');
const CONFIG_KEYS = { 'config.allowedRoutes': 'allowedRoutes', 'config.originalApiUrl': 'originalApiUrl',
  'config.identityProvider': 'identityProvider' };
const fail = message => { throw new Error(message); };
const git = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
});
// 지금 파일의 줄바꿈(CRLF/LF)을 그대로 따라 씁니다.
const sameEol = (current, text) => (current.includes('\r\n') ? text.replace(/\r?\n/gu, '\r\n') : text);

// 기준 커밋의 판정기 파일을 꺼내 사본 지문·규칙 이름과 같은지 확인합니다. 하나라도 다르면 멈춥니다.
async function verifiedBaseDecider(snapshot) {
  if (!/^[0-9a-f]{40}$/u.test(snapshot.baseCommit ?? '')) fail('사본의 기준 커밋 형식이 올바르지 않습니다. 아무것도 바꾸지 않고 멈춥니다.');
  let text;
  try {
    git('cat-file', '-e', `${snapshot.baseCommit}^{commit}`);
    text = git('show', `${snapshot.baseCommit}:src/decider.mjs`);
  } catch {
    fail('기준 커밋 또는 그 커밋의 src/decider.mjs를 찾을 수 없습니다. 아무것도 바꾸지 않고 멈춥니다.');
  }
  if (sha256(text) !== snapshot.decider.sha256) fail('기준 커밋 판정기 지문이 사본과 다릅니다. 아무것도 바꾸지 않고 멈춥니다.');
  const { RULE_IDS } = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
  if (JSON.stringify([...RULE_IDS]) !== JSON.stringify(snapshot.decider.ruleIds)) {
    fail('기준 커밋 판정기의 규칙 이름이 사본과 다릅니다. 아무것도 바꾸지 않고 멈춥니다.');
  }
  return text;
}

export async function policyRestore({ apply = false } = {}) {
  // 1) 검증: 사본 지문 → 기준 커밋 → 판정기 지문. 여기까지 파일을 하나도 바꾸지 않습니다.
  const snapshot = await readVerifiedSnapshot();
  const baseDecider = await verifiedBaseDecider(snapshot);
  const { differences } = await policyDiff();
  const changed = differences.map(item => item.key);
  if (!apply || !changed.length) return { version: snapshot.version, changed, applied: false, differences };

  // 2) 적용: 사본에 있는 항목만 되돌립니다.
  if (changed.some(key => key.startsWith('decider.'))) {
    const current = await readFile(DECIDER, 'utf8');
    await writeFile(DECIDER, sameEol(current, baseDecider), 'utf8');
  }
  const configKeys = changed.filter(key => key in CONFIG_KEYS);
  if (configKeys.length) {
    const current = await readFile(CONFIG, 'utf8');
    const config = JSON.parse(current);
    for (const key of configKeys) config[CONFIG_KEYS[key]] = snapshot.config[CONFIG_KEYS[key]];
    await writeFile(CONFIG, sameEol(current, `${JSON.stringify(config, null, 2)}\n`), 'utf8');
  }
  // 3) 감사 이력: 시각·버전·바뀐 항목 이름만 한 줄 덧붙입니다.
  await appendFile(LOG, `${JSON.stringify({ at: new Date().toISOString(), version: snapshot.version, changed })}\n`, 'utf8');
  const after = await policyDiff();
  return { version: snapshot.version, changed, applied: true, remaining: after.differences.map(item => item.key) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const apply = process.argv.includes('--apply');
  try {
    const result = await policyRestore({ apply });
    process.stdout.write(`정책 사본 검증됨 · 기준 커밋·판정기 지문 확인됨 · 복원할 버전: ${result.version}\n`);
    if (!result.changed.length) {
      process.stdout.write('차이 없음 · 되돌릴 항목이 없어 아무것도 바꾸지 않았습니다.\n');
    } else if (!result.applied) {
      process.stdout.write(`미리보기 · --apply로 실행하면 바뀔 항목 ${result.changed.length}개:\n`);
      for (const { key, list } of result.differences) {
        const detail = list && !list.reordered ? ` (현재 대비 되살릴 것 ${JSON.stringify(list.removed)} · 지울 것 ${JSON.stringify(list.added)})` : '';
        process.stdout.write(`- ${key}${detail}\n`);
      }
      process.stdout.write('아무것도 바꾸지 않았습니다. 실제로 되돌리려면: npm run policy:restore -- --apply\n');
    } else {
      process.stdout.write(`되돌림 완료 · 바뀐 항목: ${result.changed.join(', ')}\n`);
      process.stdout.write(`감사 이력 policy/restore-log.jsonl에 한 줄을 덧붙였습니다.\n`);
      process.stdout.write(result.remaining.length ? `남은 차이: ${result.remaining.join(', ')}\n` : '되돌린 뒤 다시 비교: 차이 없음\n');
    }
  } catch (error) {
    process.stderr.write(`정책 되돌리기 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
