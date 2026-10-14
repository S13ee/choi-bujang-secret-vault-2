// GET /api/notices/:id
// 로직은 src/notices-api.mjs에 있습니다. 공지 테이블(byteback_vault_notices)만 읽습니다.
import { handleNoticeItem } from '../../src/notices-api.mjs';
import { withRequestLog } from '../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleNoticeItem);
