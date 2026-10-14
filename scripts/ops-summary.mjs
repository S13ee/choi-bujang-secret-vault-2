// 12단계 제작 1: 작전실 화면이 보여 줄 요약을 빌드할 때 저장소 파일에서 그대로 읽어 만듭니다(public/ops-summary.json, Git 제외).
// - 판정기: src/decider.mjs의 RULE_IDS(이름과 개수)
// - 탐지 규칙: src/detect.mjs에 적힌 reasonCode와 BURST_LIMIT 값
// - 복구 버전: policy/verified-policy.json의 버전·기준 커밋, policy/restore-log.jsonl의 줄 수, restoreRoute
// 실행 결과나 점수는 넣지 않습니다(결과는 화면이 실제 요청으로만 채움). 키·토큰·계정 정보는 넣지 않습니다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildOpsSummary(root, env = {}) {
  const read = file => readFileSync(join(root, file), 'utf8');
  const config = JSON.parse(read('aleph.config.json'));
  const { RULE_IDS } = await import(pathToFileURL(join(root, 'src', 'decider.mjs')).href);
  const detectSource = read('src/detect.mjs');
  const policy = JSON.parse(read('policy/verified-policy.json'));
  let restoreLogEntries = 0;
  try { restoreLogEntries = read('policy/restore-log.jsonl').split(/\r?\n/u).filter(line => line.trim()).length; } catch { restoreLogEntries = 0; }
  const commit = typeof env.VERCEL_GIT_COMMIT_SHA === 'string' && /^[0-9a-f]{40}$/iu.test(env.VERCEL_GIT_COMMIT_SHA)
    ? env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : null;
  return {
    schema: 'aleph.ops.summary.v1',
    step: config.step,
    commit,
    decider: { ruleCount: RULE_IDS.length, ruleIds: [...RULE_IDS] },
    detect: {
      reasonCodes: [...new Set([...detectSource.matchAll(/reasonCode: '([a-z_]+)'/gu)].map(match => match[1]))],
      burstLimit: Number(/const BURST_LIMIT = (\d+);/u.exec(detectSource)?.[1]) || null,
    },
    restore: { policyVersion: policy.version, policyBaseCommit: policy.baseCommit, restoreLogEntries, restoreRoute: config.restoreRoute ?? null },
    identity: { issuer: config.identityProvider?.issuer ?? null, audience: config.identityProvider?.audience ?? null },
    originalApiUrl: config.originalApiUrl ?? null,
    publicAppUrl: config.publicAppUrl ?? null,
  };
}
