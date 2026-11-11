/* 교실 화면 공용판 — Firebase 연결 (모든 화면이 함께 씀)
 * 이 값은 공개돼도 되는 '접속 주소'입니다. 보안은 Firestore 보안 규칙이 지킵니다. */
const V = '10.12.2';
const BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
export const CONFIG = {
  apiKey: 'AIzaSyDlpLQdFJXYBvyeQQwTipLaTbOoLiS6HaU',
  authDomain: 'yclassdiary.firebaseapp.com',
  projectId: 'yclassdiary',
  storageBucket: 'yclassdiary.firebasestorage.app',
  messagingSenderId: '794968473902',
  appId: '1:794968473902:web:e66b380030fc68da273abf'
};
/* 운영자(가입 승인) 계정 — 보안 규칙에도 같은 메일이 들어 있습니다 */
export const OPERATOR = 'yjb8634@gmail.com';
export const SCHOOL = { name: '강릉제일고등학교', atpt: 'K10', code: '7801097' };

let _fb = null;
export async function fb() {
  if (_fb) return _fb;
  const [appM, authM, fsM] = await Promise.all([
    import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'), import(BASE + 'firebase-firestore.js')
  ]);
  const app = appM.initializeApp(CONFIG);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);
  _fb = { app, auth, db, A: authM, F: fsM };
  return _fb;
}
/* 기본 교시 (강릉제일고) — 선생님이 관리 화면에서 바꿀 수 있습니다 */
export const DEFAULT_PERIODS = [
  { n: '1', s: '08:40', e: '09:30' }, { n: '2', s: '09:40', e: '10:30' }, { n: '3', s: '10:40', e: '11:30' },
  { n: '4', s: '11:40', e: '12:30' }, { n: '5', s: '13:30', e: '14:20' }, { n: '6', s: '14:30', e: '15:20' },
  { n: '7', s: '15:40', e: '16:30' }
];
export const DEFAULT_SPECIALS = [
  { name: '아침 조회시간', s: '08:30', e: '08:40' }, { name: '청소시간', s: '15:20', e: '15:40' }, { name: '종례시간', s: '16:30', e: '16:40' }
];
export const DEFAULT_LUNCH = '12:30~13:30';
export function rid(n) {
  const a = new Uint8Array(n || 18); crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}
export function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
