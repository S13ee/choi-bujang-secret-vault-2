// 보너스 xdr-01 제작 3: brute-force 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·LEVEL_BANDS는 xdr/brute-force/patterns.json을 그대로 옮겨 적은 상수입니다(경보 id는 쓰지 않음).
// 아주 명확한 경우에만 막습니다: block(0.85 이상)은 strong 패턴과 공격 쪽 수준(10 이상)이 함께일 때만 나옵니다.

export const PATTERNS = Object.freeze([
  {
    name: 'rapid-failures-same-source',
    technique: 'T1110.001',
    conditions: {
      text: 'rule.mitre에 T1110이 있고, 실패 건수(data.count를 숫자로)가 20 이상이다.',
      match: { all: [
        { field: 'rule.mitre', includes: 'T1110' },
        { field: 'data.count', number: { gte: 20 } },
      ] },
    },
    strength: 'strong',
    evidence: 'MITRE ATT&CK T1110.001(Password Guessing): 같은 주소에서 짧은 시간에 로그인 실패가 많이 쌓임.',
  },
  {
    name: 'password-spraying',
    technique: 'T1110.003',
    conditions: {
      text: 'rule.mitre에 T1110이 있고, data.accounts의 계정 수가 5 이상이거나, 설명에 "같은 비밀번호"가 있고 계정이 여러 개라는 표현("여러 계정", "계정 N개")이 있다.',
      match: { all: [
        { field: 'rule.mitre', includes: 'T1110' },
        { any: [
          { field: 'data.accounts', splitCount: { gte: 5 } },
          { all: [
            { field: 'rule.description', contains: '같은 비밀번호' },
            { field: 'rule.description', regex: '여러 계정|계정 \\d+개' },
          ] },
        ] },
      ] },
    },
    strength: 'strong',
    evidence: 'MITRE ATT&CK T1110.003(Password Spraying): 여러 계정에 같은 비밀번호를 대입함.',
  },
  {
    name: 'low-volume-failures',
    technique: 'T1110.001',
    conditions: {
      text: 'rule.mitre에 T1110이 있고, 실패 건수가 2 이상 20 미만이며, rapid-failures-same-source와 password-spraying에 맞지 않는다.',
      match: { all: [
        { field: 'rule.mitre', includes: 'T1110' },
        { field: 'data.count', number: { gte: 2, lt: 20 } },
        { not: { pattern: 'rapid-failures-same-source' } },
        { not: { pattern: 'password-spraying' } },
      ] },
    },
    strength: 'weak',
    evidence: 'MITRE ATT&CK T1110.001을 적은 건수에서 본 경우로, 단정하지 않고 알림만.',
  },
]);

export const LEVEL_BANDS = Object.freeze({
  field: 'rule.level',
  bands: [
    { band: 'normal', max: 4 },
    { band: 'ambiguous', min: 5, max: 9 },
    { band: 'attack', min: 10 },
  ],
  evidence: 'Wazuh 규칙 수준 분류(낮은 수준은 성공·저우선 알림, 높은 수준은 반복 오류·중요 이벤트)',
});

// 확신도 표: [패턴 세기][수준 구간]. T1110이 있으나 맞는 패턴이 없으면 none, T1110이 없으면 NO_T1110.
const CONFIDENCE = Object.freeze({
  strong: { attack: 0.95, ambiguous: 0.70, normal: 0.55 },
  weak: { attack: 0.75, ambiguous: 0.60, normal: 0.50 },
  none: { attack: 0.60, ambiguous: 0.30, normal: 0.20 },
});
const NO_T1110 = 0.10;
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const TECHNIQUE = 'T1110';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (target, path) => path.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
const inRange = (value, range) => Number.isFinite(value)
  && (range.gte === undefined || value >= range.gte) && (range.lt === undefined || value < range.lt);
// data.count처럼 글자로 든 정수만 숫자로 바꿉니다. 숫자 칸이면 정수일 때만 씁니다. 그 밖에는 NaN입니다.
const toCount = value => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : NaN;
  return typeof value === 'string' && /^\s*\d{1,9}\s*$/u.test(value) ? Number(value.trim()) : NaN;
};
const byName = Object.fromEntries(PATTERNS.map(item => [item.name, item]));

function matches(alert, condition, depth = 0) {
  if (!isObject(condition) || depth > 10) return false;
  if (Array.isArray(condition.all)) return condition.all.every(item => matches(alert, item, depth + 1));
  if (Array.isArray(condition.any)) return condition.any.some(item => matches(alert, item, depth + 1));
  if ('not' in condition) return !matches(alert, condition.not, depth + 1);
  if ('pattern' in condition) {
    const target = byName[condition.pattern];
    return Boolean(target) && matches(alert, target.conditions.match, depth + 1);
  }
  const value = get(alert, condition.field);
  if ('includes' in condition) return Array.isArray(value) && value.includes(condition.includes);
  if ('number' in condition) return inRange(toCount(value), condition.number);
  if ('splitCount' in condition) {
    return typeof value === 'string' && inRange(value.split(',').filter(item => item.trim()).length, condition.splitCount);
  }
  if ('contains' in condition) return typeof value === 'string' && value.includes(condition.contains);
  if ('regex' in condition) return typeof value === 'string' && new RegExp(condition.regex, 'u').test(value);
  return false;
}

function levelBand(level) {
  if (!Number.isFinite(level)) return null;
  const found = LEVEL_BANDS.bands.find(item => (item.min === undefined || level >= item.min) && (item.max === undefined || level <= item.max));
  // 정수가 아닌 수준(예: 4.5)은 구간 사이에 떨어지므로 가장 가까운 아래 구간으로 봅니다.
  return found ? found.band : (level < 5 ? 'normal' : level < 10 ? 'ambiguous' : 'attack');
}

const actionOf = confidence => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const answer = (confidence, reason) => ({ action: actionOf(confidence), confidence, reason });

export function decide(alert) {
  try {
    if (!isObject(alert)) return answer(0, 'invalid-alert');
    const mitre = get(alert, 'rule.mitre');
    if (!Array.isArray(mitre) || !mitre.includes(TECHNIQUE)) return answer(NO_T1110, 'no-T1110');
    const level = get(alert, 'rule.level');
    const band = levelBand(level);
    const levelText = band ? `level ${level}(${band})` : 'level 없음(normal로 봄)';
    const hit = PATTERNS.find(item => item.strength === 'strong' && matches(alert, item.conditions.match))
      ?? PATTERNS.find(item => matches(alert, item.conditions.match));
    const table = CONFIDENCE[hit ? hit.strength : 'none'];
    return answer(table[band ?? 'normal'], `${hit ? hit.name : 'no-pattern'} · ${levelText}`);
  } catch {
    return answer(0, 'invalid-alert');
  }
}
