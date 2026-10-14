// POST /api/notes/:id/restore (서비스 notes): 비공개 사본에서 이 ID 한 건만 복구합니다.
// 로직은 src/notes-api.mjs의 handleRestore에 있습니다. 본인 사본만, 사본 지문이 맞을 때만 되돌립니다.
import { handleRestore } from '../../../src/notes-api.mjs';

export default handleRestore;
