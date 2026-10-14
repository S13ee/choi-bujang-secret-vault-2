// GET·PUT·DELETE /api/notes/:id
// 로직은 src/notes-api.mjs에 있습니다. 본인(owner_id = 검증된 사용자 ID) 메모만 다룹니다.
// 10단계: /api/notes/:id/restore와 함께 두려고 api/notes/[id].js에서 이 폴더의 index.js로 옮겼습니다(주소는 같음).
import { handleItem } from '../../../src/notes-api.mjs';

export default handleItem;
