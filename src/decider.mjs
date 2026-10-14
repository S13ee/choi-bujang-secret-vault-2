// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙에 맞지 않는 요청은 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required',
  'anomaly.region', 'anomaly.network', 'anomaly.hour', 'anomaly.burst',
  'zone.notes.read', 'zone.notices.read', 'zone.notes.list', 'zone.notes.write', 'zone.notices.write',
  'zone.instructor', 'zone.route_mismatch', 'zone.query', 'zone.unknown']);

const respond = (requestId, decision, reasonCode, ruleIds) => ({
  schema: 'aleph.decision.v1',
  requestId,
  decision,
  reasonCode,
  ruleIds: Array.isArray(ruleIds) ? ruleIds : [ruleIds],
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');

// 7단계 입력 검사: signals.source가 정확히 judge_fixture일 때만 region·network·hour를 근거로 씁니다.
// none·빈 값·그 밖의 출처, unknown, 0~23 정수가 아닌 시각은 신호 없음(null)이며 정상값으로 채우지 않습니다.
// judge_fixture는 심판의 가상 신호이고 실제 위치 증거가 아닙니다.
export function readSignals(request) {
  const none = { source: null, region: null, network: null, hour: null };
  const signals = isPlainObject(request) ? request.signals : null;
  if (!isPlainObject(signals) || signals.source !== 'judge_fixture') return none;
  const label = value => (typeof value === 'string' && value.length > 0 && value.length <= 64
    && value !== 'unknown' ? value : null);
  return {
    source: 'judge_fixture',
    region: label(signals.region),
    network: label(signals.network),
    hour: Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23 ? signals.hour : null,
  };
}

// 7단계 입력 검사: recentEvents는 배열일 때만, 항목은 {kind, ageSeconds, count} 모양일 때만 읽습니다.
// 형식이 틀린 항목은 예외 없이 버립니다. 계약상 최대 12건이므로 앞의 12건만 봅니다.
export function readRecentEvents(request) {
  const events = isPlainObject(request) ? request.recentEvents : null;
  if (!Array.isArray(events)) return [];
  return events.slice(0, 12).filter(event => isPlainObject(event)
    && hasOnlyKeys(event, ['kind', 'ageSeconds', 'count'])
    && typeof event.kind === 'string' && event.kind.length > 0 && event.kind.length <= 64
    && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
    && Number.isInteger(event.count) && event.count >= 0)
    .map(({ kind, ageSeconds, count }) => ({ kind, ageSeconds, count }));
}

// 7단계 step_up_required: 믿을 수 있는 신호(judge_fixture) 가운데 하나라도 이상하면 "평소와 다른 접속"입니다.
// 신호 없음(null, unknown 포함)은 정상도 이상도 아니므로 이상으로 세지 않습니다.
// region은 local이 아닌 값, network는 usual이 아닌 값, hour는 0~5시가 이상입니다.
const USUAL_REGION = 'local';
const USUAL_NETWORK = 'usual';
const LATE_NIGHT_HOURS = [0, 1, 2, 3, 4, 5];
// 행동: 900초 안 risk_signal 합계 5 이상, 또는 종류와 상관없이 600초 안 한 사건의 count가 10 이상이면 이상입니다.
const RISK_EVENT_KIND = 'risk_signal';
const RISK_EVENT_WINDOW_SECONDS = 900;
const RISK_EVENT_MIN_COUNT = 5;
const BURST_WINDOW_SECONDS = 600;
const BURST_MIN_COUNT = 10;
// 재인증은 엔진이 확인한 지 5분 이내일 때만 인정합니다(계약 범위 0~900초 안에서 더 좁게).
const STEP_UP_MAX_AGE_SECONDS = 300;

// 실제로 걸린 이상의 규칙 이름을 anomaly.region·network·hour·burst 순서로 돌려줍니다.
export function findAnomalies(request) {
  const signals = readSignals(request);
  const events = readRecentEvents(request);
  const riskTotal = events.filter(event => event.kind === RISK_EVENT_KIND
    && event.ageSeconds <= RISK_EVENT_WINDOW_SECONDS)
    .reduce((sum, event) => sum + event.count, 0);
  const burst = events.some(event => event.ageSeconds <= BURST_WINDOW_SECONDS
    && event.count >= BURST_MIN_COUNT);
  return [
    signals.region !== null && signals.region !== USUAL_REGION && 'anomaly.region',
    signals.network !== null && signals.network !== USUAL_NETWORK && 'anomaly.network',
    signals.hour !== null && LATE_NIGHT_HOURS.includes(signals.hour) && 'anomaly.hour',
    (riskTotal >= RISK_EVENT_MIN_COUNT || burst) && 'anomaly.burst',
  ].filter(Boolean);
}

// 엔진이 넘긴 stepUp이 정확히 verified: true이고 나이가 0~300초 정수일 때만 "방금 다시 로그인함"으로 봅니다.
// 토큰 원문은 계약에 없고, 판정기는 받지도 기록하지도 않습니다.
export function freshStepUp(request) {
  const stepUp = isPlainObject(request) ? request.stepUp : null;
  return isPlainObject(stepUp) && stepUp.verified === true && Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= STEP_UP_MAX_AGE_SECONDS;
}

// 8단계 구역 규칙: 메모(notes)·반 공지(notices)·강사 자료를 서비스와 정확한 경로 모양으로 나눕니다.
// 허용 경로는 아래 세 모양뿐이며, route 앞의 /api 유무만 같은 경로로 봅니다(그 밖의 변형은 알 수 없는 경로).
// 메모 주인 비교는 판정기가 아니라 메모 API(owner_id = 검증된 사용자 ID)가 합니다. 판정기 요청에는 역할이 없으므로
// 강사의 공지 수정은 판정기가 아닌 서버의 관리 경로에서 처리하고, 판정기에서는 모든 쓰기를 거부합니다.
// 심판의 가상 메모 ID는 UUID가 아닐 수 있으므로 :id 칸은 빈 값이 아니고 /가 없는 한 칸이면 받습니다.
const ALLOWED_ZONES = Object.freeze({
  'GET /notes/:id': 'zone.notes.read',
  'GET /notices': 'zone.notices.read',
  'GET /notices/:id': 'zone.notices.read',
});
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const INSTRUCTOR_SEGMENTS = ['instructor', 'instructors'];
const ROUTE_LABEL = /^(GET|POST|PUT|PATCH|DELETE) (\/[^\s?#]*)$/u;

// route 이름표를 { method, segments(요청 path와 비교할 모양), key(/api를 뗀 모양), zone }으로 읽습니다.
function readRoute(route) {
  const match = typeof route === 'string' ? ROUTE_LABEL.exec(route) : null;
  if (!match) return null;
  const segments = match[2].split('/').slice(1);
  const bare = segments[0] === 'api' ? segments.slice(1) : segments;
  return { method: match[1], segments, bare, key: `${match[1]} /${bare.join('/')}` };
}

// path가 route 모양과 칸 수까지 같은지 봅니다. 정적 칸은 글자가 같아야 하고, :id 칸은 빈 값이 아닌 한 칸입니다.
function pathMatches(path, segments) {
  if (typeof path !== 'string' || !path.startsWith('/') || /[?#]/u.test(path)) return false;
  const parts = path.split('/').slice(1);
  return parts.length === segments.length
    && segments.every((segment, index) => (segment === ':id' ? parts[index].length > 0 : parts[index] === segment));
}

// 구역 판정: { allowed: true, rule } 또는 { allowed: false, rule }.
export function checkZone(request) {
  if (request.queryLength !== 0) return { allowed: false, rule: 'zone.query' };
  const route = readRoute(request.route);
  if (!route) return { allowed: false, rule: 'zone.unknown' };
  const allowedRule = ALLOWED_ZONES[route.key];
  if (!allowedRule) {
    const [area, id, ...rest] = route.bare;
    if (INSTRUCTOR_SEGMENTS.includes(area)) return { allowed: false, rule: 'zone.instructor' };
    const knownShape = rest.length === 0 && (id === undefined || id === ':id');
    if (area === 'notes' && knownShape && route.method === 'GET') return { allowed: false, rule: 'zone.notes.list' };
    if (area === 'notes' && knownShape && WRITE_METHODS.includes(route.method)) {
      return { allowed: false, rule: 'zone.notes.write' };
    }
    if (area === 'notices' && knownShape && WRITE_METHODS.includes(route.method)) {
      return { allowed: false, rule: 'zone.notices.write' };
    }
    return { allowed: false, rule: 'zone.unknown' };
  }
  // route 이름표만 믿지 않습니다. method·path·service가 모두 그 경로와 맞아야 합니다.
  if (request.method !== route.method || !pathMatches(request.path, route.segments)
      || request.service !== route.bare[0]) {
    return { allowed: false, rule: 'zone.route_mismatch' };
  }
  return { allowed: true, rule: allowedRule };
}

export async function decide(request) {
  const valid = request !== null && typeof request === 'object' && !Array.isArray(request);
  const requestId = valid && typeof request.requestId === 'string' ? request.requestId : null;

  // 6단계 device_registered: 엔진이 알려 준 deviceRegistered가 정확히 true일 때만 등록 기기로 봅니다.
  if (!valid || request.deviceRegistered !== true) {
    return respond(requestId, 'deny', 'device_not_registered', 'device_registered');
  }
  // 8단계 구역 검사: 허용 경로 세 개가 아니면 재인증 여부와 상관없이 기본 거부 코드로 거부합니다.
  const zone = checkZone(request);
  if (!zone.allowed) return respond(requestId, 'deny', 'starter_not_ready', ['starter.deny', zone.rule]);
  // 7단계: 평소와 다른 접속은 새 로그인 확인 전까지 자료를 주지 않고 엔진에 추가 확인을 요청합니다.
  // stepUp만으로는 통과시키지 않습니다. 등록 기기·구역·이상 표시 판단을 모두 거친 뒤에만 봅니다.
  const anomalies = findAnomalies(request);
  if (anomalies.length > 0) {
    if (!freshStepUp(request)) {
      return respond(requestId, 'step_up', 'step_up_required', ['step_up_required', ...anomalies]);
    }
    return respond(requestId, 'allow', 'approved',
      ['device_registered', zone.rule, 'step_up_required', ...anomalies]);
  }
  return respond(requestId, 'allow', 'approved', ['device_registered', zone.rule]);
}
