/* 클래스 나우 — 우리 반 열쇠 (학생 정보 잠그기)
 * - 학생 명단 · 조사 답 · 건의 · 학생 호출 · 학교 양식 파일은 '우리 반 열쇠'로 잠가서 서버에 둡니다.
 * - 열쇠는 담임 선생님 기기와 연결된 교실 TV 안에만 있고, 서버(운영자 포함)는 잠긴 글자만 봅니다.
 * - 선생님 다른 기기용으로는 '열쇠 비밀번호'로 한 번 더 잠근 사본만 서버(선생님 본인만 읽는 칸)에 둡니다.
 * 모든 계산은 브라우저 표준 암호(Web Crypto: AES-256-GCM, PBKDF2-SHA256, ECDH P-256)로 합니다. */
const te = new TextEncoder(), td = new TextDecoder();
const S = () => crypto.subtle;

export function b64(u8) {
  u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) {
  const bin = atob(String(s || ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
export const ok = () => !!(window.crypto && crypto.subtle && window.TextEncoder);

/* 새 우리 반 열쇠 (32바이트, base64) */
export function newRaw() { const a = new Uint8Array(32); crypto.getRandomValues(a); return b64(a); }
/* 열쇠 지문 (열쇠가 맞는지만 확인용, 열쇠 자체는 알 수 없음) */
export async function fingerprint(raw) {
  const h = new Uint8Array(await S().digest('SHA-256', te.encode('classnow-ck:' + raw)));
  return Array.from(h.slice(0, 6), x => ('0' + x.toString(16)).slice(-2)).join('');
}
const cache = new Map();
export async function keyOf(raw) {
  if (cache.has(raw)) return cache.get(raw);
  const k = await S().importKey('raw', unb64(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  cache.set(raw, k);
  return k;
}
async function encU8(key, u8) {
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const ct = new Uint8Array(await S().encrypt({ name: 'AES-GCM', iv }, key, u8));
  return 'c1.' + b64(iv) + '.' + b64(ct);
}
async function decU8(key, s) {
  const p = String(s || '').split('.');
  if (p.length !== 3 || p[0] !== 'c1') throw new Error('잠긴 자료 형식이 아니에요');
  return new Uint8Array(await S().decrypt({ name: 'AES-GCM', iv: unb64(p[1]) }, key, unb64(p[2])));
}
/* 자료(JSON) 잠그기 · 풀기 — raw: 우리 반 열쇠(base64) */
export async function seal(raw, obj) { return encU8(await keyOf(raw), te.encode(JSON.stringify(obj))); }
export async function open(raw, s) { return JSON.parse(td.decode(await decU8(await keyOf(raw), s))); }
export const isSealed = s => typeof s === 'string' && s.slice(0, 3) === 'c1.';
/* 파일(바이트) 잠그기 · 풀기 */
export async function sealBytes(raw, u8) { return encU8(await keyOf(raw), u8); }
export async function openBytes(raw, s) { return decU8(await keyOf(raw), s); }

/* 열쇠 비밀번호로 열쇠 감싸기 (다른 기기에서 비밀번호만 넣으면 열쇠를 되찾음) */
const ITER = 250000;
async function passKey(pass, salt, iter) {
  const base = await S().importKey('raw', te.encode(String(pass)), 'PBKDF2', false, ['deriveKey']);
  return S().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function wrap(raw, pass) {
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const k = await passKey(pass, salt, ITER);
  return { s: b64(salt), i: ITER, w: await encU8(k, unb64(raw)) };
}
export async function unwrap(w, pass) {
  const k = await passKey(pass, unb64(w.s), Number(w.i) || ITER);
  try { return b64(await decU8(k, w.w)); }
  catch (e) { throw new Error('열쇠 비밀번호가 맞지 않아요.'); }
}

/* TV 연결할 때 열쇠를 안전하게 넘기기 (ECDH): TV가 공개 열쇠를 내놓고, 선생님 기기가 그걸로 잠가 보냅니다 */
const EC = { name: 'ECDH', namedCurve: 'P-256' };
export async function pairNew() {
  const kp = await S().generateKey(EC, false, ['deriveKey']);
  const pub = b64(await S().exportKey('raw', kp.publicKey));
  return { kp, pub };
}
async function shared(priv, pubB64) {
  const pub = await S().importKey('raw', unb64(pubB64), EC, false, []);
  return S().deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/* 선생님 기기: TV 공개 열쇠(tvPub)로 우리 반 열쇠를 잠가서 → { epub, ck } */
export async function pairSend(tvPub, raw) {
  const me = await S().generateKey(EC, false, ['deriveKey']);
  const k = await shared(me.privateKey, tvPub);
  return { epub: b64(await S().exportKey('raw', me.publicKey)), ck: await encU8(k, unb64(raw)) };
}
/* TV: 받은 { epub, ck } 풀기 → 우리 반 열쇠 */
export async function pairOpen(kp, epub, ck) {
  const k = await shared(kp.privateKey, epub);
  return b64(await decU8(k, ck));
}
