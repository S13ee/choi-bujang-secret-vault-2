// 판정기 요청 계약에 IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 목록.
// 보너스 xdr-02 제작 4: web-injection 경보를 decide로 판단한 뒤(respond → decide 한 방향),
//  - block이고 확신도 0.85 이상이며 출발 주소가 올바른 IPv4인 경보만 xdr/web-injection/deny-rules.json의 거부 규칙으로 만듭니다(매번 처음부터 다시 씀).
//    공용 xdr/deny-rules.json은 brute-force respond가 매번 다시 쓰므로 쓰지 않습니다.
//  - alert·block 경보는 xdr/alerts.log에 JSON 한 줄씩 덧붙이기만 합니다(기존 줄은 바꾸지 않음). 이미 있는 alertId는 다시 쓰지 않습니다. record는 쓰지 않습니다.
// 계정으로는 막지 않고, 규칙과 로그에 계정 이름·url·공격 문자열을 넣지 않습니다.
// 시각은 실행 시각이 아니라 경보의 timestamp로 계산하므로 몇 번 돌려도 결과가 같습니다.
// 실행: node xdr/web-injection/respond.mjs
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'web-injection';
const FIXTURE = fileURLToPath(new URL('../fixtures/web-injection.json', import.meta.url));
const DENY_RULES = fileURLToPath(new URL('./deny-rules.json', import.meta.url));
const ALERTS_LOG = fileURLToPath(new URL('../alerts.log', import.meta.url));
const NOTE = '판정기 요청 계약에 IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 목록';
const BLOCK_MIN_CONFIDENCE = 0.85;
const RULE_LIFETIME_MS = 60 * 60 * 1000;

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, 'u');
export const isIPv4 = value => typeof value === 'string' && IPV4.test(value);

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

// 같은 주소의 block 경보를 규칙 하나로 합칩니다. 근거 번호는 모두, 만료 시각은 가장 늦은 것.
export function buildDenyRules(judged) {
  const bySource = new Map();
  for (const { alert, decision } of judged) {
    if (decision?.action !== 'block' || !(decision.confidence >= BLOCK_MIN_CONFIDENCE)) continue;
    const srcip = alert?.data?.srcip;
    const at = timeOf(alert?.timestamp);
    if (!isIPv4(srcip) || !Number.isFinite(at) || !SAFE_ID.test(alert?.id ?? '')) continue;
    const rule = bySource.get(srcip) ?? { value: srcip, reasons: [], evidenceAlertIds: [], created: at, expires: at + RULE_LIFETIME_MS };
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(decision.reason);
    if (!rule.evidenceAlertIds.includes(alert.id)) rule.evidenceAlertIds.push(alert.id);
    rule.created = Math.min(rule.created, at);
    rule.expires = Math.max(rule.expires, at + RULE_LIFETIME_MS);
    bySource.set(srcip, rule);
  }
  return [...bySource.values()].map(rule => ({
    target: 'srcip',
    value: rule.value,
    reason: rule.reasons.join(' | '),
    evidenceAlertIds: rule.evidenceAlertIds,
    createdAt: new Date(rule.created).toISOString(),
    expiresAt: new Date(rule.expires).toISOString(),
  }));
}

// 규칙에 있는 주소이고 at이 expiresAt 전이면 true. 칸이 이상하면 예외 없이 false.
export function isDenied(srcip, at, rules) {
  try {
    if (!isIPv4(srcip)) return false;
    const list = Array.isArray(rules) ? rules : Array.isArray(rules?.rules) ? rules.rules : [];
    const when = timeOf(at);
    if (!Number.isFinite(when)) return false;
    return list.some(rule => isObject(rule) && rule.target === 'srcip' && rule.value === srcip
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
    throw new Error('web-injection 경보 묶음 형식이 아닙니다.');
  }
  const judged = [];
  for (const alert of fixture.alerts) judged.push({ alert, decision: await judge(alert) });

  const rules = buildDenyRules(judged);
  await writeFile(DENY_RULES, `${JSON.stringify({ note: NOTE, schema: 'aleph.xdr.deny-rules.v1', moduleKey: MODULE_KEY, rules }, null, 2)}\n`, 'utf8');

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
      srcip: isIPv4(alert.data?.srcip) ? alert.data.srcip : null,
    }));
  }
  // 기존 내용은 그대로 두고 뒤에 덧붙이기만 합니다. 마지막 줄바꿈이 없으면 줄바꿈 하나를 먼저 붙입니다.
  if (newLines.length) {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(ALERTS_LOG, `${prefix}${newLines.join('\n')}\n`, 'utf8');
  }
  return { rules, written: newLines.length, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rules, written, skipped } = await respond();
    process.stdout.write(`거부 규칙 ${rules.length}개 / 이번에 쓴 알림 ${written}줄 / 건너뛴 경보 ${skipped}건\n`);
  } catch (error) {
    process.stderr.write(`대응 연결 중 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
