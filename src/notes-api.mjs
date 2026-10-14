// 가상 메모 API 공통 로직입니다. api/notes/index.js, api/notes/[id]/index.js, api/notes/[id]/restore.js가 씁니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다.
// 로그인 여부는 src/verify-login.mjs가 확인한 사용자 ID로만 판단합니다.
// 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다.
// 4단계: 목록·한 건 조회·수정·삭제는 owner_id가 검증된 사용자 ID와 같은 행만 다루고,
// 추가할 때는 검증된 사용자 ID를 owner_id로 저장합니다.
// 10단계: 추가(POST)가 성공하면 그 내용을 사본 테이블에 저장하고 감사 기록에 create를 남깁니다.
// 수정(PUT)·삭제(DELETE)는 사본을 바꾸지 않고 감사 기록에 update·delete와 전후 지문만 남깁니다.
// 복구(POST /api/notes/:id/restore)는 사본에서만 내용을 가져와 그 ID 한 건만 되돌립니다.
// 감사 기록에는 메모 본문을 넣지 않습니다. 사본은 처음 만들 때의 내용이며 이후 수정은 반영되지 않습니다.
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const TABLE = 'byteback_vault_notes';
const BACKUPS = 'byteback_vault_note_backups';
const AUDIT = 'byteback_vault_audit';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;

let verifyLogin;
let supabase;

const send = (response, status, body) => response.status(status).json(body);
const toNote = row => ({ id: row.id, title: row.title, body: row.content });
// content를 UTF-8 바이트로 바꾼 SHA-256(소문자 16진수). SQL의 encode(sha256(convert_to(content,'UTF8')),'hex')와 같습니다.
const contentSha256 = content => createHash('sha256').update(content, 'utf8').digest('hex');

// 감사 기록은 행위자·동작·메모 ID·전후 지문만 남깁니다. 실패해도 요청 결과는 바꾸지 않고 오류 코드만 기록합니다.
async function audit(actorId, action, noteId, before, after) {
  const { error } = await supabase.from(AUDIT).insert({
    actor_id: actorId, action, note_id: noteId, before_sha256: before ?? null, after_sha256: after ?? null,
  });
  if (error) console.error(`notes: 감사 기록(${action}) 실패`, error?.code ?? 'unknown');
}

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
  // 10단계: 사본이 이미 있는 ID(지워진 메모 포함)는 다시 쓰지 않습니다. 남의 사본과 ID가 겹치는 것을 막습니다.
  const existing = await supabase.from(BACKUPS).select('note_id').eq('note_id', id).maybeSingle();
  if (existing.error) return failed(response, existing.error, '사본 확인');
  if (existing.data) return send(response, 409, { error: 'ID_ALREADY_EXISTS' });
  const { error } = await supabase.from(TABLE).insert({
    id, owner_id: login.userId, sample_marker: config.sampleMarker,
    title: fields.title, content: fields.body,
  });
  if (error?.code === '23505') return send(response, 409, { error: 'ID_ALREADY_EXISTS' });
  if (error) return failed(response, error, '추가');
  const sha = contentSha256(fields.body);
  const backup = await supabase.from(BACKUPS).insert({
    note_id: id, owner_id: login.userId, title: fields.title, content: fields.body, content_sha256: sha,
  });
  if (backup.error) {
    // 사본 없이 메모만 남지 않도록 방금 넣은 메모를 되돌립니다.
    await supabase.from(TABLE).delete().eq('id', id).eq('owner_id', login.userId);
    return failed(response, backup.error, '사본 저장');
  }
  await audit(login.userId, 'create', id, null, sha);
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
    // 10단계: 감사 기록의 수정 전 지문을 위해 본인 행의 현재 내용을 먼저 읽습니다. 사본은 바꾸지 않습니다.
    const before = await supabase.from(TABLE).select('content')
      .eq('id', id).eq('owner_id', login.userId).maybeSingle();
    if (before.error) return failed(response, before.error, '수정 전 조회');
    if (!before.data) return notFound();
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
    await audit(login.userId, 'update', id, contentSha256(before.data.content), contentSha256(data.content));
    return send(response, 200, toNote(data));
  }
  const { data, error } = await supabase.from(TABLE).delete()
    .eq('id', id).eq('owner_id', login.userId).select('id, content');
  if (error) return failed(response, error, '삭제');
  if (!data.length) return notFound();
  // 10단계: 사본은 그대로 두고 감사 기록에 삭제 전 지문만 남깁니다.
  await audit(login.userId, 'delete', id, contentSha256(data[0].content), null);
  return send(response, 200, { id });
}

// POST /api/notes/:id/restore (서비스 notes)
// 순서: 로그인 검사(401) → 사본 조회(없으면 404) → 사본 owner_id = 검증된 사용자(다르면 404)
//   → 사본 본문 SHA-256 재계산 = content_sha256(다르면 409, 아무것도 바꾸지 않음)
//   → 메모 테이블의 그 ID 한 건만 사본의 owner_id·title·content로 되돌림(삭제됐으면 다시 넣고, 변조됐으면 덮어씀)
//   → 감사 기록에 restore. 다른 메모·사본·감사 기록은 지우거나 바꾸지 않습니다.
// 요청 본문·쿼리·헤더의 owner_id·role·내용은 읽지 않고, 복구할 내용은 사본에서만 가져옵니다.
export async function handleRestore(request, response) {
  const login = await authenticate(request, response, ['POST']);
  if (!login) return;
  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const noteId = id.toLowerCase();
  const notFound = () => send(response, 404, { error: 'BACKUP_NOT_FOUND' });
  const backup = await supabase.from(BACKUPS).select('note_id, owner_id, title, content, content_sha256')
    .eq('note_id', noteId).maybeSingle();
  if (backup.error) return failed(response, backup.error, '사본 조회');
  if (!backup.data || backup.data.owner_id !== login.userId) return notFound();
  const saved = backup.data;
  if (typeof saved.content !== 'string' || contentSha256(saved.content) !== saved.content_sha256) {
    console.error('notes: 복구 거부 BACKUP_INTEGRITY_FAILED');
    return send(response, 409, { error: 'BACKUP_INTEGRITY_FAILED' });
  }
  const current = await supabase.from(TABLE).select('id, owner_id, content').eq('id', noteId).maybeSingle();
  if (current.error) return failed(response, current.error, '복구 전 조회');
  if (current.data && current.data.owner_id !== saved.owner_id) {
    // 같은 ID에 다른 소유자의 메모가 있으면 덮어쓰지 않습니다.
    console.error('notes: 복구 거부 RESTORE_CONFLICT');
    return send(response, 409, { error: 'RESTORE_CONFLICT' });
  }
  const result = current.data
    ? await supabase.from(TABLE).update({ title: saved.title, content: saved.content })
      .eq('id', noteId).eq('owner_id', saved.owner_id).select('id, title, content, owner_id').maybeSingle()
    : await supabase.from(TABLE).insert({ id: noteId, owner_id: saved.owner_id, sample_marker: config.sampleMarker,
      title: saved.title, content: saved.content }).select('id, title, content, owner_id').maybeSingle();
  if (result.error) return failed(response, result.error, '복구');
  if (!result.data || result.data.owner_id !== login.userId
      || contentSha256(result.data.content) !== saved.content_sha256) {
    console.error('notes: 복구 결과 확인 실패');
    return send(response, 500, { error: 'RESTORE_CHECK_FAILED' });
  }
  await audit(login.userId, 'restore', noteId,
    current.data ? contentSha256(current.data.content) : null, saved.content_sha256);
  return send(response, 200, toNote(result.data));
}
