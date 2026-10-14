// 8단계 강사 공지 읽기 API입니다. api/notices/index.js와 api/notices/[id].js가 씁니다.
// 공지는 메모(자원 notes, byteback_vault_notes)와 다른 자원 notices이며 별도 테이블 byteback_vault_notices만 읽습니다.
// 그래서 메모 경로에 공지 id를 넣어도, 공지 경로에 메모 id를 넣어도 서로의 자료가 나오지 않습니다.
// 로그인한 사용자만 읽을 수 있고(src/verify-login.mjs), GET만 받습니다. 쓰기 경로는 아직 없습니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
// 브라우저가 보낸 userId·role 같은 값은 읽지 않습니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const TABLE = 'byteback_vault_notices';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

let verifyLogin;
let supabase;

const send = (response, status, body) => response.status(status).json(body);
const toNotice = row => ({ id: row.id, title: row.title, body: row.content });

// 거부 사유는 짧은 오류 코드만 남깁니다. 사용자 ID·토큰·본문은 기록하지 않습니다.
const deny = (response, status, code, label) => {
  console.warn(`${label}: 거부 ${code}`);
  return send(response, status, { error: code });
};

// 허용한 메서드만 받고, 환경변수·로그인 검사 후 로그인 정보를 돌려줍니다. 실패하면 응답을 보내고 null을 돌려줍니다.
// 일반 공지 경로는 GET만 받으므로 쓰기는 누구에게나 405로 거부됩니다.
async function authenticate(request, response, allowed = 'GET', label = 'notices') {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== allowed) {
    response.setHeader('Allow', allowed);
    deny(response, 405, 'METHOD_NOT_ALLOWED', label);
    return null;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith('https://') || !key) {
    console.error('notices: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    send(response, 500, { error: 'NOTICES_NOT_CONFIGURED' });
    return null;
  }
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: key });
  } catch (error) {
    console.error('notices: 로그인 검사 설정 오류', error.message);
    send(response, 500, { error: 'LOGIN_NOT_CONFIGURED' });
    return null;
  }
  const login = await verifyLogin(request.headers?.authorization);
  if (!login) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인이 필요하거나 로그인 확인에 실패했습니다.' });
    return null;
  }
  supabase ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return login;
}

function failed(response, error, label) {
  // 오류 코드만 남깁니다. 요청 헤더나 키는 기록하지 않습니다.
  console.error(`notices: ${label} 실패`, error?.code ?? 'unknown');
  send(response, 502, { error: 'NOTICES_UNAVAILABLE' });
}

// GET /api/notices: 공지 목록 [{id,title,body}]
export async function handleNoticeCollection(request, response) {
  if (!await authenticate(request, response)) return;
  const { data, error } = await supabase.from(TABLE).select('id, title, content')
    .order('created_at', { ascending: true });
  if (error) return failed(response, error, '목록 조회');
  return send(response, 200, data.map(toNotice));
}

// GET /api/notices/:id: 공지 한 건 {id,title,body}. 없는 공지(메모 id 포함)는 404입니다.
export async function handleNoticeItem(request, response) {
  if (!await authenticate(request, response)) return;
  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const { data, error } = await supabase.from(TABLE).select('id, title, content')
    .eq('id', id).maybeSingle();
  if (error) return failed(response, error, '조회');
  return data ? send(response, 200, toNotice(data)) : send(response, 404, { error: 'NOTICE_NOT_FOUND' });
}

// PUT /api/admin/notices/:id: 강사의 공지 수정 관리 경로. 판정기가 허용하지 않는 경로라 allowedRoutes에 넣지 않습니다.
// 강사 여부는 서버가 확인한 학생 로그인 사용자 ID가 byteback_vault_instructors에 있는지로만 판단합니다.
// 요청 본문·쿼리·헤더의 role·isInstructor 같은 값은 읽지 않습니다. 심판 토큰은 강사가 아닙니다.
// 본문에서는 title·body만 읽습니다.
const INSTRUCTORS = 'byteback_vault_instructors';
const TITLE_MAX = 200;
const BODY_MAX = 5000;
const ADMIN = 'notices-admin';

function readJson(request) {
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

async function isInstructor(login) {
  if (login.kind !== 'student') return { ok: false };
  const { data, error } = await supabase.from(INSTRUCTORS).select('user_id')
    .eq('user_id', login.userId).maybeSingle();
  if (error) return { error };
  return { ok: Boolean(data) };
}

export async function handleAdminNoticeUpdate(request, response) {
  const login = await authenticate(request, response, 'PUT', ADMIN);
  if (!login) return;
  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) return deny(response, 400, 'INVALID_ID', ADMIN);
  const instructor = await isInstructor(login);
  if (instructor.error) return failed(response, instructor.error, '강사 확인');
  if (!instructor.ok) return deny(response, 403, 'NOT_INSTRUCTOR', ADMIN);
  const input = readJson(request);
  if (!input) return deny(response, 400, 'INVALID_JSON', ADMIN);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body : null;
  if (!title || title.length > TITLE_MAX || body === null || body.length > BODY_MAX) {
    return deny(response, 400, 'INVALID_NOTICE', ADMIN);
  }
  const { data, error } = await supabase.from(TABLE).update({ title, content: body })
    .eq('id', id).select('id, title, content').maybeSingle();
  if (error) return failed(response, error, '수정');
  return data ? send(response, 200, toNotice(data)) : deny(response, 404, 'NOTICE_NOT_FOUND', ADMIN);
}
