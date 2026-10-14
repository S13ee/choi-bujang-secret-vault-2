// GET·PUT·DELETE /api/notes/:id
// 로직은 src/notes-api.mjs에 있습니다. 본인(owner_id = 검증된 사용자 ID) 메모만 다룹니다.
// 10단계: /api/notes/:id/restore와 함께 두려고 api/notes/[id].js에서 이 폴더의 index.js로 옮겼습니다(주소는 같음).
import { handleItem } from '../../../src/notes-api.mjs';
import { withRequestLog } from '../../../src/request-log.mjs';

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 동작은 그대로입니다.
export default withRequestLog(handleItem);
