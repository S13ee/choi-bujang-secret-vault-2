// 보너스 xdr-03 제작 3: known-cve 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·KNOWN_CVE_MITRE·NEGATIONS·BASELINE·LEVEL_BANDS는 xdr/known-cve/patterns.json을 그대로 옮겨 적은 상수입니다(경보 번호는 쓰지 않음).
// xdr/README.md 주의에 따라 공격 문자열의 모양을 적지 않고, 요청 주소·머리글 글자를 검사하지 않습니다. 판단은 설명 문장·수준·mitre로만 합니다.

export const PATTERNS = Object.freeze([
  {
    "name": "log4shell-lookup-request",
    "technique": "T1190",
    "conditions": {
      "text": "설명의 한 문장에 (원격) 조회 구문·jndi 형태가 들어왔음을 뜻하는 표현(\"원격 조회 구문\", \"조회 구문이 담\", \"jndi 형태\", \"조회 구문으로\", \"구문이 들어\", \"CVE-2021-44228 형태\", \"CVE-2021-44228 표기\", \"조회 구문이\") 중 하나가 있다. CVE 이름만 적힌 문장(\"CVE-2021-44228 이라는 글자만\")은 \"형태\"·\"표기\"가 아니라 맞지 않는다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "원격 조회 구문|조회 구문이 담|jndi 형태|조회 구문으로|구문이 들어|CVE-2021-44228 형태|CVE-2021-44228 표기|조회 구문이"
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "CVE-2021-44228(Log4Shell) + MITRE ATT&CK T1190(Exploit Public-Facing Application): 요청 머리글·인자에 원격 조회 구문을 넣어 로그 라이브러리가 바깥 주소를 조회하게 하는 형태."
  },
  {
    "name": "vuln-scan-trace",
    "technique": "T1190",
    "conditions": {
      "text": "설명의 한 문장에 \"점검 흔적\", \"점검 도구\"처럼 알려진 취약점 점검 도구의 흔적을 뜻하는 표현이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "점검 흔적|점검 도구"
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1190(Exploit Public-Facing Application): 공개된 취약점을 찾는 점검 도구의 흔적은 악용 전 단계로 봄."
  }
]);

export const KNOWN_CVE_MITRE = Object.freeze([
  "T1190"
]);

export const NEGATIONS = Object.freeze({
  "text": "신호 표현이 있는 문장에 아래 표현이 있으면 그 문장을 세지 않습니다(예: 이름만 있는 검색, 낱말만 있는 노트, 중괄호가 한 번 있는 머리글, 잘린 조각). 부정 표현은 그 문장에서 모든 패턴의 신호 표현을 지운 나머지 글자에서 찾습니다.",
  "field": "rule.description",
  "scope": "sentence",
  "maskSignalPhrases": true,
  "regex": "아닙니다|아님|없습니다|없음|낱말만|이름만|완전한 구문은 아|중괄호가 한 번|조각",
  "evidence": "설명이 스스로 조회 구문이 없거나, 이름·낱말만 있거나, 완전한 구문이 아니라고 밝힌 문장은 악용 신호로 보지 않음."
});

export const BASELINE = Object.freeze({
  "available": false,
  "text": "저장소에는 공개 취약점(CVE) 목록이나 공격 기법 목록 파일이 없습니다. 그래서 경보 설명 문장으로 판단합니다. xdr/README.md의 주의(원격 조회 구문은 문서용 표기이며 다른 시스템에 넣거나 변형하지 않음)에 따라 공격 문자열의 모양은 패턴에 담지 않습니다.",
  "evidence": "CVE·공격 기법 목록 파일이 저장소(xdr/, docs/, 경보 묶음 밖)에 없음을 확인함."
});

export const LEVEL_BANDS = Object.freeze({
  "field": "rule.level",
  "bands": [
    {
      "band": "normal",
      "max": 4
    },
    {
      "band": "ambiguous",
      "min": 5,
      "max": 9
    },
    {
      "band": "attack",
      "min": 10
    }
  ],
  "evidence": "Wazuh 규칙 수준 분류(낮은 수준은 성공·저우선 알림, 높은 수준은 반복 오류·중요 이벤트). 정상 판단은 수준으로 함."
});

// 확신도 표. 위에서부터 처음 맞는 줄 하나만 씁니다(decide 안의 순서).
const CONFIDENCE = Object.freeze({
  normalWithHint: 0.20,
  normalPlain: 0.10,
  cveSignalAttack: 0.95,
  cveSignalAmbiguous: 0.65,
  cveNoSignalAttack: 0.70,
  cveNoSignalAmbiguous: 0.55,
  noCveSignal: 0.50,
  noCveNoSignal: 0.30,
  invalid: 0.00,
});
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const TEXT_LIMIT = 4096;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (target, path) => path.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
const compiled = new Map();
const regexOf = (source, flags = 'u') => {
  const key = flags + '/' + source;
  if (!compiled.has(key)) compiled.set(key, new RegExp(source, flags));
  return compiled.get(key);
};

// rule.mitre 배열에 그 번호이거나 그 번호의 하위 번호(예: T1190.001)가 있으면 참. 배열이 아니면 거짓.
const hasMitre = (list, code) => Array.isArray(list)
  && list.some(value => typeof value === 'string' && (value === code || value.startsWith(code + '.')));

// 숫자 칸은 그대로, 글자 칸은 앞뒤 공백을 뺀 뒤 정수나 소수로 온전히 읽힐 때만 숫자로 바꿉니다. 그 밖은 NaN입니다.
const NUMBER_TEXT = /^[+-]?\d{1,9}(?:\.\d{1,9})?$/u;
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || value.length > 64) return NaN;
  const trimmed = value.trim();
  return NUMBER_TEXT.test(trimmed) ? Number(trimmed) : NaN;
}

// 설명 갈래에 쓰인 신호 표현 정규식을 모두 모읍니다(부정 표현을 찾기 전에 지우기 위함).
const SIGNAL_PHRASES = PATTERNS.flatMap(item => (item.conditions && item.conditions.match && Array.isArray(item.conditions.match.any)
  ? item.conditions.match.any : [])
  .filter(branch => branch.source === 'description' && branch.field === 'rule.description' && typeof branch.regex === 'string')
  .map(branch => branch.regex));

// 판단에는 설명 문장(rule.description)만 씁니다. 앞쪽 4096자까지만 보고, '.' '!' '?'로 문장을 나눕니다.
const sentencesOf = text => (typeof text === 'string' ? text.slice(0, TEXT_LIMIT).split(/[.!?]/u).filter(part => part.trim()) : []);

// 신호 표현을 지운 나머지 글자에 부정 표현이 있으면 그 문장은 세지 않습니다.
function negated(sentence) {
  let rest = sentence;
  if (NEGATIONS.maskSignalPhrases) for (const source of SIGNAL_PHRASES) rest = rest.replace(regexOf(source, 'gu'), ' ');
  return regexOf(NEGATIONS.regex).test(rest);
}

function patternMatches(item, sentences) {
  const branches = item.conditions && item.conditions.match && Array.isArray(item.conditions.match.any) ? item.conditions.match.any : [];
  return branches.some(branch => branch.source === 'description' && branch.field === 'rule.description' && typeof branch.regex === 'string'
    && sentences.some(sentence => regexOf(branch.regex).test(sentence) && !negated(sentence)));
}

// 수준 칸이 없거나 숫자로 읽히지 않으면 4 이하(normal)로 봅니다. 정수가 아닌 수준은 가까운 아래 구간으로 봅니다.
function levelBand(level) {
  if (!Number.isFinite(level)) return 'normal';
  const found = LEVEL_BANDS.bands.find(item => (item.min === undefined || level >= item.min) && (item.max === undefined || level <= item.max));
  return found ? found.band : (level < 5 ? 'normal' : level < 10 ? 'ambiguous' : 'attack');
}

const actionOf = confidence => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const answer = (confidence, reason) => ({ action: actionOf(confidence), confidence, reason });

export function decide(alert) {
  try {
    if (!isObject(alert)) return answer(CONFIDENCE.invalid, 'invalid-alert');
    const level = toNumber(get(alert, 'rule.level'));
    const band = levelBand(level);
    const known = KNOWN_CVE_MITRE.some(code => hasMitre(get(alert, 'rule.mitre'), code));
    const sentences = sentencesOf(get(alert, 'rule.description'));
    const names = PATTERNS.filter(item => patternMatches(item, sentences)).map(item => item.name);
    const parts = [names.length ? names.join('+') : 'no-signal'];
    if (!known) parts.push('no-known-cve-mitre');
    parts.push(Number.isFinite(level) ? 'level ' + level + '(' + band + ')' : 'level 없음(normal로 봄)');
    const reason = parts.join(' · ');
    let confidence;
    if (band === 'normal') confidence = names.length || known ? CONFIDENCE.normalWithHint : CONFIDENCE.normalPlain;
    else if (known && names.length) confidence = band === 'attack' ? CONFIDENCE.cveSignalAttack : CONFIDENCE.cveSignalAmbiguous;
    else if (known) confidence = band === 'attack' ? CONFIDENCE.cveNoSignalAttack : CONFIDENCE.cveNoSignalAmbiguous;
    else confidence = names.length ? CONFIDENCE.noCveSignal : CONFIDENCE.noCveNoSignal;
    return answer(confidence, reason);
  } catch {
    return answer(CONFIDENCE.invalid, 'invalid-alert');
  }
}
