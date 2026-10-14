// POST /api/auth/logout: 로그아웃 (Authorization: Bearer)
// 로직은 src/auth-api.mjs에 있습니다.
import { handleLogout } from '../../src/auth-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleLogout);
