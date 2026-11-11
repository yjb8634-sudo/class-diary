/* 클래스 나우 데스크톱 — 로컬 자료 저장소
 * 학급 자료 전부를 선생님 PC의 폴더 안에만 저장합니다. (서버 · 계정 없음)
 *  - store.json : 문서들 (경로 → 내용)
 *  - props.json : 설치 정보 (이름 · 학년 · 반 · 관리 열쇠)
 *  - files/     : 첨부 파일 (옆에 .meta.json 로 이름 · 종류)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
function newKey(n) {
  const b = crypto.randomBytes(n), out = [];
  for (let i = 0; i < n; i++) out.push(ABC[b[i] % 32]);
  return out.join('');
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.filesDir = path.join(dir, 'files');
    fs.mkdirSync(this.filesDir, { recursive: true });
    this.docs = new Map();
    this.props = {};
    this.cache = new Map();
    this._timer = null;
    this._load();
  }

  _load() {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(this.dir, 'store.json'), 'utf8'));
      for (const k in j) this.docs.set(k, j[k]);
    } catch (e) {}
    try { this.props = JSON.parse(fs.readFileSync(path.join(this.dir, 'props.json'), 'utf8')); } catch (e) { this.props = {}; }
  }

  _atomicWrite(file, text) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }

  saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, 400);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const o = {};
    for (const [k, v] of this.docs) o[k] = v;
    this._atomicWrite(path.join(this.dir, 'store.json'), JSON.stringify(o));
  }

  savePropsNow() { this._atomicWrite(path.join(this.dir, 'props.json'), JSON.stringify(this.props)); }

  /* ---- CNCORE 가 쓰는 env ---- */
  makeEnv(extra) {
    const self = this;
    return Object.assign({
      now() { return Date.now(); },
      read(p) { const v = self.docs.get(p); return v == null ? null : JSON.parse(JSON.stringify(v)); },
      list(prefix) {
        const out = [];
        for (const [k, v] of self.docs) {
          if (!k.startsWith(prefix)) continue;
          const rest = k.slice(prefix.length);
          if (!rest.includes('/')) out.push([k, JSON.parse(JSON.stringify(v))]);
        }
        out.sort((a, b) => a[0] < b[0] ? -1 : 1);
        return out;
      },
      write(p, d) {
        if (d == null) self.docs.delete(p); else self.docs.set(p, JSON.parse(JSON.stringify(d)));
        self.saveSoon();
      },
      props() { return Object.assign({}, self.props); },
      propsSet(o) { Object.assign(self.props, o); self.savePropsNow(); },
      cacheGet(k) {
        const e = self.cache.get(k);
        if (!e) return null;
        if (Date.now() > e.exp) { self.cache.delete(k); return null; }
        return JSON.parse(JSON.stringify(e.v));
      },
      cachePut(k, v, ms) { self.cache.set(k, { v: JSON.parse(JSON.stringify(v)), exp: Date.now() + ms }); },
      newKey,
      ownerEmail() { return ''; },
      sheetUrl() { return ''; },
      /* 첨부: PC 폴더에 저장하고 /files/<id> 로 서빙 */
      driveSave(o) {
        const b64 = String(o.b64 || '');
        if (b64.length > 40e6) throw new Error('파일이 너무 커요 (30MB까지)');
        const id = 'lf' + newKey(18);
        fs.writeFileSync(path.join(self.filesDir, id), Buffer.from(b64, 'base64'));
        const meta = { name: String(o.name || '파일').slice(0, 120), mime: String(o.mime || 'application/octet-stream').slice(0, 100), at: Date.now() };
        fs.writeFileSync(path.join(self.filesDir, id + '.meta.json'), JSON.stringify(meta));
        return { id, name: meta.name, mime: meta.mime, u: '/files/' + id };
      },
      tvDoc() { throw new Error('데스크톱판은 화면의 연결 숫자로 TV를 연결해요'); }
    }, extra || {});
  }

  fileMeta(id) {
    if (!/^lf[a-z0-9]{10,}$/.test(id)) return null;
    try { return JSON.parse(fs.readFileSync(path.join(this.filesDir, id + '.meta.json'), 'utf8')); } catch (e) { return null; }
  }
  filePath(id) { return path.join(this.filesDir, id); }
}

module.exports = { Store, newKey };
