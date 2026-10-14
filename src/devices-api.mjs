// 11단계 기기 승인 경로 공통 로직입니다. api/devices/request.js·status.js·approve.js가 씁니다.
// 로그인은 src/verify-login.mjs가 확인한 사용자 ID로만 판단하고, 기기는 그 사용자 것만 찾고 바꿉니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고 응답·로그에 넣지 않습니다. 비밀번호는 저장·기록·응답하지 않습니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { deviceIdFromJwk, DEVICE_ID, publicJwkOnly, readDeviceHeaders, verifyDevice, verifySignedRequest } from './device-auth.mjs';

const DEVICES = 'byteback_vault_devices';
const PASSWORD_MAX = 256;

let verifyLogin;
let supabase;

const send = (response, status, body) => response.status(status).json(body);
// 거부 사유는 짧은 오류 코드만 남깁니다(사용자 ID·키·서명·비밀번호는 기록하지 않음).
const deny = (response, status, code) => {
  console.warn(`devices: 거부 ${code}`);
  return send(response, status, { error: code });
};

async function authenticate(request, response, method) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== method) {
    response.setHeader('Allow', method);
    deny(response, 405, 'METHOD_NOT_ALLOWED');
    return null;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith('https://') || !key) {
    console.error('devices: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    send(response, 500, { error: 'DEVICES_NOT_CONFIGURED' });
    return null;
  }
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: key });
  } catch (error) {
    console.error('devices: 로그인 검사 설정 오류', error.message);
    send(response, 500, { error: 'LOGIN_NOT_CONFIGURED' });
    return null;
  }
  const login = await verifyLogin(request.headers?.authorization);
  if (!login) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    deny(response, 401, 'LOGIN_REQUIRED');
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

// POST /api/devices/request  본문 {deviceId, publicKeyJwk}
// 로그인(401) → 본문·공개 키(400) → deviceId = 공개 키 RFC 7638 지문 앞 16자리(400) → 그 키로 한 서명(401)
// → 같은 사용자·같은 기기가 있으면 상태를 바꾸지 않고 지금 상태, 없으면 pending으로 저장.
export async function handleDeviceRequest(request, response) {
  const login = await authenticate(request, response, 'POST');
  if (!login) return;
  const input = readJson(request);
  if (!input) return deny(response, 400, 'INVALID_JSON');
  const publicKeyJwk = publicJwkOnly(input.publicKeyJwk);
  if (!publicKeyJwk) return deny(response, 400, 'INVALID_PUBLIC_KEY');
  if (typeof input.deviceId !== 'string' || !DEVICE_ID.test(input.deviceId)
      || await deviceIdFromJwk(publicKeyJwk) !== input.deviceId) {
    return deny(response, 400, 'DEVICE_ID_MISMATCH');
  }
  const headers = readDeviceHeaders(request);
  if (!headers) return deny(response, 401, 'DEVICE_SIGNATURE_REQUIRED');
  if (headers.deviceId !== input.deviceId) return deny(response, 400, 'DEVICE_ID_MISMATCH');
  // 키를 가졌다는 증명: 본문의 공개 키로 이 요청의 서명을 확인합니다.
  const signed = await verifySignedRequest({ request, headers, publicKeyJwk, supabase });
  if (!signed.ok) return deny(response, signed.status, signed.error);
  const existing = await supabase.from(DEVICES).select('device_id, status')
    .eq('owner_id', login.userId).eq('device_id', input.deviceId).maybeSingle();
  if (existing.error) return deny(response, 502, 'DEVICES_UNAVAILABLE');
  if (existing.data) return send(response, 200, { deviceId: existing.data.device_id, status: existing.data.status });
  const { error } = await supabase.from(DEVICES).insert({
    owner_id: login.userId, device_id: input.deviceId, public_key_jwk: publicKeyJwk, status: 'pending',
  });
  if (error?.code === '23505') {
    // 같은 순간에 같은 요청이 겹친 경우: 저장된 상태를 다시 읽어 돌려줍니다.
    const again = await supabase.from(DEVICES).select('device_id, status')
      .eq('owner_id', login.userId).eq('device_id', input.deviceId).maybeSingle();
    if (again.data) return send(response, 200, { deviceId: again.data.device_id, status: again.data.status });
  }
  if (error) return deny(response, 502, 'DEVICES_UNAVAILABLE');
  return send(response, 201, { deviceId: input.deviceId, status: 'pending' });
}

// GET /api/devices/status: 로그인 + 서명. {deviceId, status, approved}
export async function handleDeviceStatus(request, response) {
  const login = await authenticate(request, response, 'GET');
  if (!login) return;
  const checked = await verifyDevice({ request, userId: login.userId, supabase });
  if (!checked.ok) return deny(response, checked.status, checked.error);
  const { deviceId, status } = checked.device;
  return send(response, 200, { deviceId, status, approved: status === 'approved' });
}

// 서버가 Supabase에서 확인한 로그인 사용자 본인의 이메일로 비밀번호를 다시 확인합니다(브라우저가 보낸 이메일은 쓰지 않음).
// 확인용 세션은 바로 그 세션만 끝냅니다(scope local). 비밀번호·이메일·토큰은 기록하지 않습니다.
async function passwordMatches(userId, password) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (error || typeof email !== 'string' || !email) return { error: 'ACCOUNT_LOOKUP_FAILED' };
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publishable) return { error: 'DEVICES_NOT_CONFIGURED' };
  const checker = createClient(process.env.SUPABASE_URL, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await checker.auth.signInWithPassword({ email, password });
  const ok = !result.error && result.data?.user?.id === userId;
  if (result.data?.session) {
    try { await checker.auth.signOut({ scope: 'local' }); } catch { /* 확인용 세션 정리 실패는 무시합니다. */ }
  }
  return { ok };
}

// POST /api/devices/approve  본문 {password}
// 로그인(401) → 심판 토큰은 비밀번호가 없어 승인 불가(403) → 서명(401/403) → 비밀번호 재확인(틀리면 401)
// → 그 사용자의 그 기기만 approved, approved_at 기록. 회수된(revoked) 기기는 다시 승인하지 않습니다(403).
export async function handleDeviceApprove(request, response) {
  const login = await authenticate(request, response, 'POST');
  if (!login) return;
  if (login.kind !== 'student') return deny(response, 403, 'APPROVAL_REQUIRES_PASSWORD');
  const checked = await verifyDevice({ request, userId: login.userId, supabase });
  if (!checked.ok) return deny(response, checked.status, checked.error);
  if (checked.device.status === 'revoked') return deny(response, 403, 'DEVICE_REVOKED');
  const input = readJson(request);
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!password || password.length > PASSWORD_MAX) return deny(response, 400, 'PASSWORD_REQUIRED');
  const verified = await passwordMatches(login.userId, password);
  if (verified.error) return deny(response, verified.error === 'DEVICES_NOT_CONFIGURED' ? 500 : 502, verified.error);
  if (!verified.ok) return deny(response, 401, 'PASSWORD_INVALID');
  const { data, error } = await supabase.from(DEVICES)
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('owner_id', login.userId).eq('device_id', checked.device.deviceId).neq('status', 'revoked')
    .select('device_id, status').maybeSingle();
  if (error) return deny(response, 502, 'DEVICES_UNAVAILABLE');
  if (!data) return deny(response, 403, 'DEVICE_NOT_REGISTERED');
  return send(response, 200, { deviceId: data.device_id, status: data.status, approved: data.status === 'approved' });
}
