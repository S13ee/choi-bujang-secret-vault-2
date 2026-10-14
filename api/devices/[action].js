// 11단계: 기기 승인 경로 세 개를 함수 하나로 둡니다(Vercel Hobby 요금제의 서버 함수 12개 제한).
//   POST /api/devices/request — 본문 {deviceId, publicKeyJwk}. 기기를 pending으로 등록하거나 지금 상태를 돌려줍니다.
//   GET  /api/devices/status  — 로그인 + 기기 서명. {deviceId, status, approved}
//   POST /api/devices/approve — 로그인 + 기기 서명 + 비밀번호 재확인으로 그 기기만 승인합니다.
// 로직은 src/devices-api.mjs에 있습니다. 메서드 확인(405)과 응답은 각 처리 함수가 그대로 합니다.
// request.url은 바꾸지 않고 그대로 넘깁니다(서명 문자열의 경로가 원래 주소여야 함). 그 밖의 action은 404 JSON입니다.
import { handleDeviceApprove, handleDeviceRequest, handleDeviceStatus } from '../../src/devices-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

const ACTIONS = { request: handleDeviceRequest, status: handleDeviceStatus, approve: handleDeviceApprove };

function handleDevices(request, response) {
  const action = request.query?.action;
  const handler = typeof action === 'string' && Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!handler) {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(404).json({ error: 'NOT_FOUND' });
  }
  return handler(request, response);
}

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleDevices);
