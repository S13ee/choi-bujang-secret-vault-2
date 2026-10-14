// GET /api/notices/:id
// 로직은 src/notices-api.mjs에 있습니다. 공지 테이블(byteback_vault_notices)만 읽습니다.
import { handleNoticeItem } from '../../src/notices-api.mjs';

export default handleNoticeItem;
