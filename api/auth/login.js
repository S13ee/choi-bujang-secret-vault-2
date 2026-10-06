// POST /api/auth/login: 로그인 {email, password}
// 로직은 src/auth-api.mjs에 있습니다.
import { handleLogin } from '../../src/auth-api.mjs';

export default handleLogin;
