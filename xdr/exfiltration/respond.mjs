// 판정기 요청 계약에 목적지 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 목적지 차단 목록.
// 막지 않는 경보에도 나오는 목적지와 사설·특수 주소는 정상 사용자를 막지 않도록 제외함.
// 보너스 xdr-06 제작 4: exfiltration 경보를 decide로 판단한 뒤(respond → decide 한 방향),
//  - block이고 확신도 0.85 이상이며 목적지(data.dstip)가 올바른 IPv4인 경보만 xdr/exfiltration/deny-rules.json의 목적지 차단 규칙으로 만듭니다(매번 처음부터 다시 씀).
//    안전장치 1: 같은 묶음에서 block이 아닌 경보(alert·record·판단 형식 오류)에도 나오는 목적지는 막지 않습니다(shared-with-non-block).
//    안전장치 2: 사설·특수 주소는 막지 않습니다(internal-or-special). 문서용 주소 대역은 이 목록에 넣지 않습니다.
//  - alert·block 경보는 xdr/alerts.log에 JSON 한 줄씩 덧붙이기만 합니다(기존 줄은 바꾸지 않음). 이미 있는 alertId는 다시 쓰지 않습니다. record는 쓰지 않습니다.
// 규칙과 로그에 출발 주소·계정·바이트·설명 원문을 넣지 않습니다.
// 시각은 경보 timestamp 글자를 직접 읽어 UTC로 계산합니다(실행하는 컴퓨터의 지역 시간을 쓰지 않음). 몇 번 돌려도 결과가 같습니다.
// 실행: node xdr/exfiltration/respond.mjs
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'exfiltration';
const FIXTURE = fileURLToPath(new URL('../fixtures/exfiltration.json', import.meta.url));
const DENY_RULES = fileURLToPath(new URL('./deny-rules.json', import.meta.url));
const ALERTS_LOG = fileURLToPath(new URL('../alerts.log', import.meta.url));
const NOTE = '판정기 요청 계약에 목적지 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 목적지 차단 목록. 막지 않는 경보에도 나오는 목적지와 사설·특수 주소는 정상 사용자를 막지 않도록 제외함';
const BLOCK_MIN_CONFIDENCE = 0.85;
const RULE_LIFETIME_MS = 60 * 60 * 1000;

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, 'u');
export const isIPv4 = value => typeof value === 'string' && IPV4.test(value);

// 사설·특수 주소: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, 100.64/10, 224.0.0.0 이상.
// 문서용 대역(192.0.2/24, 198.51.100/24, 203.0.113/24)은 넣지 않습니다.
export function isInternalOrSpecial(ip) {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127
    || (a === 169 && b === 254) || a === 0 || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SAFE_ID = /^[A-Za-z0-9_.-]{1,64}$/u;

// 시각 글자를 직접 읽어 UTC 밀리초로 바꿉니다. 오프셋(+09:00, Z)이 없거나 형식이 깨졌으면 NaN입니다.
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/u;
export function utcMillis(value) {
  if (typeof value !== 'string' || value.length > 64) return NaN;
  const match = TIMESTAMP.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second = '0', fraction = '0', zone] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return NaN;
  let zoneMinutes = 0;
  if (zone !== 'Z') {
    const zh = Number(zone.slice(1, 3));
    const zm = Number(zone.slice(4, 6));
    if (zh > 14 || zm > 59) return NaN;
    zoneMinutes = (zone[0] === '-' ? -1 : 1) * (zh * 60 + zm);
  }
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  const local = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), ms);
  // 31일이 없는 달처럼 날짜가 넘어가면 깨진 시각으로 봅니다.
  if (new Date(local).getUTCDate() !== Number(day)) return NaN;
  return local - zoneMinutes * 60000;
}
const isoOf = ms => new Date(ms).toISOString();

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

// 같은 목적지의 block 경보를 규칙 하나로 합칩니다. 근거 번호는 모두, 만료 시각은 가장 늦은 것.
// 규칙을 만들지 못한 block 후보는 이유별로 세고, 안전장치로 뺀 목적지는 따로 모읍니다.
export function buildDenyRules(judged) {
  const nonBlockDestinations = new Set(judged
    .filter(({ decision }) => decision?.action !== 'block')
    .map(({ alert }) => alert?.data?.dstip)
    .filter(isIPv4));
  const byDestination = new Map();
  const skippedReasons = {};
  const excludedDestinations = new Set();
  const skip = reason => { skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1; };
  for (const { alert, decision } of judged) {
    if (decision?.action !== 'block') continue;
    if (!(decision.confidence >= BLOCK_MIN_CONFIDENCE)) { skip('confidence-below-0.85'); continue; }
    const dstip = alert?.data?.dstip;
    const at = utcMillis(alert?.timestamp);
    if (!isIPv4(dstip)) { skip('no-ipv4-dstip'); continue; }
    if (isInternalOrSpecial(dstip)) { skip('internal-or-special'); excludedDestinations.add(dstip); continue; }
    if (nonBlockDestinations.has(dstip)) { skip('shared-with-non-block'); excludedDestinations.add(dstip); continue; }
    if (!Number.isFinite(at)) { skip('no-timestamp'); continue; }
    if (!SAFE_ID.test(alert?.id ?? '')) { skip('no-alert-id'); continue; }
    const rule = byDestination.get(dstip) ?? { dstip, reasons: [], evidenceAlertIds: [], created: at, expires: at + RULE_LIFETIME_MS };
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(decision.reason);
    if (!rule.evidenceAlertIds.includes(alert.id)) rule.evidenceAlertIds.push(alert.id);
    rule.created = Math.min(rule.created, at);
    rule.expires = Math.max(rule.expires, at + RULE_LIFETIME_MS);
    byDestination.set(dstip, rule);
  }
  const rules = [...byDestination.values()].map(rule => ({
    target: 'dstip',
    dstip: rule.dstip,
    action: 'block-destination',
    reason: rule.reasons.join(' | '),
    evidenceAlertIds: rule.evidenceAlertIds,
    createdAt: isoOf(rule.created),
    expiresAt: isoOf(rule.expires),
  }));
  return { rules, skippedReasons, excludedDestinations: [...excludedDestinations] };
}

// 목적지가 같은 규칙이 있고 at이 expiresAt 전이면 true. 칸이 이상하면 예외 없이 false.
export function isDenied(dstip, at, rules) {
  try {
    if (!isIPv4(dstip)) return false;
    const list = Array.isArray(rules) ? rules : Array.isArray(rules?.rules) ? rules.rules : [];
    const when = utcMillis(at);
    if (!Number.isFinite(when)) return false;
    return list.some(rule => isObject(rule) && rule.target === 'dstip' && rule.dstip === dstip
      && Number.isFinite(utcMillis(rule.expiresAt)) && when < utcMillis(rule.expiresAt));
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
    throw new Error('exfiltration 경보 묶음 형식이 아닙니다.');
  }
  const judged = [];
  for (const alert of fixture.alerts) judged.push({ alert, decision: await judge(alert) });

  const { rules, skippedReasons, excludedDestinations } = buildDenyRules(judged);
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
    const at = utcMillis(alert.timestamp);
    newLines.push(JSON.stringify({
      moduleKey: MODULE_KEY,
      at: Number.isFinite(at) ? isoOf(at) : null,
      alertId: alert.id,
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
      dstip: isIPv4(alert.data?.dstip) ? alert.data.dstip : null,
    }));
  }
  // 기존 내용은 그대로 두고 뒤에 덧붙이기만 합니다. 마지막 줄바꿈이 없으면 줄바꿈 하나를 먼저 붙입니다.
  if (newLines.length) {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(ALERTS_LOG, `${prefix}${newLines.join('\n')}\n`, 'utf8');
  }
  return { rules, written: newLines.length, skipped, skippedReasons, excludedDestinations };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rules, written, skipped, skippedReasons, excludedDestinations } = await respond();
    const why = Object.entries(skippedReasons).map(([key, count]) => `${key} ${count}`).join(', ');
    process.stdout.write(`차단 규칙 ${rules.length}개 / 이번에 쓴 알림 ${written}줄 / 건너뛴 경보 ${skipped}건 / 안전장치로 뺀 목적지 ${excludedDestinations.length}개${why ? ` (규칙을 만들지 못한 block: ${why})` : ''}\n`);
  } catch (error) {
    process.stderr.write(`대응 연결 중 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
