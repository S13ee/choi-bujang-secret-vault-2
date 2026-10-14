// 11단계: GET /api/devices/status — 로그인 + 기기 서명. {deviceId, status, approved}
// 로직은 src/devices-api.mjs에 있습니다. 다른 사용자의 기기는 보이지도 바뀌지도 않습니다.
import { handleDeviceStatus } from '../../src/devices-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleDeviceStatus);
