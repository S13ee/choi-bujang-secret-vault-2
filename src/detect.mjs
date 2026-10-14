// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const DECISIONS = ['allow', 'deny', 'step_up'];
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => (typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null);

// 9단계 입력 정리: 사건마다 at·method·identity.sub만 읽고, 사건에 기기 ID(deviceId)·판정(decision)·
// 네트워크(network) 값이 있으면 그것만 더 읽습니다. 이 세 값은 docs/DETECT_EVENTS.md 계약에는 아직 없어
// 연습 사건에서는 항상 null입니다. 본문·토큰·이름 등 그 밖의 값은 읽지도 저장하지도 출력하지도 않습니다.
// at이 올바른 ISO 시각이 아니거나 identity.sub가 빈 문자열(또는 문자열이 아님)이면 그 사건만 버립니다.
export function readEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const kept = [];
  for (const event of events) {
    if (!isPlainObject(event)) continue;
    const at = typeof event.at === 'string' && ISO_TIME.test(event.at) ? Date.parse(event.at) : NaN;
    const sub = isPlainObject(event.identity) ? label(event.identity.sub) : null;
    if (!Number.isFinite(at) || sub === null) continue;
    const network = label(event.network);
    kept.push({
      at,
      method: label(event.method),
      sub,
      deviceId: label(event.deviceId),
      decision: DECISIONS.includes(event.decision) ? event.decision : null,
      network: network === 'unknown' ? null : network,
    });
  }
  return kept;
}

// 9단계 burst_read: 같은 identity.sub의 GET 사건이 어느 10분 구간에서든 120건을 넘으면(121건부터) 회수를 제안합니다.
// 구간은 끊어 세지 않고 밀어 가며 셉니다(첫 사건과 마지막 사건의 차이가 10분 미만). 사용자끼리 합치지 않고,
// 순서가 섞여 들어와도 시각 순으로 정렬해 셉니다. 사건에 네트워크 값이 있으면 usual이 아닌 사건만 세고,
// 네트워크 값이 없는 사건(연습 사건)은 다량 조회만으로 셉니다. 지역 값은 읽지도 쓰지도 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

// 그 사용자가 처음 120건을 넘은 시각(넘게 만든 사건의 시각)을 돌려줍니다. 넘지 않으면 null입니다.
function firstBurstAt(times) {
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end] - times[start] >= WINDOW_MS) start += 1;
    if (end - start + 1 > BURST_LIMIT) return times[end];
  }
  return null;
}

export function detect(events) {
  const bySubject = new Map();
  for (const event of readEvents(events)) {
    if (event.method !== 'GET' || event.network === 'usual') continue;
    if (!bySubject.has(event.sub)) bySubject.set(event.sub, []);
    bySubject.get(event.sub).push(event.at);
  }
  // 여러 사용자가 넘으면 가장 먼저 넘은 한 명만 돌려줍니다(같은 시각이면 sub 글자 순).
  let found = null;
  for (const [sub, times] of bySubject) {
    const at = firstBurstAt(times.sort((a, b) => a - b));
    if (at !== null && (found === null || at < found.at || (at === found.at && sub < found.sub))) {
      found = { sub, at };
    }
  }
  return found
    ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: found.sub }
    : { action: 'observe' };
}
