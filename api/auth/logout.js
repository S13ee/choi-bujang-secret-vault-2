// POST /api/auth/logout: 로그아웃 (Authorization: Bearer)
// 로직은 src/auth-api.mjs에 있습니다.
import { handleLogout } from '../../src/auth-api.mjs';

export default handleLogout;
