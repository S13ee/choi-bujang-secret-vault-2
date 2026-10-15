// 판정기 요청 계약에 머리글·쿼리 원문·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 요청 출발지 차단 목록.
// README 주의에 따라 원격 조회 구문 원문은 이 파일과 로그에 남기지 않음.
// 보너스 xdr-03 제작 4: known-cve 경보를 decide로 판단한 뒤(respond → decide 한 방향),
//  - block이고 확신도 0.85 이상이며 출발 주소(data.srcip)가 올바른 IPv4인 경보만 xdr/known-cve/deny-rules.json의 차단 규칙으로 만듭니다(매번 처음부터 다시 씀).
//    안전장치 1: 같은 묶음에서 block이 아닌 경보(alert·record·판단 형식 오류)에도 나오는 출발 주소는 막지 않습니다(shared-with-non-block).
//    안전장치 2: 사설·특수 주소는 막지 않습니다(internal-or-special). 문서용 주소 대역은 이 목록에 넣지 않습니다.
//  - alert·block 경보는 xdr/alerts.log에 JSON 한 줄씩 덧붙이기만 합니다(기존 줄은 바꾸지 않음). 이미 있는 alertId는 다시 쓰지 않습니다. record는 쓰지 않습니다.
// 경보의 요청 주소·머리글 칸은 읽지 않고, 규칙과 로그에는 설명 원문·계정도 넣지 않습니다. reason은 decide가 돌려준 패턴 이름·수준뿐입니다.
// 시각은 경보 timestamp 글자를 직접 읽어 UTC로 계산합니다(실행하는 컴퓨터의 지역 시간을 쓰지 않음). 몇 번 돌려도 결과가 같습니다.
// 실행: node xdr/known-cve/respond.mjs
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'known-cve';
const FIXTURE = fileURLToPath(new URL('../fixtures/known-cve.json', import.meta.url));
const DENY_RULES = fileURLToPath(new URL('./deny-rules.json', import.meta.url));
const ALERTS_LOG = fileURLToPath(new URL('../alerts.log', import.meta.url));
const NOTE = '판정기 요청 계약에 머리글·쿼리 원문·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 요청 출발지 차단 목록. README 주의에 따라 원격 조회 구문 원문은 이 파일과 로그에 남기지 않음';
const BLOCK_MIN_CONFIDENCE = 0.85;
const RULE_LIFETIME_MS = 60 * 60 * 1000;

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp('^' + OCTET + '(?:\\.' + OCTET + '){3}$', 'u');
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
const srcipOf = alert => (isObject(alert) && isObject(alert.data) ? alert.data.srcip : undefined);

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

// 같은 출발 주소의 block 경보를 규칙 하나로 합칩니다. 근거 번호는 모두, 만료 시각은 가장 늦은 것.
// 규칙을 만들지 못한 block 후보는 이유별로 세고, 안전장치로 뺀 주소는 따로 모읍니다.
export function buildDenyRules(judged) {
  const nonBlockSources = new Set(judged
    .filter(({ decision }) => !decision || decision.action !== 'block')
    .map(({ alert }) => srcipOf(alert))
    .filter(isIPv4));
  const bySource = new Map();
  const skippedReasons = {};
  const excludedSources = new Set();
  const skip = reason => { skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1; };
  for (const { alert, decision } of judged) {
    if (!decision || decision.action !== 'block') continue;
    if (!(decision.confidence >= BLOCK_MIN_CONFIDENCE)) { skip('confidence-below-0.85'); continue; }
    const srcip = srcipOf(alert);
    const at = utcMillis(alert && alert.timestamp);
    if (!isIPv4(srcip)) { skip('no-ipv4-srcip'); continue; }
    if (isInternalOrSpecial(srcip)) { skip('internal-or-special'); excludedSources.add(srcip); continue; }
    if (nonBlockSources.has(srcip)) { skip('shared-with-non-block'); excludedSources.add(srcip); continue; }
    if (!Number.isFinite(at)) { skip('no-timestamp'); continue; }
    if (!SAFE_ID.test(alert.id ?? '')) { skip('no-alert-id'); continue; }
    const rule = bySource.get(srcip) ?? { srcip, reasons: [], evidenceAlertIds: [], created: at, expires: at + RULE_LIFETIME_MS };
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(decision.reason);
    if (!rule.evidenceAlertIds.includes(alert.id)) rule.evidenceAlertIds.push(alert.id);
    rule.created = Math.min(rule.created, at);
    rule.expires = Math.max(rule.expires, at + RULE_LIFETIME_MS);
    bySource.set(srcip, rule);
  }
  const rules = [...bySource.values()].map(rule => ({
    target: 'srcip',
    srcip: rule.srcip,
    action: 'block-request-source',
    reason: rule.reasons.join(' | '),
    evidenceAlertIds: rule.evidenceAlertIds,
    createdAt: isoOf(rule.created),
    expiresAt: isoOf(rule.expires),
  }));
  return { rules, skippedReasons, excludedSources: [...excludedSources] };
}

// 같은 출발 주소 규칙이 있고 at이 expiresAt 전이면 true. 칸이 이상하면 예외 없이 false.
export function isDenied(srcip, at, rules) {
  try {
    if (!isIPv4(srcip)) return false;
    const list = Array.isArray(rules) ? rules : isObject(rules) && Array.isArray(rules.rules) ? rules.rules : [];
    const when = utcMillis(at);
    if (!Number.isFinite(when)) return false;
    return list.some(rule => isObject(rule) && rule.target === 'srcip' && rule.srcip === srcip
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
      if (item && typeof item.alertId === 'string') ids.add(item.alertId);
    } catch { /* 빈 줄이나 깨진 줄은 건너뜁니다. */ }
  }
  return ids;
}

export async function respond() {
  const fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
  if (!isObject(fixture) || fixture.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== MODULE_KEY || !Array.isArray(fixture.alerts)) {
    throw new Error('known-cve 경보 묶음 형식이 아닙니다.');
  }
  const judged = [];
  for (const alert of fixture.alerts) judged.push({ alert, decision: await judge(alert) });

  const { rules, skippedReasons, excludedSources } = buildDenyRules(judged);
  await writeFile(DENY_RULES, JSON.stringify({ moduleKey: MODULE_KEY, note: NOTE, schema: 'aleph.xdr.deny-rules.v1', rules }, null, 2) + '\n', 'utf8');

  let existing = '';
  try {
    existing = await readFile(ALERTS_LOG, 'utf8');
  } catch { /* 처음 실행이면 로그가 없습니다. */ }
  const seen = loggedIds(existing);
  const newLines = [];
  let skipped = 0;
  for (const { alert, decision } of judged) {
    if (!decision || !['alert', 'block'].includes(decision.action) || !isObject(alert) || !SAFE_ID.test(alert.id ?? '')) {
      skipped += 1;
      continue;
    }
    if (seen.has(alert.id)) continue;
    seen.add(alert.id);
    const at = utcMillis(alert.timestamp);
    const srcip = srcipOf(alert);
    newLines.push(JSON.stringify({
      moduleKey: MODULE_KEY,
      at: Number.isFinite(at) ? isoOf(at) : null,
      alertId: alert.id,
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
      srcip: isIPv4(srcip) ? srcip : null,
    }));
  }
  // 기존 내용은 그대로 두고 뒤에 덧붙이기만 합니다. 마지막 줄바꿈이 없으면 줄바꿈 하나를 먼저 붙입니다.
  if (newLines.length) {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    await appendFile(ALERTS_LOG, prefix + newLines.join('\n') + '\n', 'utf8');
  }
  return { rules, written: newLines.length, skipped, skippedReasons, excludedSources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rules, written, skipped, skippedReasons, excludedSources } = await respond();
    const why = Object.entries(skippedReasons).map(([key, count]) => key + ' ' + count).join(', ');
    process.stdout.write('차단 규칙 ' + rules.length + '개 / 이번에 쓴 알림 ' + written + '줄 / 건너뛴 경보 ' + skipped + '건 / 안전장치로 뺀 주소 '
      + excludedSources.length + '개' + (why ? ' (규칙을 만들지 못한 block: ' + why + ')' : '') + '\n');
  } catch (error) {
    process.stderr.write('대응 연결 중 첫 오류: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
