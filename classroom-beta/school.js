/* 클래스 나우 — 우리 학교 자료 (구글 드라이브판, 어느 학교든)
 * 급식 · 학사일정 · 우리 반 시간표를 '나이스 교육정보 개방 포털'에서 이 기기(관리 화면 · 교실 TV)가 바로 받습니다.
 * 날씨 위치는 학교 주소의 시 · 군 · 구로 찾습니다(Open-Meteo). 제작자 서버는 거치지 않습니다.
 * - 클래스 나우 공용 인증키로 받습니다(선생님이 따로 넣을 필요 없음). 선생님 본인 키를 넣으면 그 키를 씁니다.
 * - 인증키가 막히면 키 없이(한 번에 5줄, 시간표 5교시까지) 하루씩 나눠 받습니다.
 * - 받은 자료는 이 기기에 6시간 동안 보관했다가 다시 받습니다. */

export const HOME_CODE = '7801097';          /* 강릉제일고: 깃허브가 받아 두는 컴시간 · 나이스 자료(data/)를 그대로 씀 */
export const isHome = s => !s || !s.code || s.code === HOME_CODE;
const NEIS = 'https://open.neis.go.kr/hub/';
/* 클래스 나우 드라이브판 공용 나이스 인증키 (자료 열람용, 개인정보 없음) */
const AK = 'd1c99ca65a13bccb1c04c831d5d18168';
const appKey = () => AK.split('').reverse().join('');
const TT_SVC = { '고등학교': 'hisTimetable', '중학교': 'misTimetable', '초등학교': 'elsTimetable', '특수학교': 'spsTimetable' };
const GRADE_YN = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];

async function neis(svc, params, key) {
  const q = new URLSearchParams(Object.assign({ Type: 'json', pIndex: '1', pSize: key ? '1000' : '5' }, params));
  if (key) q.set('KEY', key);
  const r = await fetch(NEIS + svc + '?' + q);
  if (!r.ok) throw new Error('나이스 응답 오류 (' + r.status + ')');
  const j = await r.json();
  if (j[svc] && j[svc][1] && j[svc][1].row) return j[svc][1].row;
  const code = (j.RESULT && j.RESULT.CODE) || '';
  if (code === 'INFO-200') return [];         /* 자료 없음 (방학 · 주말 등) */
  const e = new Error((j.RESULT && j.RESULT.MESSAGE) || code || '나이스 오류'); e.code = code; throw e;
}

/* 학교 찾기 (인증키가 없으면 5곳까지) */
export async function searchSchool(name, key) {
  const q = { SCHUL_NM: String(name || '').trim() };
  const rows = await neis('schoolInfo', q, key || appKey()).catch(() => neis('schoolInfo', q, ''));
  return rows.map(x => ({
    name: x.SCHUL_NM, atpt: x.ATPT_OFCDC_SC_CODE, code: x.SD_SCHUL_CODE,
    kind: x.SCHUL_KND_SC_NM || '', addr: x.ORG_RDNMA || '', office: x.ATPT_OFCDC_SC_NM || ''
  }));
}

/* 학교 주소 → 날씨 위치 */
export async function geocode(addr) {
  const t = String(addr || '').split(/\s+/).filter(Boolean);
  const strip = w => w.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구|도)$/, '');
  const cands = [];
  t.slice(1, 3).forEach(w => { if (/(시|군|구)$/.test(w)) cands.push(w, strip(w)); });
  if (t[0]) cands.push(strip(t[0]));
  for (const c of cands) {
    if (!c) continue;
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=ko&countryCode=KR&name=' + encodeURIComponent(c));
      const j = await r.json();
      const h = (j.results || []).find(x => x.country_code === 'KR');
      if (h) return { lat: Math.round(h.latitude * 1e4) / 1e4, lon: Math.round(h.longitude * 1e4) / 1e4, place: strip(c) || c };
    } catch (e) {}
  }
  return null;
}

/* 고른 학교를 저장할 모양으로 (날씨 위치 포함) */
export async function schoolPick(s) {
  const o = { name: s.name, atpt: s.atpt, code: s.code, kind: s.kind || '', addr: s.addr || '' };
  const g = await geocode(s.addr).catch(() => null);
  if (g) Object.assign(o, g);
  return o;
}

/* ---- 날짜 (한국 시각) ---- */
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd8 = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const iso = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const weekday = d => { const w = d.getUTCDay(); return w !== 0 && w !== 6; };

/* 몇 개씩만 동시에 */
async function pool(jobs, n) {
  const out = new Array(jobs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const k = i++; try { out[k] = await jobs[k](); } catch (e) { out[k] = e; } }
  }));
  return out;
}

/* 급식 · 학사일정 · 우리 반 시간표 → data/school.json 과 같은 모양 */
export async function schoolData(sc, grade, klass) {
  const own = String(sc.key || '').trim();
  try { return await schoolData1(sc, grade, klass, own || appKey()); }
  catch (e) { return schoolData1(sc, grade, klass, ''); }   /* 인증키가 막혔을 때: 키 없이 */
}
async function schoolData1(sc, grade, klass, key) {
  const base = { ATPT_OFCDC_SC_CODE: sc.atpt, SD_SCHUL_CODE: sc.code };
  const today = kst(), notes = [];
  const g = String(grade || ''), k = String(klass || '');
  const ttSvc = TT_SVC[sc.kind] || 'hisTimetable';
  const mon = addDays(today, -((today.getUTCDay() + 6) % 7));

  async function range(svc, fk, tk, from, to, extra, days) {
    if (key) return neis(svc, Object.assign({}, base, extra, { [fk]: ymd8(from), [tk]: ymd8(to) }), key);
    const ds = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (!days || days(d)) ds.push(d);
    const res = await pool(ds.map(d => () => neis(svc, Object.assign({}, base, extra, { [fk]: ymd8(d), [tk]: ymd8(d) }))), 4);
    const all = [];
    res.forEach(x => { if (Array.isArray(x)) all.push(...x); else if (x) notes.push(svc + ': ' + x.message); });
    if (res.length && res.every(x => !Array.isArray(x))) throw res[0];
    return all;
  }
  const [mealRows, ttRows, evRows] = await pool([
    () => range('mealServiceDietInfo', 'MLSV_FROM_YMD', 'MLSV_TO_YMD', today, addDays(today, 9), {}, weekday),
    () => g && k ? range(ttSvc, 'TI_FROM_YMD', 'TI_TO_YMD', mon, addDays(mon, 11), { GRADE: g, CLASS_NM: k }, weekday) : [],
    () => key ? range('SchoolSchedule', 'AA_FROM_YMD', 'AA_TO_YMD', addDays(today, -7), addDays(today, 90), {})
      : range('SchoolSchedule', 'AA_FROM_YMD', 'AA_TO_YMD', today, addDays(today, 27), {}, weekday)
  ], 3);
  const ok = x => Array.isArray(x);
  if (!ok(mealRows) && !ok(ttRows) && !ok(evRows)) throw (mealRows instanceof Error ? mealRows : new Error('나이스에서 받지 못했어요'));

  const meals = {};
  (ok(mealRows) ? mealRows : []).forEach(x => {
    const d = iso(x.MLSV_YMD);
    (meals[d] = meals[d] || []).push({
      kind: x.MMEAL_SC_NM || '', cal: x.CAL_INFO || '',
      dishes: String(x.DDISH_NM || '').split(/<br\s*\/?>/i)
        .map(s => s.replace(/\([0-9.\s]*\)/g, '').replace(/[0-9.]+$/, '').replace(/[*#]/g, '').trim()).filter(Boolean)
    });
  });
  const tt = {};
  (ok(ttRows) ? ttRows : []).forEach(x => {
    const d = iso(x.ALL_TI_YMD);
    (tt[d] = tt[d] || []).push({ p: Number(x.PERIO), s: String(x.ITRT_CNTNT || '').replace(/^-+/, '').trim() });
  });
  Object.values(tt).forEach(a => a.sort((p, q) => p.p - q.p));
  const events = (ok(evRows) ? evRows : []).filter(x => x.EVENT_NM && x.EVENT_NM !== '토요휴업일')
    .map(x => ({ date: iso(x.AA_YMD), name: x.EVENT_NM,
      g: GRADE_YN.map((p, i) => String(x[p + '_GRADE_EVENT_YN'] || '') === 'Y' ? String(i + 1) : '').join('') }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    updated: today.toISOString().slice(0, 16).replace('T', ' '),
    school: { name: sc.name, atpt: sc.atpt, code: sc.code, grade: g, cls: k },
    partial: !key,       /* 인증키 없음: 시간표 5교시까지 */
    meals, events, timetable: g && k ? { [g + '-' + k]: tt } : {}, notes
  };
}

/* 이 기기에 6시간 보관 */
export async function cachedData(sc, grade, klass, force) {
  const id = 'cn_sch_' + sc.code + '_' + grade + '-' + klass + (sc.key ? '_k' : '');
  if (!force) {
    try { const c = JSON.parse(localStorage.getItem(id) || 'null'); if (c && Date.now() - c.at < 6 * 3600e3 && c.d) return c.d; } catch (e) {}
  }
  try {
    const d = await schoolData(sc, grade, klass);
    try { localStorage.setItem(id, JSON.stringify({ at: Date.now(), d })); } catch (e) {}
    return d;
  } catch (e) {
    try { const c = JSON.parse(localStorage.getItem(id) || 'null'); if (c && c.d) return c.d; } catch (e2) {}
    throw e;
  }
}
