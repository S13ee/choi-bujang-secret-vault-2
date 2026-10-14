// 11단계: 브라우저 기기 서명 도구입니다. 서버 src/device-auth.mjs와 같은 규칙을 씁니다.
// 개인 키는 꺼낼 수 없는(extractable false) ECDSA P-256 키로 만들어 자바스크립트 변수에만 둡니다.
// 키·토큰·자료를 localStorage·sessionStorage·IndexedDB·쿠키·서비스 워커·캐시에 넣지 않습니다.
// 서명 문자열: aleph-device-v1 / 메서드(대문자) / 경로(쿼리 포함, fetch에 넣는 문자열 그대로) / timestamp / nonce / deviceId / 본문 해시
// 본문 해시: 본문의 canonical JSON(키 이름 정렬)의 sha256 소문자 16진수, 본문이 없으면 빈 문자열의 sha256.

export const SIGNATURE_VERSION = 'aleph-device-v1';
const encoder = new TextEncoder();

// --- 아래 네 함수는 src/device-auth.mjs의 같은 이름 함수와 같은 결과를 내야 합니다. ---

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

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

export async function deviceIdFromJwk(jwk) {
  const thumbprintInput = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  return (await sha256Hex(thumbprintInput)).slice(0, 16);
}

// --- 브라우저 전용 ---

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

// 새 기기 키. 개인 키는 꺼낼 수 없고, 공개 키는 kty·crv·x·y 네 칸만 남깁니다(ext·key_ops 뺌).
export async function createDeviceKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicKeyJwk = { kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y };
  return { privateKey: pair.privateKey, publicKeyJwk, deviceId: await deviceIdFromJwk(publicKeyJwk) };
}

// 요청 하나의 서명 헤더와 보낼 본문. 본문이 있으면 canonical JSON 문자열을 그대로 보냅니다.
export async function signRequest(device, { method, url, body }) {
  const timestamp = Date.now();
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const message = signingString({ method, url, timestamp, nonce, deviceId: device.deviceId, bodyHash: await bodySha256(body) });
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.privateKey, encoder.encode(message));
  return {
    headers: {
      'x-aleph-device-id': device.deviceId,
      'x-aleph-timestamp': String(timestamp),
      'x-aleph-nonce': nonce,
      'x-aleph-signature': base64url(signature),
    },
    bodyText: body === undefined ? undefined : canonicalJson(body),
  };
}
