// 10단계: 침해 전에 검증한 안전 정책 사본(policy/verified-policy.json)과 현재 시험 정책의 차이만 보여 줍니다.
// 이 명령은 읽기만 합니다. 어떤 파일도 바꾸지 않고, 빌드·배포에서 자동으로 돌지 않으며, DB·Vercel 설정을 건드리지 않습니다.
// 사본 파일이 없거나 지문이 policy/verified-policy.sha256과 다르면 아무것도 비교하지 않고 오류로 멈춥니다.
// 지문은 줄바꿈을 LF로 맞춘 내용의 SHA-256입니다(Windows의 CRLF 체크아웃에서도 같은 값이 나오게 하려는 것).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const SNAPSHOT = resolve(root, 'policy', 'verified-policy.json');
const DIGEST = resolve(root, 'policy', 'verified-policy.sha256');
const SCHEMA = 'byteback.verified-policy.v1';

export const lf = text => text.replace(/\r\n/gu, '\n');
export const sha256 = text => createHash('sha256').update(lf(text), 'utf8').digest('hex');
const fail = message => { throw new Error(message); };

// 키 순서와 상관없이 같은 값인지 비교하려고 정렬한 JSON 문자열로 바꿉니다.
const stable = value => JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));

export async function readVerifiedSnapshot() {
  let text;
  let digestLine;
  try {
    text = await readFile(SNAPSHOT, 'utf8');
    digestLine = await readFile(DIGEST, 'utf8');
  } catch {
    fail('검증된 정책 사본 또는 지문 파일이 없습니다 (policy/verified-policy.json, policy/verified-policy.sha256). 비교하지 않고 멈춥니다.');
  }
  const expected = digestLine.trim().split(/\s+/u)[0]?.toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(expected ?? '')) fail('지문 파일 형식이 올바르지 않습니다. 비교하지 않고 멈춥니다.');
  if (sha256(text) !== expected) fail('정책 사본 지문이 맞지 않습니다(검증 실패). 비교하지 않고 멈춥니다.');
  let snapshot;
  try { snapshot = JSON.parse(text); } catch { fail('정책 사본이 JSON이 아닙니다. 비교하지 않고 멈춥니다.'); }
  if (snapshot?.schema !== SCHEMA || typeof snapshot.version !== 'string' || !snapshot.version
      || !Array.isArray(snapshot.decider?.ruleIds) || typeof snapshot.decider?.sha256 !== 'string'
      || !snapshot.config || typeof snapshot.config !== 'object') {
    fail('정책 사본의 항목이 계약과 다릅니다. 비교하지 않고 멈춥니다.');
  }
  return snapshot;
}

async function readCurrentPolicy() {
  const deciderPath = resolve(root, 'src', 'decider.mjs');
  const deciderText = await readFile(deciderPath, 'utf8');
  // 파일 지문을 주소에 붙여, 같은 프로세스에서 파일이 바뀌면 새로 읽습니다(모듈 캐시 회피).
  const { RULE_IDS } = await import(`${pathToFileURL(deciderPath).href}?sha256=${sha256(deciderText)}`);
  const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
  return {
    'decider.ruleIds': Array.isArray(RULE_IDS) ? [...RULE_IDS] : RULE_IDS,
    'decider.sha256': sha256(deciderText),
    'config.allowedRoutes': config.allowedRoutes,
    'config.originalApiUrl': config.originalApiUrl,
    'config.identityProvider': config.identityProvider,
  };
}

const listDiff = (safe, now) => {
  if (!Array.isArray(safe) || !Array.isArray(now)) return null;
  const added = now.filter(item => !safe.includes(item));
  const removed = safe.filter(item => !now.includes(item));
  return { added, removed, reordered: !added.length && !removed.length };
};

export async function policyDiff() {
  const snapshot = await readVerifiedSnapshot();
  const safe = {
    'decider.ruleIds': snapshot.decider.ruleIds,
    'decider.sha256': snapshot.decider.sha256,
    'config.allowedRoutes': snapshot.config.allowedRoutes,
    'config.originalApiUrl': snapshot.config.originalApiUrl,
    'config.identityProvider': snapshot.config.identityProvider,
  };
  const now = await readCurrentPolicy();
  const differences = Object.keys(safe).filter(key => stable(safe[key]) !== stable(now[key]))
    .map(key => ({ key, safe: safe[key], now: now[key], list: listDiff(safe[key], now[key]) }));
  return { version: snapshot.version, baseCommit: snapshot.baseCommit, differences };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const { version, baseCommit, differences } = await policyDiff();
    process.stdout.write(`정책 사본 검증됨 · 복원할 버전: ${version} (기준 커밋 ${String(baseCommit).slice(0, 7)})\n`);
    if (!differences.length) {
      process.stdout.write('차이 없음\n');
    } else {
      process.stdout.write(`현재 시험 정책과 다른 항목 ${differences.length}개:\n`);
      for (const { key, safe, now, list } of differences) {
        if (list && !list.reordered) {
          process.stdout.write(`- ${key}: 추가 ${JSON.stringify(list.added)} · 삭제 ${JSON.stringify(list.removed)}\n`);
        } else {
          process.stdout.write(`- ${key}${list?.reordered ? ' (순서만 다름)' : ''}\n    사본: ${JSON.stringify(safe)}\n    현재: ${JSON.stringify(now)}\n`);
        }
      }
    }
    process.stdout.write('읽기 전용 비교입니다. 어떤 파일·DB·배포 설정도 바꾸지 않았습니다.\n');
  } catch (error) {
    process.stderr.write(`정책 비교 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
