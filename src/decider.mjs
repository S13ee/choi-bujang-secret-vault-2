// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙에 맞지 않는 요청은 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

const respond = (requestId, decision, reasonCode, ruleId) => ({
  schema: 'aleph.decision.v1',
  requestId,
  decision,
  reasonCode,
  ruleIds: [ruleId],
});

export async function decide(request) {
  const valid = request !== null && typeof request === 'object' && !Array.isArray(request);
  const requestId = valid && typeof request.requestId === 'string' ? request.requestId : null;

  // 6단계 device_registered: 엔진이 알려 준 deviceRegistered가 정확히 true일 때만 등록 기기로 봅니다.
  if (!valid || request.deviceRegistered !== true) {
    return respond(requestId, 'deny', 'device_not_registered', 'device_registered');
  }
  // 등록 기기의 읽기(GET)만 허용합니다. 경로는 엔진이 이미 허용 경로로 확인했습니다.
  if (request.method === 'GET') {
    return respond(requestId, 'allow', 'approved', 'device_registered');
  }
  return respond(requestId, 'deny', 'starter_not_ready', 'starter.deny');
}
