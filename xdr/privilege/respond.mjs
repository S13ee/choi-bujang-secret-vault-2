// 판정기 요청 계약에 계정 이름·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 세션 회수 목록.
// 공격 계정이 정상 접속에도 쓰여 계정 전체가 아니라 계정+출발 주소 단위로 회수함. 경보 설명에 여러 계정이 나와도 경보에 이름이 적힌 계정만 규칙으로 만듦.
// 보너스 xdr-05 제작 4: privilege 경보를 decide로 판단한 뒤(respond → decide 한 방향),
//  - block이고 확신도 0.85 이상이며 안전한 계정 이름(data.srcuser)과 올바른 IPv4 출발 주소가 모두 있는 경보만
//    xdr/privilege/deny-rules.json의 세션 회수 규칙으로 만듭니다(매번 처음부터 다시 씀). 계정만·주소만인 규칙은 만들지 않습니다.
//  - alert·block 경보는 xdr/alerts.log에 JSON 한 줄씩 덧붙이기만 합니다(기존 줄은 바꾸지 않음). 이미 있는 alertId는 다시 쓰지 않습니다. record는 쓰지 않습니다.
// 규칙에는 그룹 이름·설명 원문을, 알림에는 계정 이름·그룹을 넣지 않습니다.
// 시각은 경보 timestamp 글자를 직접 읽어 UTC로 계산합니다(실행하는 컴퓨터의 지역 시간을 쓰지 않음). 몇 번 돌려도 결과가 같습니다.
// 실행: node xdr/privilege/respond.mjs
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'privilege';
const FIXTURE = fileURLToPath(new URL('../fixtures/privilege.json', import.meta.url));
const DENY_RULES = fileURLToPath(new URL('./deny-rules.json', import.meta.url));
const ALERTS_LOG = fileURLToPath(new URL('../alerts.log', import.meta.url));
const NOTE = '판정기 요청 계약에 계정 이름·IP 칸이 없어 src/decider.mjs에는 연결하지 않음. 판정기 앞단의 추가 확인 단계로 쓰는 세션 회수 목록. 공격 계정이 정상 접속에도 쓰여 계정 전체가 아니라 계정+출발 주소 단위로 회수함. 경보 설명에 여러 계정이 나와도 경보에 이름이 적힌 계정만 규칙으로 만듦';
const BLOCK_MIN_CONFIDENCE = 0.85;
const RULE_LIFETIME_MS = 60 * 60 * 1000;

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, 'u');
export const isIPv4 = value => typeof value === 'string' && IPV4.test(value);
// 계정 이름은 영문·숫자·_.-로 된 64자 이내 글자만 씁니다.
const ACCOUNT = /^[A-Za-z0-9_.-]{1,64}$/u;
export const isAccount = value => typeof value === 'string' && ACCOUNT.test(value);

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

// 같은 계정 + 같은 주소의 block 경보를 규칙 하나로 합칩니다. 근거 번호는 모두, 만료 시각은 가장 늦은 것.
// 규칙을 만들지 못한 block 후보는 이유별로 셉니다.
export function buildDenyRules(judged) {
  const byPair = new Map();
  const skippedReasons = {};
  const skip = reason => { skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1; };
  for (const { alert, decision } of judged) {
    if (decision?.action !== 'block') continue;
    if (!(decision.confidence >= BLOCK_MIN_CONFIDENCE)) { skip('confidence-below-0.85'); continue; }
    const srcuser = alert?.data?.srcuser;
    const srcip = alert?.data?.srcip;
    const at = utcMillis(alert?.timestamp);
    if (!isAccount(srcuser)) { skip('no-safe-srcuser'); continue; }
    if (!isIPv4(srcip)) { skip('no-ipv4-srcip'); continue; }
    if (!Number.isFinite(at)) { skip('no-timestamp'); continue; }
    if (!SAFE_ID.test(alert?.id ?? '')) { skip('no-alert-id'); continue; }
    const key = `${srcuser} ${srcip}`;
    const rule = byPair.get(key) ?? { srcuser, srcip, reasons: [], evidenceAlertIds: [], created: at, expires: at + RULE_LIFETIME_MS };
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(decision.reason);
    if (!rule.evidenceAlertIds.includes(alert.id)) rule.evidenceAlertIds.push(alert.id);
    rule.created = Math.min(rule.created, at);
    rule.expires = Math.max(rule.expires, at + RULE_LIFETIME_MS);
    byPair.set(key, rule);
  }
  const rules = [...byPair.values()].map(rule => ({
    target: 'srcuser+srcip',
    srcuser: rule.srcuser,
    srcip: rule.srcip,
    action: 'revoke-session',
    reason: rule.reasons.join(' | '),
    evidenceAlertIds: rule.evidenceAlertIds,
    createdAt: isoOf(rule.created),
    expiresAt: isoOf(rule.expires),
  }));
  return { rules, skippedReasons };
}

// 계정과 주소가 둘 다 같은 규칙이 있고 at이 expiresAt 전이면 true. 칸이 이상하면 예외 없이 false.
export function isDenied(srcuser, srcip, at, rules) {
  try {
    if (!isAccount(srcuser) || !isIPv4(srcip)) return false;
    const list = Array.isArray(rules) ? rules : Array.isArray(rules?.rules) ? rules.rules : [];
    const when = utcMillis(at);
    if (!Number.isFinite(when)) return false;
    return list.some(rule => isObject(rule) && rule.target === 'srcuser+srcip' && rule.srcuser === srcuser && rule.srcip === srcip
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
    throw new Error('privilege 경보 묶음 형식이 아닙니다.');
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
    const at = utcMillis(alert.timestamp);
    newLines.push(JSON.stringify({
      moduleKey: MODULE_KEY,
      at: Number.isFinite(at) ? isoOf(at) : null,
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
  return { rules, written: newLines.length, skipped, skippedReasons };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rules, written, skipped, skippedReasons } = await respond();
    const why = Object.entries(skippedReasons).map(([key, count]) => `${key} ${count}`).join(', ');
    process.stdout.write(`회수 규칙 ${rules.length}개 / 이번에 쓴 알림 ${written}줄 / 건너뛴 경보 ${skipped}건${why ? ` (규칙을 만들지 못한 block: ${why})` : ''}\n`);
  } catch (error) {
    process.stderr.write(`대응 연결 중 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
