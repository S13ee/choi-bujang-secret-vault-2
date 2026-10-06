// 가상 메모 API 공통 로직입니다. api/notes/index.js와 api/notes/[id].js가 씁니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
// 로그인 여부는 src/verify-login.mjs가 확인한 사용자 ID로만 판단합니다.
// 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다.
// 알려진 허점(4단계에서 고침): 한 건 GET·PUT·DELETE는 소유자를 검사하지 않아
// 로그인한 B가 A의 메모 ID를 알면 읽고 고치고 지울 수 있습니다.
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

// GET·PUT·DELETE /api/notes/:id (아직 소유자 검사 없음)
export async function handleItem(request, response) {
  const login = await authenticate(request, response, ['GET', 'PUT', 'DELETE']);
  if (!login) return;
  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  if (request.method === 'GET') {
    const { data, error } = await supabase.from(TABLE).select('id, title, content')
      .eq('id', id).maybeSingle();
    if (error) return failed(response, error, '조회');
    return data ? send(response, 200, toNote(data)) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
  }
  if (request.method === 'PUT') {
    const input = readJson(request);
    if (!input) return send(response, 400, { error: 'INVALID_JSON' });
    const fields = readNoteFields(input, response);
    if (!fields) return;
    const { data, error } = await supabase.from(TABLE)
      .update({ title: fields.title, content: fields.body })
      .eq('id', id).select('id, title, content').maybeSingle();
    if (error) return failed(response, error, '수정');
    return data ? send(response, 200, toNote(data)) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
  }
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) return failed(response, error, '삭제');
  return data.length ? send(response, 200, { id }) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
}
