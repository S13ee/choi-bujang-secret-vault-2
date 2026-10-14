// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙에 맞지 않는 요청은 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required',
  'anomaly.region', 'anomaly.network', 'anomaly.hour', 'anomaly.burst']);

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

export async function decide(request) {
  const valid = request !== null && typeof request === 'object' && !Array.isArray(request);
  const requestId = valid && typeof request.requestId === 'string' ? request.requestId : null;

  // 6단계 device_registered: 엔진이 알려 준 deviceRegistered가 정확히 true일 때만 등록 기기로 봅니다.
  if (!valid || request.deviceRegistered !== true) {
    return respond(requestId, 'deny', 'device_not_registered', 'device_registered');
  }
  // 등록 기기의 읽기(GET)만 허용합니다. 경로는 엔진이 이미 허용 경로로 확인했습니다.
  if (request.method === 'GET') {
    // 7단계: 평소와 다른 접속은 새 로그인 확인 전까지 자료를 주지 않고 엔진에 추가 확인을 요청합니다.
    // stepUp만으로는 통과시키지 않습니다. 등록 기기·GET·이상 표시 판단을 모두 거친 뒤에만 봅니다.
    const anomalies = findAnomalies(request);
    if (anomalies.length > 0) {
      if (!freshStepUp(request)) {
        return respond(requestId, 'step_up', 'step_up_required', ['step_up_required', ...anomalies]);
      }
      return respond(requestId, 'allow', 'approved', ['device_registered', 'step_up_required', ...anomalies]);
    }
    return respond(requestId, 'allow', 'approved', 'device_registered');
  }
  return respond(requestId, 'deny', 'starter_not_ready', 'starter.deny');
}
