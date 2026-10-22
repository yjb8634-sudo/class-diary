/* 교실 화면 보안 규칙 시험 — GitHub Actions에서 Firebase 에뮬레이터로 돌립니다.
 * 하나라도 실패하면 규칙을 게시하지 않습니다. */
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

const KEY = 'boardkeyboardkeyboard12';      // 1반 TV 키 (24자)
const KEY2 = 'otherkeyotherkeyother456';    // 다른 반 TV 키
const VKEY = 'vviewkeyviewkeyviewkey78';
let env;

const google = email => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const as = {
  op: () => env.authenticatedContext('u_op', google('yjb8634@gmail.com')).firestore(),
  t1: () => env.authenticatedContext('u_t1', google('t1@gmail.com')).firestore(),
  t2: () => env.authenticatedContext('u_t2', google('t2@gmail.com')).firestore(),
  wait: () => env.authenticatedContext('u_wait', google('wait@gmail.com')).firestore(),
  tv: () => env.unauthenticatedContext().firestore()
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-yclass',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teachers/u_op'), { email: 'yjb8634@gmail.com', name: '운영자', grade: '1', klass: '2', status: 'ok' });
    await setDoc(doc(db, 'teachers/u_t1'), { email: 't1@gmail.com', name: '김선생', grade: '1', klass: '1', status: 'ok' });
    await setDoc(doc(db, 'teachers/u_t2'), { email: 't2@gmail.com', name: '이선생', grade: '2', klass: '3', status: 'ok' });
    await setDoc(doc(db, 'teachers/u_wait'), { email: 'wait@gmail.com', name: '대기', grade: '3', klass: '1', status: 'pending' });
    await setDoc(doc(db, 'keys/u_t1'), { boardKey: KEY });
    await setDoc(doc(db, 'keys/u_t2'), { boardKey: KEY2 });
    await setDoc(doc(db, `boards/${KEY}`), { owner: 'u_t1', grade: '1', klass: '1', counselOn: true, suggestOn: true, students: [{ no: 1, name: '가' }] });
    await setDoc(doc(db, `boards/${KEY2}`), { owner: 'u_t2', grade: '2', klass: '3', counselOn: false, suggestOn: false, eventAddOn: false });
    await setDoc(doc(db, `boards/${KEY}/suggest/s1`), { text: '건의 내용', no: 0, name: '', at: new Date() });
    await setDoc(doc(db, `boards/${KEY}/counsel/2026-11-02_lunch`), { date: '2026-11-02', slot: 'lunch', no: 1, name: '가', at: new Date() });
    await setDoc(doc(db, `views/${VKEY}`), { owner: 'u_t1', grade: '1' });
  });
});

/* ---------- 선생님 명단 · 운영자 ---------- */
test('운영자는 선생님 명단을 볼 수 있고, 일반 선생님은 못 본다', async () => {
  await assertSucceeds(getDocs(collection(as.op(), 'teachers')));
  await assertFails(getDocs(collection(as.t1(), 'teachers')));
});
test('운영자는 승인 상태를 바꿀 수 있지만 다른 칸(boardKey 등)은 못 넣는다', async () => {
  await assertSucceeds(updateDoc(doc(as.op(), 'teachers/u_wait'), { status: 'ok' }));
  await assertFails(updateDoc(doc(as.op(), 'teachers/u_t1'), { boardKey: 'x'.repeat(24) }));
});
test('새 선생님은 대기(pending)로만 가입한다', async () => {
  const db = env.authenticatedContext('u_new', google('new@gmail.com')).firestore();
  await assertFails(setDoc(doc(db, 'teachers/u_new'), { email: 'new@gmail.com', name: '새선생', grade: '1', klass: '4', status: 'ok', at: 1 }));
  await assertSucceeds(setDoc(doc(db, 'teachers/u_new'), { email: 'new@gmail.com', name: '새선생', grade: '1', klass: '4', status: 'pending', at: 1 }));
});

/* ---------- TV 열쇠: 운영자도 못 봄 ---------- */
test('TV 열쇠는 본인만 읽는다 (운영자도 못 읽음)', async () => {
  await assertSucceeds(getDoc(doc(as.t1(), 'keys/u_t1')));
  await assertFails(getDoc(doc(as.op(), 'keys/u_t1')));
  await assertFails(getDoc(doc(as.t2(), 'keys/u_t1')));
  await assertFails(getDocs(collection(as.op(), 'keys')));
});

/* ---------- 반 게시판 ---------- */
test('TV(로그인 없음)는 키를 알면 게시판을 읽고, 목록은 못 본다', async () => {
  await assertSucceeds(getDoc(doc(as.tv(), `boards/${KEY}`)));
  await assertFails(getDocs(collection(as.tv(), 'boards')));
});
test('담임만 자기 게시판을 고치고, 운영자 · 다른 선생님 · 대기 중인 선생님은 못 고친다', async () => {
  await assertSucceeds(updateDoc(doc(as.t1(), `boards/${KEY}`), { notices: [] }));
  await assertFails(updateDoc(doc(as.op(), `boards/${KEY}`), { notices: [] }));
  await assertFails(updateDoc(doc(as.t2(), `boards/${KEY}`), { notices: [] }));
  await assertFails(deleteDoc(doc(as.op(), `boards/${KEY}`)));
  await assertFails(updateDoc(doc(as.tv(), `boards/${KEY}`), { notices: [] }));
});

/* ---------- 조사 응답 ---------- */
test('TV는 조사에 답할 수 있고, 형식이 틀리면 막힌다', async () => {
  await assertSucceeds(setDoc(doc(as.tv(), `boards/${KEY}/answers/sv1_3`), { sid: 'sv1', no: 3, ch: [0], etc: '', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.tv(), `boards/${KEY}/answers/sv1_4`), { sid: 'sv1', no: 3, ch: [0], etc: '', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.tv(), `boards/${KEY}/answers/sv1_5`), { sid: 'sv1', no: 5, ch: [0], etc: '', at: serverTimestamp(), extra: 1 }));
});

/* ---------- 건의함 ---------- */
test('건의는 TV가 넣고, 담임만 읽는다 (운영자 · TV는 못 읽음)', async () => {
  await assertSucceeds(addDoc(collection(as.tv(), `boards/${KEY}/suggest`), { text: '선풍기 고장', no: 0, name: '', at: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(as.t1(), `boards/${KEY}/suggest`)));
  await assertFails(getDocs(collection(as.op(), `boards/${KEY}/suggest`)));
  await assertFails(getDocs(collection(as.tv(), `boards/${KEY}/suggest`)));
});
test('건의를 받지 않는 반에는 TV가 건의를 넣을 수 없다', async () => {
  await assertFails(addDoc(collection(as.tv(), `boards/${KEY2}/suggest`), { text: '선풍기 고장', no: 0, name: '', at: serverTimestamp() }));
});

/* ---------- 상담 ---------- */
test('상담은 한 시간에 한 명만 (이미 있는 시간은 덮어쓸 수 없음)', async () => {
  await assertSucceeds(setDoc(doc(as.tv(), `boards/${KEY}/counsel/2026-11-03_after`), { date: '2026-11-03', slot: 'after', no: 2, name: '나', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.tv(), `boards/${KEY}/counsel/2026-11-02_lunch`), { date: '2026-11-02', slot: 'lunch', no: 3, name: '다', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.tv(), `boards/${KEY2}/counsel/2026-11-03_after`), { date: '2026-11-03', slot: 'after', no: 2, name: '나', at: serverTimestamp() }));
});
test('상담 취소는 담임만', async () => {
  await assertFails(deleteDoc(doc(as.tv(), `boards/${KEY}/counsel/2026-11-02_lunch`)));
  await assertFails(deleteDoc(doc(as.op(), `boards/${KEY}/counsel/2026-11-02_lunch`)));
  await assertSucceeds(deleteDoc(doc(as.t1(), `boards/${KEY}/counsel/2026-11-02_lunch`)));
});

/* ---------- 학생 일정 ---------- */
test('학생 일정은 TV가 이름 없이 올릴 수 있고, 끈 반에는 못 올린다', async () => {
  await assertSucceeds(addDoc(collection(as.tv(), `boards/${KEY}/sevents`), { date: '2026-11-13', title: '3교시 영어 단어시험', no: 0, name: '', at: serverTimestamp() }));
  await assertFails(addDoc(collection(as.tv(), `boards/${KEY2}/sevents`), { date: '2026-11-13', title: '3교시 영어 단어시험', no: 0, name: '', at: serverTimestamp() }));
  await assertFails(addDoc(collection(as.tv(), `boards/${KEY}/sevents`), { date: '2026-11-13', title: 'x'.repeat(60), no: 0, name: '', at: serverTimestamp() }));
});

/* ---------- 백업 되살리기 (담임) ---------- */
test('담임은 백업을 되살릴 때 상담 · 건의 · 일정을 다시 넣을 수 있고, 다른 선생님은 못 넣는다', async () => {
  await assertSucceeds(setDoc(doc(as.t1(), `boards/${KEY}/counsel/2026-10-01_lunch`), { date: '2026-10-01', slot: 'lunch', no: 1, name: '가', at: new Date('2026-09-30') }));
  await assertSucceeds(setDoc(doc(as.t1(), `boards/${KEY}/suggest/old1`), { text: '예전 건의', no: 0, name: '', at: new Date('2026-09-30') }));
  await assertSucceeds(setDoc(doc(as.t1(), `boards/${KEY}/sevents/old1`), { date: '2026-10-01', title: '예전 일정', no: 0, name: '', at: new Date('2026-09-30') }));
  await assertFails(setDoc(doc(as.t2(), `boards/${KEY}/counsel/2026-10-02_lunch`), { date: '2026-10-02', slot: 'lunch', no: 1, name: '가', at: new Date('2026-09-30') }));
});

/* ---------- 학생 휴대폰 보기 ---------- */
test('휴대폰 보기 사본은 주소로 읽기만, 쓰기는 담임만', async () => {
  await assertSucceeds(getDoc(doc(as.tv(), `views/${VKEY}`)));
  await assertFails(getDocs(collection(as.tv(), 'views')));
  await assertFails(setDoc(doc(as.tv(), `views/${VKEY}`), { owner: 'u_t1', grade: '2' }));
  await assertSucceeds(setDoc(doc(as.t1(), `views/${VKEY}`), { owner: 'u_t1', grade: '2' }));
  await assertFails(deleteDoc(doc(as.op(), `views/${VKEY}`)));
});

/* ---------- TV 연결 숫자 ---------- */
test('TV 연결: TV가 숫자를 만들고, 승인된 선생님만 찾아본다', async () => {
  await assertSucceeds(setDoc(doc(as.tv(), 'pair/123456'), { sid: 's'.repeat(32), at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.tv(), 'pair/012345'), { sid: 's'.repeat(32), at: serverTimestamp() }));
  await assertFails(getDoc(doc(as.tv(), 'pair/123456')));
  await assertFails(getDoc(doc(as.wait(), 'pair/123456')));
  await assertSucceeds(getDoc(doc(as.t1(), 'pair/123456')));
});
test('TV 연결 답장: 자기 반 키만 보낼 수 있다', async () => {
  const sid = 'r'.repeat(32);
  await assertSucceeds(setDoc(doc(as.t1(), `pairResp/${sid}`), { key: KEY, at: serverTimestamp() }));
  await assertFails(setDoc(doc(as.t1(), `pairResp/${'q'.repeat(32)}`), { key: KEY2, at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as.tv(), `pairResp/${sid}`)));
});

/* ---------- 그 밖 ---------- */
test('규칙에 없는 곳은 모두 막힌다', async () => {
  await assertFails(setDoc(doc(as.t1(), 'random/x'), { a: 1 }));
  await assertFails(getDoc(doc(as.op(), 'random/x')));
});
