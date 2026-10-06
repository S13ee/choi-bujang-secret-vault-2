// GET·PUT·DELETE /api/notes/:id
// 로직은 src/notes-api.mjs에 있습니다. 본인(owner_id = 검증된 사용자 ID) 메모만 다룹니다.
import { handleItem } from '../../src/notes-api.mjs';

export default handleItem;
