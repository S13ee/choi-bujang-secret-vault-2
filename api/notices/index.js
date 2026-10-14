// GET /api/notices: 로그인 사용자가 읽는 강사 공지 목록
// 로직은 src/notices-api.mjs에 있습니다.
import { handleNoticeCollection } from '../../src/notices-api.mjs';

export default handleNoticeCollection;
