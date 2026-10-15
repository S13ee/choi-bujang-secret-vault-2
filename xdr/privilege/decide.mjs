// 보너스 xdr-05 제작 3: privilege 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·PRIVILEGE_MITRE·NEGATIONS·BASELINE·LEVEL_BANDS는 xdr/privilege/patterns.json을 그대로 옮겨 적은 상수입니다(경보 번호는 쓰지 않음).
// 시각은 시각 글자를 직접 읽어 referenceZone(+09:00) 기준 시로 바꿉니다. 실행하는 컴퓨터의 시간대는 쓰지 않습니다.

export const PATTERNS = Object.freeze([
  {
    "name": "admin-group-add",
    "technique": "T1098",
    "conditions": {
      "text": "(가) 설명의 한 문장에 \"관리자 그룹\"과 추가를 뜻하는 표현(\"추가\", \"들어가\", \"들어오\", \"들어옴\")이 함께 있거나, \"다시 관리자로 들어\"가 있다. (나) data.group이 관리자 그룹 이름(administrators, admins, domain admins, wheel, sudo)과 대소문자 무시로 정확히 같다.",
      "match": {
        "any": [
          {
            "source": "description",
            "any": [
              {
                "all": [
                  {
                    "field": "rule.description",
                    "regex": "관리자 그룹"
                  },
                  {
                    "field": "rule.description",
                    "regex": "추가|들어가|들어오|들어옴|들어왔"
                  }
                ]
              },
              {
                "field": "rule.description",
                "regex": "다시 관리자로 들어"
              }
            ]
          },
          {
            "source": "structure",
            "field": "data.group",
            "equalsAnyIgnoreCase": [
              "administrators",
              "admins",
              "domain admins",
              "wheel",
              "sudo"
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1098(Account Manipulation): 계정을 관리자 그룹에 넣는 것은 T1098에 해당하고, 그렇게 추가된 계정을 쓰는 것은 T1078(Valid Accounts). 카드의 두 번호에는 없지만 그룹 추가 신호의 근거라 적음(하위 번호는 확인하지 못해 쓰지 않음)."
  },
  {
    "name": "first-seen-admin-command",
    "technique": "T1068",
    "conditions": {
      "text": "(가) 설명의 한 문장에 \"관리자 명령\", \"권한 명령\", \"관리자 권한\" 중 하나와, 처음·갑작스러움을 뜻하는 표현(\"처음 보는\", \"처음 봄\", \"방금 관리자가 된\", \"곧바로\", \"다른 계정의 권한으로\", \"관리자 권한으로 바뀌\") 중 하나가 함께 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "all": [
              {
                "field": "rule.description",
                "regex": "관리자 명령|권한 명령|관리자 권한"
              },
              {
                "field": "rule.description",
                "regex": "처음 보는|처음 봄|방금 관리자가 된|곧바로|다른 계정의 권한으로|관리자 권한으로 바뀌"
              }
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1068(Exploitation for Privilege Escalation) + T1078(Valid Accounts): 평소 관리자가 아닌 계정이 처음 보는 곳에서, 또는 권한을 얻자마자 관리자 명령을 쓰는 형태."
  },
  {
    "name": "off-hours-privilege-use",
    "technique": "T1078",
    "conditions": {
      "text": "(가) 설명의 한 문장에 \"시간 밖\", \"업무처럼 보이지 않는 시각\", \"업무 시간 외\", \"새벽\", \"심야\" 중 하나가 있다(\"수업 시간에\", \"수업 중\"처럼 \"밖\"이 없는 표현은 신호가 아님). (나) timestamp를 +09:00 시각으로 바꾼 시가 0~5시다(예: 2026-09-26T17:30:00Z는 +09:00으로 02:30이라 신호).",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "시간 밖|업무처럼 보이지 않는 시각|업무 시간 외|새벽|심야"
          },
          {
            "source": "structure",
            "field": "timestamp",
            "referenceZone": "+09:00",
            "hourInReferenceZone": {
              "gte": 0,
              "lte": 5
            }
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1078(Valid Accounts): 정상 계정이 평소 쓰지 않는 시각에 권한을 쓰는 형태. 0~5시는 이 저장소 판정기 7단계의 새벽 시간 기준(LATE_NIGHT_HOURS)과 같음. 시각은 +09:00으로 바꿔 봄(시험 경보가 모두 +09:00이고 이 반이 한국 기준이라 정한 값, 근거 문서로 확인되지는 않음)."
  }
]);

export const PRIVILEGE_MITRE = Object.freeze([
  "T1068",
  "T1078",
  "T1098",
  "T1548"
]);

export const NEGATIONS = Object.freeze({
  "text": "description 갈래는 신호 표현이 있는 문장에 아래 표현이 있으면 그 문장을 세지 않습니다(예: \"관리자 그룹은 아닙니다\", \"이어서 명령은 없습니다\", \"명령이 실패\", \"창이 뜨고 취소\", \"관리자 그룹에 추가되지 않았습니다\"). 부정 표현은 그 문장에서 모든 패턴의 설명 갈래 신호 표현을 지운 나머지 글자에서 찾습니다(신호 표현 \"업무처럼 보이지 않는 시각\"의 \"않\"처럼 신호 표현 안에 든 글자는 부정으로 보지 않음). structure 갈래(data.group, 시각)는 부정 표현과 상관없습니다.",
  "field": "rule.description",
  "scope": "sentence",
  "maskSignalPhrases": true,
  "regex": "아닙니다|아님|없습니다|없음|실패|취소|읽기만|조회|않",
  "evidence": "설명이 스스로 관리자 그룹이 아니거나, 명령이 없거나 실패·취소됐거나, 읽기·조회만 했다고 밝힌 문장은 권한 상승 신호로 보지 않음."
});

export const BASELINE = Object.freeze({
  "available": false,
  "text": "저장소에는 업무 시간·수업 시간 기준이나 평소 관리자 목록이 없습니다. 그래서 설명의 시간 밖·처음 보는 표현과, 판정기 7단계와 같은 새벽 0~5시를 신호로 씁니다. 경보에서 관리자 계정 목록을 만들지 않습니다.",
  "evidence": "업무 시간·관리자 목록 근거 문서가 저장소(xdr/, docs/, aleph.config.json, 경보 묶음)에 없음을 확인함."
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
  privSignalAttack: 0.95,
  privSignalAmbiguous: 0.65,
  privNoSignalAttack: 0.70,
  privNoSignalAmbiguous: 0.55,
  noPrivSignal: 0.50,
  noPrivNoSignal: 0.30,
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

function structureMatches(alert, condition) {
  const value = get(alert, condition.field);
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
    const privileged = PRIVILEGE_MITRE.some(code => hasMitre(get(alert, 'rule.mitre'), code));
    const sentences = sentencesOf(get(alert, 'rule.description'));
    const names = PATTERNS.filter(item => patternMatches(alert, item, sentences)).map(item => item.name);
    const parts = [names.length ? names.join('+') : 'no-signal'];
    if (!privileged) parts.push('no-privilege-mitre');
    parts.push(Number.isFinite(level) ? `level ${level}(${band})` : 'level 없음(normal로 봄)');
    const reason = parts.join(' · ');
    let confidence;
    if (band === 'normal') confidence = names.length || privileged ? CONFIDENCE.normalWithHint : CONFIDENCE.normalPlain;
    else if (privileged && names.length) confidence = band === 'attack' ? CONFIDENCE.privSignalAttack : CONFIDENCE.privSignalAmbiguous;
    else if (privileged) confidence = band === 'attack' ? CONFIDENCE.privNoSignalAttack : CONFIDENCE.privNoSignalAmbiguous;
    else confidence = names.length ? CONFIDENCE.noPrivSignal : CONFIDENCE.noPrivNoSignal;
    return answer(confidence, reason);
  } catch {
    return answer(CONFIDENCE.invalid, 'invalid-alert');
  }
}
