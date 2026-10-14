// PUT /api/admin/notices/:id: 강사 목록(byteback_vault_instructors)에 있는 사용자만 공지를 수정합니다.
// 로직은 src/notices-api.mjs에 있습니다. 판정기가 허용하지 않는 관리 경로라 allowedRoutes에 넣지 않습니다.
import { handleAdminNoticeUpdate } from '../../../src/notices-api.mjs';

export default handleAdminNoticeUpdate;
