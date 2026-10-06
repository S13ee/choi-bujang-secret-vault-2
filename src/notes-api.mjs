// 가상 메모 API 공통 로직입니다. api/notes/index.js와 api/notes/[id].js가 씁니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
// 로그인 여부는 src/verify-login.mjs가 확인한 사용자 ID로만 판단합니다.
// 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다.
// 4단계: 목록·한 건 조회·수정·삭제는 owner_id가 검증된 사용자 ID와 같은 행만 다루고,
// 추가할 때는 검증된 사용자 ID를 owner_id로 저장합니다.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const TABLE = 'byteback_vault_notes';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;

let verifyLogin;
let supabase;

const send = (response, status, body) => response.status(status).json(body);
const toNote = row => ({ id: row.id, title: row.title, body: row.content });

// 환경변수·로그인 검사 후 로그인 정보를 돌려줍니다. 실패하면 응답을 보내고 null을 돌려줍니다.
async function authenticate(request, response, allowed) {
  response.setHeader('Cache-Control', 'no-store');
  if (!allowed.includes(request.method)) {
    response.setHeader('Allow', allowed.join(', '));
    send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    return null;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith('https://') || !key) {
    console.error('notes: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    send(response, 500, { error: 'NOTES_NOT_CONFIGURED' });
    return null;
  }
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: key });
  } catch (error) {
    // 설정 오류 이름만 남깁니다 (예: invalid_student_identity_provider).
    console.error('notes: 로그인 검사 설정 오류', error.message);
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

function readJson(request) {
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// title·body만 받습니다. 그 밖의 칸(owner_id, userId, role 등)은 무시합니다.
function readNoteFields(input, response) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body : null;
  if (!title || title.length > TITLE_MAX || body === null || body.length > BODY_MAX) {
    send(response, 400, { error: 'INVALID_NOTE',
      message: `title(1~${TITLE_MAX}자)과 body(문자열, ${BODY_MAX}자 이하)가 필요합니다.` });
    return null;
  }
  return { title, body };
}

function failed(response, error, label) {
  // 오류 코드만 남깁니다. 요청 헤더나 키는 기록하지 않습니다.
  console.error(`notes: ${label} 실패`, error?.code ?? 'unknown');
  send(response, 502, { error: 'NOTES_UNAVAILABLE' });
}

// GET /api/notes, POST /api/notes
export async function handleCollection(request, response) {
  const login = await authenticate(request, response, ['GET', 'POST']);
  if (!login) return;
  if (request.method === 'GET') {
    const { data, error } = await supabase.from(TABLE).select('id, title, content')
      .eq('owner_id', login.userId).order('created_at', { ascending: true });
    if (error) return failed(response, error, '목록 조회');
    return send(response, 200, data.map(toNote));
  }
  const input = readJson(request);
  if (!input) return send(response, 400, { error: 'INVALID_JSON' });
  if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const fields = readNoteFields(input, response);
  if (!fields) return;
  const id = (input.id ?? randomUUID()).toLowerCase();
  const { error } = await supabase.from(TABLE).insert({
    id, owner_id: login.userId, sample_marker: config.sampleMarker,
    title: fields.title, content: fields.body,
  });
  if (error?.code === '23505') return send(response, 409, { error: 'ID_ALREADY_EXISTS' });
  if (error) return failed(response, error, '추가');
  return send(response, 201, { id });
}

// GET·PUT·DELETE /api/notes/:id
// 4단계: 모든 조회·수정·삭제에 owner_id = 검증된 사용자 ID 조건을 함께 겁니다.
// 남의 메모와 없는 메모는 같은 404로 답해, 남의 메모가 있는지도 알려 주지 않습니다.
export async function handleItem(request, response) {
  const login = await authenticate(request, response, ['GET', 'PUT', 'DELETE']);
  if (!login) return;
  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const notFound = () => send(response, 404, { error: 'NOTE_NOT_FOUND' });
  if (request.method === 'GET') {
    const { data, error } = await supabase.from(TABLE).select('id, title, content')
      .eq('id', id).eq('owner_id', login.userId).maybeSingle();
    if (error) return failed(response, error, '조회');
    return data ? send(response, 200, toNote(data)) : notFound();
  }
  if (request.method === 'PUT') {
    const input = readJson(request);
    if (!input) return send(response, 400, { error: 'INVALID_JSON' });
    // 본문에서는 title·body만 읽습니다. owner_id가 들어 있어도 쓰지 않습니다.
    const fields = readNoteFields(input, response);
    if (!fields) return;
    // 기존 행: owner_id 조건으로 본인 행만 바뀝니다. 새 행: owner_id를 바꾸지 않고, 결과로 한 번 더 확인합니다.
    const { data, error } = await supabase.from(TABLE)
      .update({ title: fields.title, content: fields.body })
      .eq('id', id).eq('owner_id', login.userId)
      .select('id, title, content, owner_id').maybeSingle();
    if (error) return failed(response, error, '수정');
    if (!data) return notFound();
    if (data.owner_id !== login.userId) {
      console.error('notes: 수정 결과의 소유자가 요청자와 다릅니다');
      return send(response, 500, { error: 'OWNER_CHECK_FAILED' });
    }
    return send(response, 200, toNote(data));
  }
  const { data, error } = await supabase.from(TABLE).delete()
    .eq('id', id).eq('owner_id', login.userId).select('id');
  if (error) return failed(response, error, '삭제');
  return data.length ? send(response, 200, { id }) : notFound();
}
