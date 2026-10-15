// 보너스 xdr-06 제작 3: exfiltration 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·EXFIL_MITRE·BYTES_FORMAT·NEGATIONS·BASELINE·LEVEL_BANDS는 xdr/exfiltration/patterns.json을 그대로 옮겨 적은 상수입니다(경보 번호는 쓰지 않음).
// 시각은 시각 글자를 직접 읽어 referenceZone(+09:00) 기준 시로 바꿉니다. 실행하는 컴퓨터의 시간대는 쓰지 않습니다.

export const PATTERNS = Object.freeze([
  {
    "name": "large-transfer-to-new-destination",
    "technique": "T1048",
    "conditions": {
      "text": "(가) 설명의 한 문장에 \"처음 보는\", \"처음 봅\", \"평소에 쓰지 않던\", \"평소와 다른\", \"외부 주소\", \"자료실 전체\" 중 하나가 있다. (나) data.bytes가 50,000,000바이트 이상이고 data.dstip가 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "처음 보는|처음 봅|평소에 쓰지 않던|평소와 다른|외부 주소|자료실 전체"
          },
          {
            "source": "structure",
            "all": [
              {
                "field": "data.bytes",
                "bytesAtLeast": 50000000
              },
              {
                "field": "data.dstip",
                "present": true
              }
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1048(Exfiltration Over Alternative Protocol) + T1041(Exfiltration Over C2 Channel): 처음 보거나 평소 쓰지 않던 목적지로 큰 자료를 내보내는 형태. 50MB 기준은 근거 문서 없이 정한 값(시험 경보의 공격 쪽 최소 70MB와 애매한 쪽 최대 15MB 사이)."
  },
  {
    "name": "off-hours-archive-exfil",
    "technique": "T1048",
    "conditions": {
      "text": "(가) 설명의 한 문장에 \"시간 밖\", \"업무 시간 외\", \"새벽\", \"심야\" 중 하나가 있거나, \"압축\"과 보냄을 뜻하는 표현(\"주소로\", \"주소에\", \"목적지\", \"전송\", \"보냄\")이 함께 있다. (나) timestamp를 +09:00 시각으로 바꾼 시가 0~5시이고 data.dstip가 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "any": [
              {
                "field": "rule.description",
                "regex": "시간 밖|업무 시간 외|새벽|심야"
              },
              {
                "all": [
                  {
                    "field": "rule.description",
                    "regex": "압축"
                  },
                  {
                    "field": "rule.description",
                    "regex": "주소로|주소에|목적지|전송|보냄"
                  }
                ]
              }
            ]
          },
          {
            "source": "structure",
            "all": [
              {
                "field": "timestamp",
                "referenceZone": "+09:00",
                "hourInReferenceZone": {
                  "gte": 0,
                  "lte": 5
                }
              },
              {
                "field": "data.dstip",
                "present": true
              }
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1048(Exfiltration Over Alternative Protocol) + T1560(Archive Collected Data): 업무 시간 밖에 자료를 압축해 밖으로 보내는 형태. T1560은 카드 번호에는 없지만 반출 전 압축 단계가 이 번호에 해당해 적음. 0~5시는 판정기 7단계의 새벽 시간 기준과 같고, 시각은 +09:00으로 바꿔 봄(시험 경보가 모두 +09:00이라 정한 값, 근거 문서로 확인되지는 않음)."
  }
]);

export const EXFIL_MITRE = Object.freeze([
  "T1041",
  "T1048",
  "T1567",
  "T1052",
  "T1020"
]);

export const BYTES_FORMAT = Object.freeze({
  "text": "data.bytes는 숫자, 숫자만 있는 글자, 또는 숫자 + 단위(B, KB, MB, GB, TB, 대소문자 무시, 숫자와 단위 사이 공백 허용, 1KB=1000B)인 글자만 읽습니다. 소수는 단위가 있을 때만 쓸모가 있습니다(예: 1.2GB). 음수·그 밖의 글자·빈 값은 0으로 봅니다.",
  "regex": "^\\s{0,8}(\\d{1,15}(?:\\.\\d{1,6})?)\\s{0,8}(b|kb|mb|gb|tb)?\\s{0,8}$",
  "ignoreCase": true,
  "units": {
    "b": 1,
    "kb": 1000,
    "mb": 1000000,
    "gb": 1000000000,
    "tb": 1000000000000
  }
});

export const NEGATIONS = Object.freeze({
  "text": "description 갈래는 신호 표현이 있는 문장에 아래 표현이 있으면 그 문장을 세지 않습니다(예: \"외부 전송은 아직 없습니다\", \"전송이 실패\", \"큰 파일은 아닙니다\"). 부정 표현은 그 문장에서 모든 패턴의 설명 갈래 신호 표현을 지운 나머지 글자에서 찾습니다(신호 표현 \"평소에 쓰지 않던\"의 \"않\"처럼 신호 표현 안에 든 글자는 부정으로 보지 않음). structure 갈래(data.bytes, data.dstip, 시각)는 부정 표현과 상관없습니다.",
  "field": "rule.description",
  "scope": "sentence",
  "maskSignalPhrases": true,
  "regex": "아닙니다|아님|없습니다|없음|실패|취소|않",
  "evidence": "설명이 스스로 전송이 없거나 실패·취소됐거나 큰 파일이 아니라고 밝힌 문장은 유출 신호로 보지 않음."
});

export const BASELINE = Object.freeze({
  "available": false,
  "text": "저장소에는 평소 목적지 목록·평소 전송 크기·업무 시간 기준이 없습니다. 그래서 설명의 \"처음 보는\", \"평소와 다른\", \"시간 밖\" 표현과, 근거 문서 없이 정한 50MB 기준을 신호로 씁니다. 목적지 IP 허용 목록은 만들지 않습니다.",
  "evidence": "평소 목적지·크기·업무 시간 근거 문서가 저장소(xdr/, docs/, aleph.config.json, 경보 묶음)에 없음을 확인함."
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
  "evidence": "Wazuh 규칙 수준 분류(낮은 수준은 성공·저우선 알림, 높은 수준은 반복 오류·중요 이벤트). 시험 경보 정상 쪽에도 T1048이 붙어 있어 정상 판단은 수준으로 함."
});

// 확신도 표. 위에서부터 처음 맞는 줄 하나만 씁니다(decide 안의 순서).
const CONFIDENCE = Object.freeze({
  normalWithHint: 0.20,
  normalPlain: 0.10,
  exfilSignalAttack: 0.95,
  exfilSignalAmbiguous: 0.65,
  exfilNoSignalAttack: 0.70,
  exfilNoSignalAmbiguous: 0.55,
  noExfilSignal: 0.50,
  noExfilNoSignal: 0.30,
  invalid: 0.00,
});
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const TEXT_LIMIT = 4096;
const MINUTES_PER_DAY = 1440;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (target, path) => path.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
const compiled = new Map();
const regexOf = (source, flags = 'u') => {
  const key = `${flags}/${source}`;
  if (!compiled.has(key)) compiled.set(key, new RegExp(source, flags));
  return compiled.get(key);
};

// rule.mitre 배열에 그 번호이거나 그 번호의 하위 번호(예: T1078.003)가 있으면 참. 배열이 아니면 거짓.
const hasMitre = (list, code) => Array.isArray(list)
  && list.some(value => typeof value === 'string' && (value === code || value.startsWith(`${code}.`)));

// data.bytes는 BYTES_FORMAT대로 숫자, 숫자 글자, 숫자 + 단위(B~TB, 1KB=1000B) 글자만 읽습니다. 그 밖·음수·빈 값은 0입니다.
function bytesOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
  if (typeof value !== 'string' || value.length > TEXT_LIMIT) return 0;
  const match = regexOf(BYTES_FORMAT.regex, BYTES_FORMAT.ignoreCase ? 'iu' : 'u').exec(value);
  if (!match) return 0;
  const unit = BYTES_FORMAT.units[(match[2] ?? 'b').toLowerCase()];
  const bytes = Number(match[1]) * (typeof unit === 'number' ? unit : 0);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
}

// 숫자 칸은 그대로, 글자 칸은 앞뒤 공백을 뺀 뒤 정수나 소수로 온전히 읽힐 때만 숫자로 바꿉니다. 그 밖은 NaN입니다.
const NUMBER_TEXT = /^[+-]?\d{1,9}(?:\.\d{1,9})?$/u;
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || value.length > 64) return NaN;
  const trimmed = value.trim();
  return NUMBER_TEXT.test(trimmed) ? Number(trimmed) : NaN;
}

// "+09:00", "-05:30", "Z"를 분 단위 오프셋으로 바꿉니다. 형식이 아니면 NaN입니다.
function zoneMinutes(text) {
  if (text === 'Z') return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/u.exec(typeof text === 'string' ? text : '');
  if (!match || Number(match[2]) > 14 || Number(match[3]) > 59) return NaN;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

// 시각 글자를 직접 읽어, 그 순간을 기준 오프셋 시각으로 바꾼 시(0~23)를 돌려줍니다. 오프셋이 없거나 깨졌으면 NaN입니다.
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/u;
function hourAt(timestamp, referenceZone) {
  if (typeof timestamp !== 'string' || timestamp.length > 64) return NaN;
  const match = TIMESTAMP.exec(timestamp);
  const reference = zoneMinutes(referenceZone);
  if (!match || !Number.isFinite(reference)) return NaN;
  const [, , month, day, hour, minute, second = '0', zoneText] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return NaN;
  const written = zoneMinutes(zoneText);
  if (!Number.isFinite(written)) return NaN;
  const minutes = Number(hour) * 60 + Number(minute) - written + reference;
  return Math.floor((((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60);
}

// 설명 갈래에 쓰인 신호 표현 정규식을 모두 모읍니다(부정 표현을 찾기 전에 지우기 위함).
function descriptionRegexes(condition, out = []) {
  if (!isObject(condition)) return out;
  for (const key of ['any', 'all']) if (Array.isArray(condition[key])) condition[key].forEach(item => descriptionRegexes(item, out));
  if (typeof condition.regex === 'string' && condition.field === 'rule.description') out.push(condition.regex);
  return out;
}
const SIGNAL_PHRASES = PATTERNS.flatMap(item => (item.conditions?.match?.any ?? [])
  .filter(branch => branch.source === 'description').flatMap(branch => descriptionRegexes(branch)));

const sentencesOf = text => (typeof text === 'string' ? text.slice(0, TEXT_LIMIT).split(/[.!?]/u).filter(part => part.trim()) : []);
// 한 문장 안에서 설명 갈래 조건이 모두 맞는지 봅니다.
function inSentence(sentence, condition, depth = 0) {
  if (!isObject(condition) || depth > 10) return false;
  if (Array.isArray(condition.any)) return condition.any.some(item => inSentence(sentence, item, depth + 1));
  if (Array.isArray(condition.all)) return condition.all.every(item => inSentence(sentence, item, depth + 1));
  return typeof condition.regex === 'string' && regexOf(condition.regex).test(sentence);
}
// 신호 표현을 지운 나머지 글자에 부정 표현이 있으면 그 문장은 세지 않습니다.
function negated(sentence) {
  let rest = sentence;
  if (NEGATIONS.maskSignalPhrases) for (const source of SIGNAL_PHRASES) rest = rest.replace(regexOf(source, 'gu'), ' ');
  return regexOf(NEGATIONS.regex).test(rest);
}

function structureMatches(alert, condition, depth = 0) {
  if (!isObject(condition) || depth > 10) return false;
  if (Array.isArray(condition.any)) return condition.any.some(item => structureMatches(alert, item, depth + 1));
  if (Array.isArray(condition.all)) return condition.all.every(item => structureMatches(alert, item, depth + 1));
  const value = get(alert, condition.field);
  if (typeof condition.bytesAtLeast === 'number') return bytesOf(value) >= condition.bytesAtLeast;
  if (condition.present === true) return typeof value === 'string' && value.length <= 256 && value.trim() !== '';
  if (Array.isArray(condition.equalsAnyIgnoreCase)) {
    return typeof value === 'string' && value.length <= 256
      && condition.equalsAnyIgnoreCase.some(name => name.toLowerCase() === value.trim().toLowerCase());
  }
  if (isObject(condition.hourInReferenceZone)) {
    const hour = hourAt(value, condition.referenceZone);
    return Number.isInteger(hour) && hour >= condition.hourInReferenceZone.gte && hour <= condition.hourInReferenceZone.lte;
  }
  return false;
}

function patternMatches(alert, item, sentences) {
  const branches = Array.isArray(item.conditions?.match?.any) ? item.conditions.match.any : [];
  return branches.some(branch => (branch.source === 'description'
    ? sentences.some(sentence => inSentence(sentence, branch) && !negated(sentence))
    : structureMatches(alert, branch)));
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
    const exfil = EXFIL_MITRE.some(code => hasMitre(get(alert, 'rule.mitre'), code));
    const sentences = sentencesOf(get(alert, 'rule.description'));
    const names = PATTERNS.filter(item => patternMatches(alert, item, sentences)).map(item => item.name);
    const parts = [names.length ? names.join('+') : 'no-signal'];
    if (!exfil) parts.push('no-exfil-mitre');
    parts.push(Number.isFinite(level) ? `level ${level}(${band})` : 'level 없음(normal로 봄)');
    const reason = parts.join(' · ');
    let confidence;
    if (band === 'normal') confidence = names.length || exfil ? CONFIDENCE.normalWithHint : CONFIDENCE.normalPlain;
    else if (exfil && names.length) confidence = band === 'attack' ? CONFIDENCE.exfilSignalAttack : CONFIDENCE.exfilSignalAmbiguous;
    else if (exfil) confidence = band === 'attack' ? CONFIDENCE.exfilNoSignalAttack : CONFIDENCE.exfilNoSignalAmbiguous;
    else confidence = names.length ? CONFIDENCE.noExfilSignal : CONFIDENCE.noExfilNoSignal;
    return answer(confidence, reason);
  } catch {
    return answer(CONFIDENCE.invalid, 'invalid-alert');
  }
}
