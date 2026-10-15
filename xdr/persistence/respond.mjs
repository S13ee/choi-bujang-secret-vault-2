// 판정기 요청 계약에 PC 이름·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 격리 목록.
// 시험 경보가 모두 한 PC에서 나와 PC 전체가 아니라 PC+출발 주소 단위로 격리함.
// 보너스 xdr-04 제작 4: persistence 경보를 decide로 판단한 뒤(respond → decide 한 방향),
//  - block이고 확신도 0.85 이상이며 PC 이름(agent.name)과 올바른 IPv4 출발 주소가 모두 있는 경보만
//    xdr/persistence/deny-rules.json의 격리 규칙으로 만듭니다(매번 처음부터 다시 씀). PC만·주소만인 규칙은 만들지 않습니다.
//  - alert·block 경보는 xdr/alerts.log에 JSON 한 줄씩 덧붙이기만 합니다(기존 줄은 바꾸지 않음). 이미 있는 alertId는 다시 쓰지 않습니다. record는 쓰지 않습니다.
// 규칙과 로그에 계정 이름·경로(data.path)·설명 원문을 넣지 않습니다. 시각은 경보 timestamp로 계산하므로 몇 번 돌려도 결과가 같습니다.
// 실행: node xdr/persistence/respond.mjs
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'persistence';
const FIXTURE = fileURLToPath(new URL('../fixtures/persistence.json', import.meta.url));
const DENY_RULES = fileURLToPath(new URL('./deny-rules.json', import.meta.url));
const ALERTS_LOG = fileURLToPath(new URL('../alerts.log', import.meta.url));
const NOTE = '판정기 요청 계약에 PC 이름·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 격리 목록. 시험 경보가 모두 한 PC에서 나와 PC 전체가 아니라 PC+출발 주소 단위로 격리함';
const BLOCK_MIN_CONFIDENCE = 0.85;
const RULE_LIFETIME_MS = 60 * 60 * 1000;

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, 'u');
export const isIPv4 = value => typeof value === 'string' && IPV4.test(value);
// PC 이름은 비어 있지 않은 짧은 글자만 씁니다(공백만 있거나 줄바꿈·제어 문자가 있으면 쓰지 않음).
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/u;
export const isAgent = value => typeof value === 'string' && AGENT.test(value);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timeOf = value => (typeof value === 'string' || value instanceof Date ? new Date(value).getTime() : NaN);
const SAFE_ID = /^[A-Za-z0-9_.-]{1,64}$/u;

// 경보 하나를 판단합니다. 판단이 형식에 맞지 않거나 예외가 나면 null(건너뜀)입니다.
async function judge(alert) {
  try {
    const out = await decide(alert);
    if (!isObject(out) || !['block', 'alert', 'record'].includes(out.action)
        || typeof out.confidence !== 'number' || typeof out.reason !== 'string') return null;
    return out;
  } catch {
    return null;
  }
}

// 같은 PC + 같은 주소의 block 경보를 규칙 하나로 합칩니다. 근거 번호는 모두, 만료 시각은 가장 늦은 것.
// 규칙을 만들지 못한 block 후보는 이유별로 셉니다.
export function buildDenyRules(judged) {
  const byPair = new Map();
  const skippedReasons = {};
  const skip = reason => { skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1; };
  for (const { alert, decision } of judged) {
    if (decision?.action !== 'block') continue;
    if (!(decision.confidence >= BLOCK_MIN_CONFIDENCE)) { skip('confidence-below-0.85'); continue; }
    const agent = alert?.agent?.name;
    const srcip = alert?.data?.srcip;
    const at = timeOf(alert?.timestamp);
    if (!isAgent(agent)) { skip('no-agent'); continue; }
    if (!isIPv4(srcip)) { skip('no-ipv4-srcip'); continue; }
    if (!Number.isFinite(at)) { skip('no-timestamp'); continue; }
    if (!SAFE_ID.test(alert?.id ?? '')) { skip('no-alert-id'); continue; }
    const key = `${agent} ${srcip}`;
    const rule = byPair.get(key) ?? { agent, srcip, reasons: [], evidenceAlertIds: [], created: at, expires: at + RULE_LIFETIME_MS };
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(decision.reason);
    if (!rule.evidenceAlertIds.includes(alert.id)) rule.evidenceAlertIds.push(alert.id);
    rule.created = Math.min(rule.created, at);
    rule.expires = Math.max(rule.expires, at + RULE_LIFETIME_MS);
    byPair.set(key, rule);
  }
  const rules = [...byPair.values()].map(rule => ({
    target: 'agent+srcip',
    agent: rule.agent,
    srcip: rule.srcip,
    reason: rule.reasons.join(' | '),
    evidenceAlertIds: rule.evidenceAlertIds,
    createdAt: new Date(rule.created).toISOString(),
    expiresAt: new Date(rule.expires).toISOString(),
  }));
  return { rules, skippedReasons };
}

// PC와 주소가 둘 다 같은 규칙이 있고 at이 expiresAt 전이면 true. 칸이 이상하면 예외 없이 false.
export function isDenied(agent, srcip, at, rules) {
  try {
    if (!isAgent(agent) || !isIPv4(srcip)) return false;
    const list = Array.isArray(rules) ? rules : Array.isArray(rules?.rules) ? rules.rules : [];
    const when = timeOf(at);
    if (!Number.isFinite(when)) return false;
    return list.some(rule => isObject(rule) && rule.target === 'agent+srcip' && rule.agent === agent && rule.srcip === srcip
      && Number.isFinite(timeOf(rule.expiresAt)) && when < timeOf(rule.expiresAt));
  } catch {
    return false;
  }
}

// alerts.log에 이미 있는 alertId를 모읍니다(어느 과제의 줄이든). 읽을 수 없는 줄은 무시합니다.
function loggedIds(text) {
  const ids = new Set();
  for (const line of text.split('\n')) {
    try {
      const item = JSON.parse(line);
      if (typeof item?.alertId === 'string') ids.add(item.alertId);
    } catch { /* 빈 줄이나 깨진 줄은 건너뜁니다. */ }
  }
  return ids;
}

export async function respond() {
  const fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== MODULE_KEY || !Array.isArray(fixture.alerts)) {
    throw new Error('persistence 경보 묶음 형식이 아닙니다.');
  }
  const judged = [];
  for (const alert of fixture.alerts) judged.push({ alert, decision: await judge(alert) });

  const { rules, skippedReasons } = buildDenyRules(judged);
  await writeFile(DENY_RULES, `${JSON.stringify({ moduleKey: MODULE_KEY, note: NOTE, schema: 'aleph.xdr.deny-rules.v1', rules }, null, 2)}\n`, 'utf8');

  let existing = '';
  try {
    existing = await readFile(ALERTS_LOG, 'utf8');
  } catch { /* 처음 실행이면 로그가 없습니다. */ }
  const seen = loggedIds(existing);
  const newLines = [];
  let skipped = 0;
  for (const { alert, decision } of judged) {
    if (!decision || !['alert', 'block'].includes(decision.action) || !SAFE_ID.test(alert?.id ?? '')) {
      skipped += 1;
      continue;
    }
    if (seen.has(alert.id)) continue;
    seen.add(alert.id);
    const at = timeOf(alert.timestamp);
    newLines.push(JSON.stringify({
      moduleKey: MODULE_KEY,
      at: Number.isFinite(at) ? new Date(at).toISOString() : null,
      alertId: alert.id,
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
      agent: isAgent(alert.agent?.name) ? alert.agent.name : null,
      srcip: isIPv4(alert.data?.srcip) ? alert.data.srcip : null,
    }));
  }
  // 기존 내용은 그대로 두고 뒤에 덧붙이기만 합니다. 마지막 줄바꿈이 없으면 줄바꿈 하나를 먼저 붙입니다.
  if (newLines.length) {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(ALERTS_LOG, `${prefix}${newLines.join('\n')}\n`, 'utf8');
  }
  return { rules, written: newLines.length, skipped, skippedReasons };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rules, written, skipped, skippedReasons } = await respond();
    const why = Object.entries(skippedReasons).map(([key, count]) => `${key} ${count}`).join(', ');
    process.stdout.write(`격리 규칙 ${rules.length}개 / 이번에 쓴 알림 ${written}줄 / 건너뛴 경보 ${skipped}건${why ? ` (규칙을 만들지 못한 block: ${why})` : ''}\n`);
  } catch (error) {
    process.stderr.write(`대응 연결 중 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
