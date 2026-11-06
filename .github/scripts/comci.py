# 컴시간 학생용 화면(http://comci.net:4082/st)과 똑같은 방식으로 시간표를 받아 data/comci.json 으로 저장합니다.
# 2026년 11월 컴시간이 주소 · 자료 형식을 바꾸고(암호화) 기존 도구(comci 0.7.0)가 더는 동작하지 않아 직접 받습니다.
# 주소 번호 · 자료 이름은 컴시간 화면의 스크립트에서 매번 읽어 오므로, 컴시간이 번호만 바꾸는 경우엔 그대로 동작합니다.
import base64, hashlib, hmac, json, os, re, sys, time, traceback
from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

KST = timezone(timedelta(hours=9))
BASE = 'http://comci.net:4082'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
S = requests.Session()
S.headers.update({'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5', 'Referer': BASE + '/st'})
notes = []


def note(msg):
    notes.append(msg)
    print('::notice title=컴시간::' + msg.replace('%', '%25').replace('\n', '%0A'), flush=True)


def get(url, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, timeout=20)
            r.raise_for_status()
            return r
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(3 + i * 4)


# ---------- 1) 학생용 화면에서 주소 · 열쇠 · 자료 이름 읽기 ----------
def deobfuscate(html):
    """'/* hour-obfuscated-v2 */' 스크립트를 화면과 같은 방법으로 풀어 줍니다."""
    out = []
    for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S):
        body = m.group(1)
        if 'obfuscated' not in body:
            continue
        mm = re.search(r'\}\)\((\[\[.*\]\])\s*,\s*(\d+)\)\s*;?\s*$', body.strip(), re.S)
        if not mm:
            continue
        arr, k = json.loads(mm.group(1)), int(mm.group(2))
        s = []
        for flag, chunk in arr:
            if flag:
                s.append(chunk)
                continue
            for j in range(0, len(chunk), 4):
                s.append(chr(int(chunk[j:j + 4], 16) ^ ((k + (j // 4) * 13) & 255)))
        out.append(''.join(s))
    # 가려지지 않은 스크립트도 함께 (형식이 또 바뀌는 경우 대비)
    out.append(html)
    return '\n'.join(out)


def learn():
    r = get(BASE + '/st')
    html = r.content.decode('euc-kr', 'replace')
    js = deobfuscate(html)

    def pick(pat, default, name):
        m = re.search(pat, js)
        if m:
            return m.group(1)
        note(f'화면에서 {name}을(를) 못 찾아 예전 값({default})을 씁니다.')
        return default

    cfg = {
        'route': pick(r"function sc_data\(.*?'\./(\d+)\?'", '289153', '시간표 주소'),
        'search': pick(r"url:'\./\d+\?(\w+)'\+sc\+'_enc2'", '31487l', '학교 찾기 주소'),
        'prefix': pick(r"sc_data\('(\d+_)'", '60392_', '시간표 앞글자'),
        'key': pick(r"enc\.Hex\.parse\('([0-9a-f]{64})'\)", '6f428ea903c751d0b82f649d1e703ac5d4892fb601e8c347a5d09b2cf316784e', '열쇠'),
        'orig': pick(r'원자료=Q자료\(자료\.(\w+)\[학년\]', '자료166', '원래 시간표 이름'),
        'daily': pick(r'일일자료=Q자료\(자료\.(\w+)\[학년\]', '자료174', '오늘 시간표 이름'),
        'teacher': pick(r'Q성명\(자료\.(\w+)\[th\]\)', '자료191', '선생님 이름표'),
        'subject': pick(r'Q과목명\(자료\.(\w+)\[sb\]\)', '자료102', '과목 이름표'),
    }
    sm = re.search(r"url:'\./(\d+)\?\w+'\+sc\+'_enc2'", js)
    cfg['search_route'] = sm.group(1) if sm else cfg['route']
    return cfg


# ---------- 2) 암호 풀기 (화면의 시간표자료_복호화 와 같음) ----------
def decrypt(text, key_hex):
    text = text.rstrip('\x00').strip()
    if not (text.startswith('enc1:') or text.startswith('enc2:')):
        return text
    parts = text.split(':')
    if len(parts) != 4:
        raise ValueError('암호 자료 형식이 달라요')
    dec = (lambda s: base64.b64decode(s)) if parts[0] == 'enc2' else bytes.fromhex
    enc = (lambda b: base64.b64encode(b).decode()) if parts[0] == 'enc2' else (lambda b: b.hex())
    key = bytes.fromhex(key_hex)
    iv, ct = dec(parts[1]), dec(parts[2])
    tag = enc(hmac.new(hashlib.sha256(key).digest(), ':'.join(parts[:3]).encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(tag, parts[3]):
        raise ValueError('암호 자료 확인(서명)이 맞지 않아요')
    d = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    raw = d.update(ct) + d.finalize()
    raw = raw[:-raw[-1]] if raw and 1 <= raw[-1] <= 16 else raw
    return raw.decode('utf-8', 'replace').rstrip('\x00')


def search(cfg, name):
    q = quote(name.encode('euc-kr'))
    t = decrypt(get(f"{BASE}/{cfg['search_route']}?{cfg['search']}{q}_enc2").text, cfg['key'])
    rows = json.loads(t).get('학교검색') or []
    out = []
    for row in rows:
        try:
            idx = int(row[0]) // 6347 + 2   # 화면과 같은 방법으로 학교 번호 칸 고르기
            out.append({'region': row[1], 'name': row[2], 'code': int(row[idx])})
        except Exception:
            pass
    return out


def fetch(cfg, code, r):
    arg = base64.b64encode(f"{cfg['prefix']}{code}_0_{r}_enc2".encode()).decode()
    t = decrypt(get(f"{BASE}/{cfg['route']}?{arg}").text, cfg['key'])
    if '}' not in t:
        raise ValueError('시간표 자료가 비어 있어요')
    return json.loads(t[:t.rfind('}') + 1])


# ---------- 3) 시간표 칸 읽기 (화면의 baSplit / 자료149 와 같음) ----------
def split3(v):
    s = re.sub(r'\D', '', str(v))
    if not s:
        return [0, 0, 0]
    g = []
    while s:
        g.append(int(s[-3:]))
        s = s[:-3]
    return g + [0, 0]


def cell(D, cfg, g, c, wd, p):
    def at(key):
        try:
            v = D[key][g][c][wd][p]
            return 0 if v is None else v
        except (KeyError, IndexError, TypeError):
            return 0
    orig, daily = at(cfg['orig']), at(cfg['daily'])
    changed = False
    sdaily = str(daily)
    if D.get('변경알림') == 1:
        if sdaily.startswith('>'):
            changed = True
            sdaily = sdaily[1:]
    else:
        changed = orig != daily
    ma = split3(sdaily)
    th, sb = ma[0], ma[1] + ma[2] * 1000
    if th <= 0:
        return None
    div = D.get('분리') or 100
    sb = sb % div
    subj = ((D.get(cfg['subject']) or [])[sb:sb + 1] or [''])[0] or ''
    tname = ((D.get(cfg['teacher']) or [])[th:th + 1] or [''])[0] or ''
    if not str(subj).strip():
        return None
    x = {'p': p, 's': str(subj).strip()}
    if str(tname).strip():
        x['t'] = str(tname).strip()
    if changed:
        x['c'] = 1
    return x


def parse_day(s):
    s = str(s or '').strip()[:10]
    for fmt in ('%Y-%m-%d', '%y-%m-%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def week_of(D, cfg):
    """받은 자료 → {'1-2': {'2026-11-02': [...]}} (그 주 월~금)"""
    start = parse_day(D.get('시작일'))
    if not start:
        raise ValueError('시작일이 없어요: ' + str(D.get('시작일')))
    limit = parse_day(D.get('열람제한일'))
    counts = D.get('학급수') or []
    virt = D.get('가상학급수') or [0, 0, 0, 0]
    tt = {}
    for g in (1, 2, 3):
        try:
            n = int(counts[g]) - int((virt[g] if len(virt) > g else 0) or 0)
        except Exception:
            continue
        for c in range(1, n + 1):
            for wd in range(1, 6):
                day = start + timedelta(days=wd - 1)
                if limit and limit.year >= 2014 and day >= limit:
                    continue   # 컴시간이 아직 공개하지 않은 날
                rows = [x for x in (cell(D, cfg, g, c, wd, p) for p in range(1, 9)) if x]
                tt.setdefault(f'{g}-{c}', {})[day.isoformat()] = rows
    return start, tt


def main():
    now = datetime.now(KST)
    today = now.date()
    name = os.environ.get('SCHOOL_NAME', '')
    code = int(os.environ.get('COMCI_CODE') or 0)

    cfg = learn()
    note('컴시간 화면 읽기: 주소 {route} · 자료 {orig}/{daily}'.format(**cfg))

    if name:
        try:
            hits = [h for h in search(cfg, name.replace('등학교', '')) if h['name'] == name]
            if hits and hits[0]['code'] != code:
                note(f"학교 번호가 {code} → {hits[0]['code']} 로 바뀌었어요 (컴시간 학교 찾기 결과)")
                code = hits[0]['code']
            elif not hits and not code:
                raise SystemExit('컴시간에서 학교를 찾지 못했어요: ' + name)
        except SystemExit:
            raise
        except Exception as e:
            note('학교 찾기 실패(저장된 번호로 계속): ' + ''.join(traceback.format_exception_only(type(e), e)).strip()[:200])

    mon = today - timedelta(days=today.weekday())
    if today.weekday() >= 5:
        mon += timedelta(days=7)   # 주말에 돌면 다음 주를 '이번 주'로

    tt, how = {}, ''
    for r in (1, 2):
        D = fetch(cfg, code, r)
        if r == 1:
            note(f"자료 모양: 시작일={D.get('시작일')} · 학급수={D.get('학급수')} · 분리={D.get('분리')} · 변경알림={D.get('변경알림')} · 열람제한일={D.get('열람제한일')}")
        start, week = week_of(D, cfg)
        if start - timedelta(days=start.weekday()) != mon:
            how += f'r={r}: {start} 주(다른 주) · '
            continue
        tt = week
        cells = sum(len(v) for days in week.values() for v in days.values())
        how += f'{start.month}/{start.day}~ 주 {len(week)}개 반 · {cells}칸 · '
        break

    if not tt:
        note(how + '이번 주 시간표를 받지 못했어요. 예전 파일을 그대로 둡니다.')
        raise SystemExit(1)

    # 못 받은 날짜는 예전 파일에서 그대로 가져와 지우지 않습니다 (지난 14일까지만 남김)
    try:
        old = json.load(open('data/comci.json', encoding='utf-8')).get('timetable') or {}
    except Exception:
        old = {}
    keep_from = (today - timedelta(days=14)).isoformat()
    for k, days in old.items():
        for d, rows in days.items():
            if d >= keep_from and d not in tt.get(k, {}):
                tt.setdefault(k, {})[d] = rows
    for k in list(tt):
        tt[k] = {d: tt[k][d] for d in sorted(tt[k]) if d >= keep_from}

    chg = sum(1 for k in tt for d, rows in tt[k].items() if d >= today.isoformat() for x in rows if x.get('c'))
    out = {'updated': now.strftime('%Y-%m-%d %H:%M'), 'school': {'name': name, 'code': code},
           'timetable': dict(sorted(tt.items(), key=lambda kv: tuple(map(int, kv[0].split('-'))))), 'notes': notes}
    os.makedirs('data', exist_ok=True)
    json.dump(out, open('data/comci.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    note(how + f'오늘 이후 바뀐 칸 {chg}개')


if __name__ == '__main__':
    main()
