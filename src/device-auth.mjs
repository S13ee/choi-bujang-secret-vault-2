// 11단계: 기기 서명 확인 도구입니다.
// 브라우저는 꺼낼 수 없는(non-extractable) ECDSA P-256 개인 키를 메모리에만 두고, 요청마다 아래 헤더를 보냅니다.
//   x-aleph-device-id  : 공개 키 RFC 7638 지문(sha256)의 앞 16자리 소문자 16진수
//   x-aleph-timestamp  : 서명한 시각(밀리초)
//   x-aleph-nonce      : 요청마다 새로 만든 1회용 번호(영문·숫자·-·_ 1~128자)
//   x-aleph-signature  : 서명 문자열의 WebCrypto ECDSA SHA-256 서명(IEEE P1363, 64바이트), base64url
// 서명 문자열은 아래 7줄을 줄바꿈(\n)으로 이은 것입니다(마지막 줄바꿈 없음).
//   aleph-device-v1 / 메서드(대문자) / 경로(쿼리 포함, request.url 그대로) / timestamp / nonce / deviceId / 본문 해시
// 본문 해시는 본문을 키 이름 순서로 정렬한 JSON(canonical JSON)의 sha256 소문자 16진수이고, 본문이 없으면 빈 문자열의 sha256입니다.
// 이 파일 위쪽의 순수 함수(canonicalJson·bodySha256·signingString·deviceIdFromJwk 등)는 Node 전용 기능 없이
// 표준 WebCrypto(globalThis.crypto.subtle)만 쓰므로 브라우저에서도 같은 규칙으로 쓸 수 있습니다.
// 개인 키·서명 원문·비밀번호는 저장하거나 기록하지 않습니다.

export const SIGNATURE_VERSION = 'aleph-device-v1';
export const MAX_CLOCK_SKEW_MS = 60_000;
export const DEVICE_ID = /^[0-9a-f]{16}$/u;
const NONCE = /^[A-Za-z0-9_-]{1,128}$/u;
const B64URL = /^[A-Za-z0-9_-]+$/u;
const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();

// 키 이름을 정렬한 JSON. 배열 순서는 그대로 두고, undefined인 칸은 JSON.stringify처럼 뺍니다.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export async function sha256Hex(text) {
  const digest = await subtle().digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// 본문이 없으면(undefined·null·빈 문자열) 빈 문자열의 sha256. 문자열 본문은 JSON이면 객체로 바꿔 canonical JSON으로 셉니다.
export async function bodySha256(body) {
  if (body === undefined || body === null || body === '') return sha256Hex('');
  let value = body;
  if (typeof body === 'string') {
    try { value = JSON.parse(body); } catch { return sha256Hex(body); }
  }
  return sha256Hex(canonicalJson(value));
}

export function signingString({ method, url, timestamp, nonce, deviceId, bodyHash }) {
  return [SIGNATURE_VERSION, String(method).toUpperCase(), url, String(timestamp), nonce, deviceId, bodyHash].join('\n');
}

// 공개 키는 kty EC, crv P-256, x, y 네 칸만 받습니다. 개인 키 칸(d 등)이나 다른 칸이 있으면 null.
export function publicJwkOnly(jwk) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) return null;
  const keys = Object.keys(jwk).sort().join(',');
  if (keys !== 'crv,kty,x,y' || jwk.kty !== 'EC' || jwk.crv !== 'P-256'
      || typeof jwk.x !== 'string' || typeof jwk.y !== 'string'
      || !B64URL.test(jwk.x) || !B64URL.test(jwk.y) || jwk.x.length !== 43 || jwk.y.length !== 43) return null;
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

// RFC 7638 지문: 필수 칸(crv·kty·x·y)을 이름 순서로, 공백 없이 이은 JSON의 sha256. 그 16진수 앞 16자리가 deviceId입니다.
export async function deviceIdFromJwk(jwk) {
  const key = publicJwkOnly(jwk);
  if (!key) return null;
  const thumbprintInput = `{"crv":"${key.crv}","kty":"${key.kty}","x":"${key.x}","y":"${key.y}"}`;
  return (await sha256Hex(thumbprintInput)).slice(0, 16);
}

function base64urlToBytes(text) {
  if (typeof text !== 'string' || !B64URL.test(text)) return null;
  const base64 = text.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function verifySignature(jwk, signatureB64url, message) {
  const key = publicJwkOnly(jwk);
  const signature = base64urlToBytes(signatureB64url);
  if (!key || !signature || signature.length !== 64) return false;
  try {
    const publicKey = await subtle().importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, encoder.encode(message));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// 아래는 서버에서만 씁니다. supabase는 서버 전용 키로 만든 클라이언트를 호출하는 쪽에서 넘깁니다.
// ---------------------------------------------------------------------------------------------

const DEVICES = 'byteback_vault_devices';
const NONCES = 'byteback_vault_device_nonces';
const fail = (status, error) => ({ ok: false, status, error });

export function readDeviceHeaders(request) {
  const headers = request?.headers ?? {};
  const pick = name => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
  };
  const values = {
    deviceId: pick('x-aleph-device-id'),
    timestamp: pick('x-aleph-timestamp'),
    nonce: pick('x-aleph-nonce'),
    signature: pick('x-aleph-signature'),
  };
  return Object.values(values).every(Boolean) ? values : null;
}

// Vercel은 대괄호 경로(api/devices/[action].js, api/notes/[id]…)를 부를 때 경로 값을 request.url 쿼리로
// 덧붙일 수 있습니다(예: /api/devices/request?action=request). 서명 경로에서는 그렇게 덧붙은 항목만 뺍니다:
// 이름이 그 경로의 대괄호 칸(action·id)이고, 디코딩한 값이 경로의 그 칸(디코딩한 값)과 정확히 같은 항목(뒤쪽 하나).
// 그 밖의 쿼리는 원래 순서·표기 그대로 남기므로, 쿼리를 덧붙이거나 경로를 바꾼 요청은 계속 서명이 맞지 않습니다.
const DYNAMIC_ROUTES = [
  ['api', 'devices', ':action'],
  ['api', 'notes', ':id'],
  ['api', 'notes', ':id', 'restore'],
  ['api', 'notices', ':id'],
  ['api', 'admin', 'notices', ':id'],
];
const decode = text => {
  try { return decodeURIComponent(text.replace(/\+/gu, ' ')); } catch { return null; }
};

export function signedPath(url) {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const path = url.slice(0, at);
  const segments = path.split('/').slice(1).map(segment => {
    try { return decodeURIComponent(segment); } catch { return null; }
  });
  const route = DYNAMIC_ROUTES.find(parts => parts.length === segments.length
    && parts.every((part, index) => part.startsWith(':') || part === segments[index]));
  const params = route ? Object.fromEntries(route.flatMap((part, index) => (part.startsWith(':') ? [[part.slice(1), segments[index]]] : []))) : {};
  const items = url.slice(at + 1).split('&');
  for (const [name, value] of Object.entries(params)) {
    if (value === null) continue;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const [rawName, ...rest] = items[index].split('=');
      if (decode(rawName) === name && decode(rest.join('=')) === value) { items.splice(index, 1); break; }
    }
  }
  // 덧붙은 항목을 빼고 남은 것이 없으면 경로만, 있으면 원래 순서대로 "?"와 함께 붙입니다.
  return items.length === 0 ? path : `${path}?${items.join('&')}`;
}

// 시각·서명·1회용 번호를 차례로 확인합니다. 공개 키는 호출하는 쪽이 넘깁니다(DB의 키 또는 등록 요청 본문의 키).
export async function verifySignedRequest({ request, headers, publicKeyJwk, supabase, now = Date.now() }) {
  const timestamp = /^\d{1,16}$/u.test(headers.timestamp) ? Number(headers.timestamp) : NaN;
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    return fail(401, 'DEVICE_SIGNATURE_EXPIRED');
  }
  if (!NONCE.test(headers.nonce) || !DEVICE_ID.test(headers.deviceId)) return fail(401, 'DEVICE_SIGNATURE_INVALID');
  const rawUrl = typeof request.url === 'string' ? request.url : '';
  const path = signedPath(rawUrl);
  const message = signingString({
    method: request.method, url: path,
    timestamp: headers.timestamp, nonce: headers.nonce, deviceId: headers.deviceId,
    bodyHash: await bodySha256(request.body),
  });
  if (!await verifySignature(publicKeyJwk, headers.signature, message)) {
    // 서명이 틀렸을 때만 메서드·요청 주소 원문·서명에 쓴 경로를 한 줄 남깁니다(헤더·토큰·서명 값·본문은 남기지 않음).
    console.warn(`[sig11] ${JSON.stringify({ method: request.method, url: rawUrl.slice(0, 300), signedPath: path.slice(0, 300) })}`);
    return fail(401, 'DEVICE_SIGNATURE_INVALID');
  }
  const { error } = await supabase.from(NONCES).insert({ device_id: headers.deviceId, nonce: headers.nonce });
  if (error?.code === '23505') return fail(401, 'DEVICE_NONCE_REUSED');
  if (error) return fail(502, 'DEVICES_UNAVAILABLE');
  return { ok: true };
}

// 등록된 기기의 서명 확인: 헤더(401) → 로그인 사용자의 그 기기(403) → 시각(401) → 서명(401) → 1회용 번호(401).
// 승인 여부(pending/approved/revoked)는 결과로만 돌려주고, 허용 판단은 호출하는 쪽에서 합니다.
export async function verifyDevice({ request, userId, supabase, now = Date.now() }) {
  const headers = readDeviceHeaders(request);
  if (!headers) return fail(401, 'DEVICE_SIGNATURE_REQUIRED');
  const { data, error } = await supabase.from(DEVICES).select('device_id, status, public_key_jwk')
    .eq('owner_id', userId).eq('device_id', headers.deviceId).maybeSingle();
  if (error) return fail(502, 'DEVICES_UNAVAILABLE');
  if (!data) return fail(403, 'DEVICE_NOT_REGISTERED');
  const checked = await verifySignedRequest({ request, headers, publicKeyJwk: data.public_key_jwk, supabase, now });
  if (!checked.ok) return checked;
  return { ok: true, device: { deviceId: data.device_id, status: data.status } };
}

// 11단계 보호 경로용: 서명 확인(verifyDevice)을 통과하고 기기 상태가 approved일 때만 ok.
// 등록됐지만 승인 전(pending)이거나 회수된(revoked) 기기는 403 DEVICE_NOT_APPROVED입니다. 학생·심판 토큰 모두 같습니다.
export async function requireApprovedDevice({ request, userId, supabase, now = Date.now() }) {
  const checked = await verifyDevice({ request, userId, supabase, now });
  if (!checked.ok) return checked;
  if (checked.device.status !== 'approved') return fail(403, 'DEVICE_NOT_APPROVED');
  return checked;
}
