// POST /api/auth/refresh: 토큰 갱신 (HttpOnly 쿠키)
// 로직은 src/auth-api.mjs에 있습니다.
import { handleRefresh } from '../../src/auth-api.mjs';

export default handleRefresh;
