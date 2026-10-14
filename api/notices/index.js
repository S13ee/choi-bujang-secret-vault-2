// GET /api/notices: 로그인 사용자가 읽는 강사 공지 목록
// 로직은 src/notices-api.mjs에 있습니다.
import { handleNoticeCollection } from '../../src/notices-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleNoticeCollection);
