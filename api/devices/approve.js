// 11단계: POST /api/devices/approve — 로그인 + 기기 서명 + 비밀번호 재확인으로 그 기기만 승인합니다.
// 로직은 src/devices-api.mjs에 있습니다. 다른 사용자의 기기는 보이지도 바뀌지도 않습니다.
import { handleDeviceApprove } from '../../src/devices-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleDeviceApprove);
