// GET /api/notes: 로그인 사용자의 메모 목록, POST /api/notes: 메모 추가
// 로직은 src/notes-api.mjs에 있습니다.
import { handleCollection } from '../../src/notes-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleCollection);
