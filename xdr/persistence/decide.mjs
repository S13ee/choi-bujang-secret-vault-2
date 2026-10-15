// 보너스 xdr-04 제작 3: persistence 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·PERSISTENCE_MITRE·BASELINE·LEVEL_BANDS는 xdr/persistence/patterns.json을 그대로 옮겨 적은 상수입니다(경보 번호는 쓰지 않음).
// 시험 경보는 정상 쪽에도 T1053·T1543이 붙어 있어, 수준 4 이하는 신호가 있어도 record로 둡니다.
// 서명·"기존"·"평소" 같은 말로 신호를 빼거나 봐주지 않습니다.

export const PATTERNS = Object.freeze([
  {
    "name": "unsigned-new-service",
    "technique": "T1543.003",
    "conditions": {
      "text": "(가) 설명에 \"서명 없\"(서명이 없 포함)과 \"서비스\"가 함께 있거나, \"서비스\"와 \"평소 목록에 없\" 또는 \"다시 켜도 남\"이 함께 있다. (나) data.path가 사용자 임시 폴더(\\appdata\\local\\temp\\, 대소문자 무시)이고 rule.mitre에 T1543이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "any": [
              {
                "all": [
                  {
                    "field": "rule.description",
                    "regex": "서명이? ?없"
                  },
                  {
                    "field": "rule.description",
                    "regex": "서비스"
                  }
                ]
              },
              {
                "all": [
                  {
                    "field": "rule.description",
                    "regex": "서비스"
                  },
                  {
                    "field": "rule.description",
                    "regex": "평소 목록에 없|다시 켜도 남"
                  }
                ]
              }
            ]
          },
          {
            "source": "path",
            "all": [
              {
                "field": "data.path",
                "regex": "\\\\appdata\\\\local\\\\temp\\\\",
                "ignoreCase": true
              },
              {
                "field": "rule.mitre",
                "mitrePrefix": "T1543"
              }
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1543.003(Windows Service): 서명 없거나 평소 목록에 없는 서비스를 새로 등록·변경해 다시 켜도 남게 함."
  },
  {
    "name": "unfamiliar-scheduled-task",
    "technique": "T1053.005",
    "conditions": {
      "text": "(가) 설명에 \"처음 보는 예약 작업\", \"평소 목록에 없는 예약 작업\", \"작업 이름이 임의\", \"수업 시간 밖\" 같은 표현이 있다. (나) data.path가 사용자 임시 폴더이고 rule.mitre에 T1053이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "처음 보는 예약 작업|평소 목록에 없는 예약 작업|작업 이름이 임의|수업 시간 밖"
          },
          {
            "source": "path",
            "all": [
              {
                "field": "data.path",
                "regex": "\\\\appdata\\\\local\\\\temp\\\\",
                "ignoreCase": true
              },
              {
                "field": "rule.mitre",
                "mitrePrefix": "T1053"
              }
            ]
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1053.005(Scheduled Task): 처음 보거나 이름이 임의인 예약 작업이 임시 폴더 프로그램을 정해진 때 실행하게 함."
  },
  {
    "name": "startup-folder-change",
    "technique": "T1547.001",
    "conditions": {
      "text": "(가) 설명에 \"시작 폴더\"나 \"시작 프로그램\"이 있고 추가·변경·가리킴처럼 바뀐 것을 뜻하는 표현이 있으며, \"읽기만\"이 없다(시작 목록을 읽은 것은 변경이 아님). (나) data.path에 \\startup\\이 있다(대소문자 무시).",
      "match": {
        "any": [
          {
            "source": "description",
            "all": [
              {
                "field": "rule.description",
                "regex": "시작 폴더|시작 프로그램"
              },
              {
                "field": "rule.description",
                "regex": "추가|변경|바뀌|바뀐|가리키|가리킵|가리킴|생겼|등록"
              },
              {
                "not": {
                  "field": "rule.description",
                  "regex": "읽기만"
                }
              }
            ]
          },
          {
            "source": "path",
            "field": "data.path",
            "regex": "\\\\startup\\\\",
            "ignoreCase": true
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1547.001(Registry Run Keys / Startup Folder): 시작 폴더·시작 프로그램에 항목을 더하거나 바꿔 로그인할 때마다 실행되게 함. 카드의 신호 '시작 폴더 변경'에 해당하지만 카드가 적은 두 번호(T1543, T1053)에는 없어 이 번호를 근거로 적음."
  }
]);

export const PERSISTENCE_MITRE = Object.freeze([
  "T1543",
  "T1053",
  "T1547"
]);

export const BASELINE = Object.freeze({
  "available": false,
  "text": "저장소에는 평소 목록(허용 서비스·허용 예약 작업·알려진 서명자)이 없습니다. 그래서 설명의 \"평소 목록에 없는\", \"처음 보는\", \"임의\" 표현을 목록에 없음 신호로 씁니다. 경보 경로로 허용 목록을 만들지 않고, 서명이 있다는 말이나 \"기존\", \"평소\" 같은 말로 신호를 빼거나 봐주지 않습니다(정상 서명을 단 백도어가 있을 수 있음).",
  "evidence": "평소 목록 근거 문서가 저장소(xdr/, docs/, 경보 묶음)에 없음을 확인함."
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
  "evidence": "Wazuh 규칙 수준 분류(낮은 수준은 성공·저우선 알림, 높은 수준은 반복 오류·중요 이벤트). 시험 경보는 정상 쪽에도 T1053·T1543이 붙어 있어 mitre만으로 정상을 가를 수 없음, 정상 판단은 수준으로 함."
});

// 확신도 표. 위에서부터 처음 맞는 줄 하나만 씁니다(decide 안의 순서).
const CONFIDENCE = Object.freeze({
  normalWithHint: 0.20,
  normalPlain: 0.10,
  persistSignalAttack: 0.95,
  persistSignalAmbiguous: 0.65,
  persistNoSignalAttack: 0.70,
  persistNoSignalAmbiguous: 0.55,
  noPersistSignal: 0.50,
  noPersistNoSignal: 0.30,
  invalid: 0.00,
});
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const TEXT_LIMIT = 4096;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (target, path) => path.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
const compiled = new Map();
const regexOf = (source, ignoreCase) => {
  const key = `${ignoreCase ? 'i' : '-'}${source}`;
  if (!compiled.has(key)) compiled.set(key, new RegExp(source, ignoreCase ? 'iu' : 'u'));
  return compiled.get(key);
};

// rule.mitre 배열에 그 번호이거나 그 번호의 하위 번호(예: T1543.003)가 있으면 참. 배열이 아니면 거짓.
const hasMitre = (list, code) => Array.isArray(list)
  && list.some(value => typeof value === 'string' && (value === code || value.startsWith(`${code}.`)));

function matches(alert, condition, depth = 0) {
  if (!isObject(condition) || depth > 10) return false;
  if (Array.isArray(condition.any)) return condition.any.some(item => matches(alert, item, depth + 1));
  if (Array.isArray(condition.all)) return condition.all.every(item => matches(alert, item, depth + 1));
  if ('not' in condition) return !matches(alert, condition.not, depth + 1);
  const value = get(alert, condition.field);
  if ('mitrePrefix' in condition) return hasMitre(value, condition.mitrePrefix);
  if (typeof value !== 'string' || typeof condition.regex !== 'string') return false;
  return regexOf(condition.regex, condition.ignoreCase === true).test(value.slice(0, TEXT_LIMIT));
}

// 수준 칸이 없거나 숫자가 아니면 4 이하(normal)로 봅니다. 정수가 아닌 수준은 가까운 아래 구간으로 봅니다.
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
    const level = get(alert, 'rule.level');
    const band = levelBand(level);
    const mitre = get(alert, 'rule.mitre');
    const persistent = PERSISTENCE_MITRE.some(code => hasMitre(mitre, code));
    const names = PATTERNS.filter(item => matches(alert, item.conditions?.match)).map(item => item.name);
    const parts = [names.length ? names.join('+') : 'no-signal'];
    if (!persistent) parts.push('no-persistence-mitre');
    parts.push(Number.isFinite(level) ? `level ${level}(${band})` : 'level 없음(normal로 봄)');
    const reason = parts.join(' · ');
    let confidence;
    if (band === 'normal') confidence = names.length || persistent ? CONFIDENCE.normalWithHint : CONFIDENCE.normalPlain;
    else if (persistent && names.length) confidence = band === 'attack' ? CONFIDENCE.persistSignalAttack : CONFIDENCE.persistSignalAmbiguous;
    else if (persistent) confidence = band === 'attack' ? CONFIDENCE.persistNoSignalAttack : CONFIDENCE.persistNoSignalAmbiguous;
    else confidence = names.length ? CONFIDENCE.noPersistSignal : CONFIDENCE.noPersistNoSignal;
    return answer(confidence, reason);
  } catch {
    return answer(CONFIDENCE.invalid, 'invalid-alert');
  }
}
