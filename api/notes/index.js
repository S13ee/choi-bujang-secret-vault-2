// GET /api/notes: 로그인 사용자의 메모 목록, POST /api/notes: 메모 추가
// 로직은 src/notes-api.mjs에 있습니다.
import { handleCollection } from '../../src/notes-api.mjs';

export default handleCollection;
