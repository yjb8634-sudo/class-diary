/* 학급 다이어리 · 연결 도우미 (gas.js)
 * 화면이 쓰던 google.script.run 을 그대로 쓸 수 있게, 같은 이름으로 Apps Script(doPost)에 자료를 묻습니다.
 * 자주 여는 화면의 자료는 휴대폰에 저장해 두었다가 먼저 보여 주고, 새 자료가 오면 바로 바꿉니다. */
(function () {
  'use strict';
  var API = window.DIARY_API || '';

  function api(fn, args) {
    if (!API) return Promise.reject(new Error('config.js 에 Apps Script 주소가 없어요.'));
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ __fn: fn, args: args || [] }),
      redirect: 'follow',
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('서버가 응답하지 않아요. (' + r.status + ')');
      return r.text();
    }).then(function (t) {
      var res = null;
      try { res = JSON.parse(t); } catch (e) {
        throw new Error('서버 응답을 읽지 못했어요. Apps Script를 [새 버전]으로 배포했는지, 액세스가 [모든 사용자]인지 확인해 주세요.');
      }
      if (!res || !res.ok) throw new Error((res && res.e) || '서버 오류');
      return res.v;
    }, function (e) {
      if (e && e.message && /서버|응답|config/.test(e.message)) throw e;
      throw new Error('인터넷 연결을 확인해 주세요.');
    });
  }
  window.__diaryApi = api;

  /* 먼저 저장본을 보여 줘도 되는 '읽기' 함수들 */
  var STALE = { apiBoardData: 1, apiBoardExt: 1, apiHome21: 1, apiHomePbl: 1, apiBoard: 1, apiPblBoard: 1, getData: 1 };
  var served = {}, inflight = {};
  function h32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function mark(v) {
    if (v && typeof v === 'object') { try { Object.defineProperty(v, '__stale', { value: true, enumerable: false }); } catch (e) {} }
    return v;
  }

  function call(fn, args, s, f, u) {
    var ok = function (v) { if (s) { try { s(v, u); } catch (e) { setTimeout(function () { throw e; }); } } };
    var bad = function (e) { if (f) f(e, u); else if (window.console) console.error(e); };
    var teacher = args.some(function (a) { return typeof a === 'string' && a.indexOf('pw:') === 0; });
    if (!STALE[fn] || teacher) { api(fn, args).then(ok, bad); return; }
    var raw = JSON.stringify(args), key = 'rc:' + fn + ':' + h32(raw);
    var first = !served[key];
    served[key] = true;
    var saved = first ? lsGet(key) : null;
    if (saved && saved.a === raw && Date.now() - saved.t < 7 * 864e5) setTimeout(function () { ok(mark(saved.v)); }, 0);
    var p = inflight[key] || (inflight[key] = api(fn, args).then(function (v) {
      delete inflight[key];
      lsSet(key, { a: raw, t: Date.now(), v: v });
      return v;
    }, function (e) { delete inflight[key]; throw e; }));
    p.then(function (v) {
      if (saved && saved.a === raw && JSON.stringify(saved.v) === JSON.stringify(v)) return;   /* 바뀐 것이 없으면 다시 그리지 않음 */
      ok(v);
    }, function (e) { if (!saved) bad(e); });
  }

  function runner(s, f, u) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (x) { return runner(x, f, u); };
        if (k === 'withFailureHandler') return function (x) { return runner(s, x, u); };
        if (k === 'withUserObject') return function (x) { return runner(s, f, x); };
        if (typeof k !== 'string') return undefined;
        return function () { call(k, Array.prototype.slice.call(arguments), s, f, u); };
      }
    });
  }
  window.google = window.google || {};
  var gs = window.google.script = window.google.script || {};
  Object.defineProperty(gs, 'run', { configurable: true, get: function () { return runner(null, null, undefined); } });

  /* ================= 화면 열기 (라우터) =================
   * 주소(?p=… ?go=…)에 맞는 화면 파일과 값을 받아 화면을 그립니다.
   * 한 번 받은 화면 파일은 휴대폰에 저장해 두고, 다음부터는 바로 띄운 뒤 뒤에서 새 버전을 확인합니다. */
  var KEYS = ['p', 'go', 't', 'tab', 'app', 'preview'];
  function routeOf(search) {
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      if (KEYS.indexOf(k) >= 0 && v !== '') q[k] = v;
    });
    return q;
  }
  function todayStr() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function rkey(q) { return 'pb:' + JSON.stringify(KEYS.filter(function (k) { return k in q; }).map(function (k) { return [k, q[k]]; })); }
  function haveMap() { var o = {}; (lsGet('tplnames') || []).forEach(function (n) { var t = lsGet('tpl:' + n); if (t) o[n] = t.h; }); return o; }
  function storeBundle(q, b) {
    var names = lsGet('tplnames') || [];
    Object.keys(b.files || {}).forEach(function (n) {
      lsSet('tpl:' + n, { h: b.hashes[n], text: b.files[n] });
      if (names.indexOf(n) < 0) names.push(n);
    });
    lsSet('tplnames', names);
    lsSet(rkey(q), { main: b.main, vars: b.vars, title: b.title, hashes: b.hashes, rel: b.rel, today: b.today, error: b.error || '' });
  }
  function fetchBundle(q) { return api('apiPageBundle', [q, haveMap()]).then(function (b) { storeBundle(q, b); return b; }); }
  /* 서버가 화면 파일의 <?…?> 표시를 &lt;?…?&gt; 로 바꿔 보내도 원래대로 되돌립니다. */
  function unesc(t) {
    return String(t).replace(/&lt;\?([\s\S]*?)\?&gt;/g, function (_, m) {
      return '<?' + m.replace(/&#0*39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '?>';
    });
  }
  function build(b) {
    if (b.error) return null;
    var files = {};
    for (var n in b.hashes) {
      var t = lsGet('tpl:' + n);
      if (!t || t.h !== b.hashes[n]) return null;
      files[n] = unesc(t.text);
    }
    var html = files[b.main];
    if (!html) return null;
    var V = b.vars || {};
    html = html.replace(/<\?\s*if\s*\(\s*page\s*===\s*'(\w+)'\s*\)\s*\{\s*\?>([\s\S]*?)<\?\s*\}\s*\?>/g, function (_, pg, body) { return V.page === pg ? body : ''; });
    for (var i = 0; i < 4 && /include_\(/.test(html); i++) {
      html = html.replace(/<\?!=\s*include_\('([^']+)'\)\s*\?>/g, function (_, nm) { return files[nm] || ''; });
    }
    html = html.replace(/<\?!=\s*([A-Za-z_$][\w$]*)\s*\?>/g, function (_, v) { return V[v] == null ? '' : String(V[v]); });
    if (/<\?/.test(html)) return null;
    return html;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(html, b, q, cached) {
    var info = { key: rkey(q), q: q, hashes: b.hashes, cached: !!cached, t0: Date.now() };
    var add = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
      '<title>' + esc(b.title || '학급 다이어리') + '</title>' +
      '<script>window.__DIARY=' + JSON.stringify(info).replace(/</g, '\\u003c') + ';</' + 'script>' +
      '<script src="config.js"></' + 'script><script src="gas.js"></' + 'script>';
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + add; });
    else html = add + html;
    if (!/^\s*<!doctype/i.test(html)) html = '<!DOCTYPE html>' + html;
    document.open(); document.write(html); document.close();
  }
  function showError(msg, retry) {
    document.body.innerHTML = '<div class="dl-err"><p>' + msg + '</p>' + (retry ? '<button type="button" onclick="location.reload()">다시 시도</button>' : '') + '</div>';
  }
  window.__diaryRoute = function () {
    var q = routeOf(location.search);
    var saved = lsGet(rkey(q));
    if (saved && !saved.error && saved.today === todayStr()) {
      var html = build(saved);
      if (html) { show(html, saved, q, true); return; }
    }
    fetchBundle(q).then(function (b) {
      if (b.error) { showError(b.error, false); return; }
      var html = build(b);
      if (!html) { showError('화면 파일을 저장하지 못했어요. 휴대폰 저장 공간을 확인한 뒤 다시 시도해 주세요.', true); return; }
      show(html, b, q, false);
    }, function (e) { showError(esc(e.message || '연결하지 못했어요.'), true); });
  };
  /* 저장본으로 띄운 화면이면, 뒤에서 새 버전을 받아 둡니다. 막 연 화면이면 바로 새 버전으로 바꿉니다. */
  var D = window.__DIARY;
  if (D && D.cached && !D.checking) {
    D.checking = true;
    setTimeout(function () {
      fetchBundle(D.q).then(function (b) {
        var changed = b.error || Object.keys(b.hashes || {}).some(function (n) { return (D.hashes || {})[n] !== b.hashes[n]; }) ||
          Object.keys(D.hashes || {}).length !== Object.keys(b.hashes || {}).length;
        if (changed && Date.now() - D.t0 < 9000) location.reload();
      }, function () {});
    }, 1500);
  }
})();
