// 보너스 xdr-02 제작 3: web-injection 경보 판단 모듈입니다.
// 이 파일 하나만으로 계산합니다. 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS·LURE_GUARDS·REPEAT·LEVEL_BANDS는 xdr/web-injection/patterns.json을 그대로 옮겨 적은 상수입니다(경보 번호는 쓰지 않음).
// 같은 주소에서 반복되는 명확한 주입 시도만 막습니다: block(0.85 이상)은 T1190·신호·반복·수준 10 이상이 모두 있을 때만 나옵니다.

export const PATTERNS = Object.freeze([
  {
    "name": "sql-injection",
    "technique": "T1190",
    "conditions": {
      "text": "설명에 \"SQL 구문\"이나 \"데이터베이스 조회\"가 있거나, url에 doc-sql로 시작하는 표기가 있거나, 디코딩한 url에 union select, ' or 1=1, or '1'='1, ;--, sleep( 같은 모양이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "SQL 구문|데이터베이스 조회"
          },
          {
            "source": "urlNotation",
            "field": "data.url",
            "regex": "(?:^|[/?&=])doc-sql"
          },
          {
            "source": "decodedUrl",
            "field": "data.url",
            "decode": true,
            "regex": "union(?:\\s|\\+|/\\*[^*]{0,64}\\*/){1,16}(?:all(?:\\s|\\+){1,16})?select|'\\s*or\\s*'?1'?\\s*=\\s*'?1|;\\s*--|\\bsleep\\s*\\("
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1190 + CWE-89(SQL Injection): 요청 인자에 SQL 구문을 이어 붙여 데이터베이스 조회를 바꾸려는 시도."
  },
  {
    "name": "script-injection",
    "technique": "T1190",
    "conditions": {
      "text": "설명에 \"스크립트 삽입\"이나 \"스크립트 표식\"이 있거나, url에 doc-script로 시작하는 표기나 doc-mixed-marker가 있거나, 디코딩한 url에 <script, javascript:, onerror=, onload= 모양이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "스크립트 삽입|스크립트 표식"
          },
          {
            "source": "urlNotation",
            "field": "data.url",
            "regex": "(?:^|[/?&=])doc-(?:script|mixed-marker)"
          },
          {
            "source": "decodedUrl",
            "field": "data.url",
            "decode": true,
            "regex": "<\\s*script|javascript\\s*:|\\bonerror\\s*=|\\bonload\\s*="
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1190 + CWE-79(Cross-site Scripting): 요청 인자에 스크립트 태그나 이벤트 처리기를 넣어 화면에서 실행되게 하려는 시도."
  },
  {
    "name": "path-traversal",
    "technique": "T1190",
    "conditions": {
      "text": "설명에 \"경로를 … 거슬러\"나 \"경로 이탈\"이 있거나, url에 doc-up-repeat 표기가 있거나, 디코딩한 url에 ../가 2번 이상, ..%2f, %2e%2e 모양이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "경로를[^.]*거슬러|경로 이탈"
          },
          {
            "source": "urlNotation",
            "field": "data.url",
            "regex": "(?:^|[/?&=])doc-up-repeat"
          },
          {
            "source": "decodedUrl",
            "field": "data.url",
            "decode": true,
            "regex": "\\.\\.[/\\\\].*\\.\\.[/\\\\]|\\.\\.%2f|%2e%2e"
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1190 + CWE-22(Path Traversal): 파일 경로 인자에 ../를 반복해 허용된 폴더 밖 파일을 읽으려는 시도."
  },
  {
    "name": "command-injection",
    "technique": "T1190",
    "conditions": {
      "text": "설명에 \"명령 구분자\"가 있거나, url에 doc-cmd로 시작하는 표기가 있거나, 디코딩한 url에 ;, |, &&, $(, 백틱 뒤에 명령어가 오는 모양이 있다.",
      "match": {
        "any": [
          {
            "source": "description",
            "field": "rule.description",
            "regex": "명령 구분자"
          },
          {
            "source": "urlNotation",
            "field": "data.url",
            "regex": "(?:^|[/?&=])doc-cmd"
          },
          {
            "source": "decodedUrl",
            "field": "data.url",
            "decode": true,
            "regex": "(?:;|\\|\\||\\||&&|\\$\\(|`)\\s*(?:cat|ls|id|whoami|uname|wget|curl|sh|bash|nc|rm|ping|echo)\\b"
          }
        ]
      }
    },
    "strength": "strong",
    "evidence": "MITRE ATT&CK T1190 + CWE-78(OS Command Injection): 요청 인자에 명령 구분자와 명령어를 넣어 서버 명령을 실행하려는 시도. 카드의 세 신호에는 없지만 시험 경보에 명령 구분자 반복 형태가 있어 넣음."
  }
]);

export const LURE_GUARDS = Object.freeze({
  "text": "설명에 아래 표현이 있으면 그 경보에서는 어떤 패턴의 신호도 세지 않습니다. 수업 이름·공지 제목처럼 공격 낱말이 들어간 정상 조회와, 반복되지 않은 한 번짜리 표기를 신호로 보지 않기 위함입니다. url 표기는 doc-로 시작하는 공격 표기만 신호로 보므로 select-course, script-class 같은 낱말은 신호가 아닙니다.",
  "field": "rule.description",
  "regex": "아님|아닙니다|수업명|수업|공지 제목|반복 없음|반복은 없습니다|반복되지 않았습니다",
  "evidence": "카드의 '같은 주소에서 반복되는 명확한 주입 시도만 막습니다'에 맞춰, 설명이 스스로 공격이 아니거나 반복이 없다고 밝힌 경보는 신호에서 뺌."
});

export const REPEAT = Object.freeze({
  "field": "data.count",
  "min": 5,
  "defaultWhenMissing": 1,
  "text": "data.count를 숫자로 바꿔 5 이상이면 같은 주소에서 반복으로 봅니다. 칸이 없거나 숫자가 아니면 1로 봅니다.",
  "evidence": "카드의 '같은 주소에서 반복되는 명확한 주입 시도만 막습니다'. 기준 숫자 5는 근거 문서로 확인되지 않아 정한 값입니다."
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
  "evidence": "Wazuh 규칙 수준 분류(낮은 수준은 성공·저우선 알림, 높은 수준은 반복 오류·중요 이벤트)"
});

// 확신도 표: [T1190 있음일 때 신호·반복 상태][수준 구간].
const CONFIDENCE = Object.freeze({
  signalRepeat: { attack: 0.95, ambiguous: 0.70, normal: 0.55 },
  signalOnce: { attack: 0.75, ambiguous: 0.60, normal: 0.50 },
  noSignal: { attack: 0.65, ambiguous: 0.55, normal: 0.20 },
});
const NO_TECHNIQUE_WITH_PAYLOAD = 0.50;
const NO_TECHNIQUE = 0.10;
const INVALID = 0.00;
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const TECHNIQUE = 'T1190';
const URL_LIMIT = 4096;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (target, path) => path.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
const compiled = new Map();
const regexOf = source => {
  if (!compiled.has(source)) compiled.set(source, new RegExp(source, 'u'));
  return compiled.get(source);
};

// url 검사 대상: 앞쪽 4096자만, 소문자 원문과 한 번·두 번 디코딩한 값. 디코딩이 깨지면 그 단계까지만 봅니다.
function urlStages(value) {
  const head = value.slice(0, URL_LIMIT);
  const stages = [head.toLowerCase()];
  let current = head;
  for (let round = 0; round < 2; round += 1) {
    let next;
    try {
      next = decodeURIComponent(current);
    } catch {
      break;
    }
    if (next === current) break;
    current = next;
    stages.push(current.toLowerCase());
  }
  return stages;
}

// 한 갈래 조건을 검사합니다. 글자가 아니면 거짓입니다.
function sourceMatches(alert, condition, stagesOf) {
  const value = get(alert, condition.field);
  if (typeof value !== 'string') return false;
  const re = regexOf(condition.regex);
  if (condition.decode) return stagesOf(condition.field, value).some(stage => re.test(stage));
  return re.test(value.slice(0, URL_LIMIT));
}

// 패턴마다 맞은 갈래를 모읍니다. 미끼 제외는 설명·문서용 표기 갈래에만 적용하고, 실제 공격 모양 갈래는 그대로 셉니다.
function findSignals(alert) {
  const cache = new Map();
  const stagesOf = (field, value) => {
    if (!cache.has(field)) cache.set(field, urlStages(value));
    return cache.get(field);
  };
  const guardText = get(alert, LURE_GUARDS.field);
  const lured = typeof guardText === 'string' && regexOf(LURE_GUARDS.regex).test(guardText);
  const hits = [];
  for (const item of PATTERNS) {
    const branches = Array.isArray(item.conditions?.match?.any) ? item.conditions.match.any : [];
    const sources = branches.filter(branch => (branch.source === 'decodedUrl' || !lured) && sourceMatches(alert, branch, stagesOf))
      .map(branch => branch.source);
    if (sources.length) hits.push({ name: item.name, sources });
  }
  return hits;
}

// data.count처럼 글자로 든 정수만 숫자로 바꿉니다. 없거나 숫자가 아니면 REPEAT.defaultWhenMissing(1)입니다.
function countOf(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\s{0,8}\d{1,9}\s{0,8}$/u.test(value)) return Number(value.trim());
  return REPEAT.defaultWhenMissing;
}

// 수준 칸이 없으면 4 이하(normal)로 봅니다. 정수가 아닌 수준은 가까운 아래 구간으로 봅니다.
function levelBand(level) {
  if (!Number.isFinite(level)) return 'normal';
  const found = LEVEL_BANDS.bands.find(item => (item.min === undefined || level >= item.min) && (item.max === undefined || level <= item.max));
  return found ? found.band : (level < 5 ? 'normal' : level < 10 ? 'ambiguous' : 'attack');
}

const actionOf = confidence => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const answer = (confidence, reason) => ({ action: actionOf(confidence), confidence, reason });

export function decide(alert) {
  try {
    if (!isObject(alert)) return answer(INVALID, 'invalid-alert');
    const mitre = get(alert, 'rule.mitre');
    const hasTechnique = Array.isArray(mitre) && mitre.includes(TECHNIQUE);
    const hits = findSignals(alert);
    const names = hits.map(hit => hit.name).join('+');
    if (!hasTechnique) {
      const payload = hits.filter(hit => hit.sources.includes('decodedUrl')).map(hit => hit.name).join('+');
      return payload ? answer(NO_TECHNIQUE_WITH_PAYLOAD, `${payload} · no-T1190`) : answer(NO_TECHNIQUE, 'no-T1190');
    }
    const level = get(alert, 'rule.level');
    const band = levelBand(level);
    const levelText = Number.isFinite(level) ? `level ${level}(${band})` : 'level 없음(normal로 봄)';
    if (!hits.length) return answer(CONFIDENCE.noSignal[band], `no-signal · ${levelText}`);
    const count = countOf(get(alert, REPEAT.field));
    const repeated = count >= REPEAT.min;
    const table = repeated ? CONFIDENCE.signalRepeat : CONFIDENCE.signalOnce;
    return answer(table[band], `${names} · ${repeated ? 'repeat' : 'no-repeat'} ${count} · ${levelText}`);
  } catch {
    return answer(INVALID, 'invalid-alert');
  }
}
