// 가상 메모를 Supabase에서 서버 전용 키로 읽어 화면에 넘깁니다.
// 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
// 3단계: Authorization 헤더의 로그인 토큰을 src/verify-login.mjs로 검사한 요청에만 자료를 줍니다.
// 브라우저가 보낸 userId·role 같은 값은 읽지 않습니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

let verifyLogin;

function deny(response) {
  response.setHeader('WWW-Authenticate', 'Bearer');
  response.status(401).json({ error: 'LOGIN_REQUIRED', message: '로그인이 필요하거나 로그인 확인에 실패했습니다.' });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith('https://') || !key) {
    console.error('notes: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    response.status(500).json({ error: 'NOTES_NOT_CONFIGURED' });
    return;
  }
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: key });
  } catch (error) {
    // 설정 오류 이름만 남깁니다 (예: invalid_student_identity_provider).
    console.error('notes: 로그인 검사 설정 오류', error.message);
    response.status(500).json({ error: 'LOGIN_NOT_CONFIGURED' });
    return;
  }
  const login = await verifyLogin(request.headers?.authorization);
  if (!login) {
    deny(response);
    return;
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('byteback_vault_notes')
    .select('title, content, sample_marker')
    .order('created_at', { ascending: true });
  if (error) {
    // 오류 코드만 남깁니다. 요청 헤더나 키는 기록하지 않습니다.
    console.error('notes: Supabase 조회 실패', error.code ?? 'unknown');
    response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
    return;
  }
  response.status(200).json({
    sampleMarker: data[0]?.sample_marker ?? null,
    notes: data.map(({ title, content }) => ({ title, content })),
  });
}
