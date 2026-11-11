package kr.yjb.classnow.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Button;
import android.widget.LinearLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 클래스 나우 교실 TV 화면을 주소창 없이 전체 화면으로 띄우는 앱.
 * - 처음엔 예전 방식(정식판 · 시험판, 공용 서버)으로 열립니다. 구글 드라이브판은 설정 → [연결 방식 바꾸기]에서 고릅니다.
 * - 구글 드라이브판: TV에 코드가 뜨고, 선생님이 휴대폰에서 google.com/device 에 넣어 허용하면 연결됩니다.
 *   TV에는 구글 로그인이 남지 않고, 앱은 '클래스 나우 전용 폴더(drive.appdata)'만 읽고 쓸 수 있어요.
 *   연결 열쇠(refresh token)는 이 기기 안에만 두고, 제작자 서버로는 아무것도 보내지 않습니다.
 * - 예전 방식: TV 화면이 6자리 연결 숫자를 보여 주고, 선생님이 클래스 나우에서 그 숫자를 넣으면 연결됩니다.
 * - 왼쪽 위 모서리를 3초 누르거나 리모컨 [메뉴]를 누르면 설정이 열립니다.
 */
public class MainActivity extends Activity {

    static final String HOST = "yjb8634-sudo.github.io";
    static final String PROD = "https://" + HOST + "/class-diary/classroom/tv.html";
    static final String BETA = "https://" + HOST + "/class-diary/classroom-beta/tv.html";
    static final String DRIVE = "https://" + HOST + "/class-diary/classroom-drive/tv.html";

    /* 구글 연결 (TV · 입력 제한 기기용 OAuth 클라이언트) */
    static final String CID = "373891623308-7f2fn8orobq47psjqgt6336jheffu519.apps.googleusercontent.com";
    static final String KS = "a2ZDWnZ5cElZQ1NwRmdlb2JsbmhYa2g2LXJKTi1YUFNDT0c=";   /* 설치형 앱 비밀값: 구글 안내대로 앱에 넣되, 저장소에 그대로 보이지 않게 뒤집어 감쌈 */
    static final String SCOPE = "openid email https://www.googleapis.com/auth/drive.appdata";
    static final String OAUTH = "https://oauth2.googleapis.com/";

    private WebView web;
    private FrameLayout root;
    private LinearLayout panel;
    private TextView pTitle, pBody, pCode, pUrl, pMsg;
    private Button pBtn1, pBtn2;
    private final ExecutorService io = Executors.newCachedThreadPool();
    private volatile String curUrl = "";
    private volatile int flowGen = 0;
    private String at = null;
    private long atExp = 0;
    private TextView errBox;
    private SharedPreferences sp;
    private final Handler h = new Handler(Looper.getMainLooper());
    private boolean mainError = false;
    private final Runnable retry = new Runnable() {
        @Override public void run() { if (web != null) { mainError = false; web.reload(); } }
    };
    private final Runnable cornerHold = new Runnable() {
        @Override public void run() { showMenu(); }
    };

    private boolean drive() { return "drive".equals(sp.getString("mode", "")); }
    /* 구글 드라이브판은 따로 된 주소. 예전 방식(공용 서버)은 정식판 · 시험판 그대로 */
    private String home() { return drive() ? DRIVE : (sp.getBoolean("beta", false) ? BETA : PROD); }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("tv", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#1D2A25"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // 종소리 · 생일 노래 · 노동요가 저절로 울리도록
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " ClassNowTV/1");
        if (Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        }
        web.setBackgroundColor(Color.parseColor("#1D2A25"));
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "ClassNowTV");
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        errBox = new TextView(this);
        errBox.setTextColor(Color.parseColor("#E4E0D3"));
        errBox.setBackgroundColor(Color.parseColor("#1D2A25"));
        errBox.setGravity(Gravity.CENTER);
        errBox.setTextSize(26);
        errBox.setLineSpacing(0, 1.4f);
        errBox.setText("인터넷 연결을 기다리는 중이에요…\n15초 뒤에 다시 열어 볼게요.");
        errBox.setVisibility(View.GONE);
        root.addView(errBox, new FrameLayout.LayoutParams(-1, -1));

        // 왼쪽 위 모서리: 3초 누르면 설정 (보이지 않음, 짧게 누르면 아래 화면으로 그대로 전달)
        View corner = new View(this);
        int px = (int) (64 * getResources().getDisplayMetrics().density);
        corner.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, MotionEvent e) {
                int a = e.getActionMasked();
                if (a == MotionEvent.ACTION_DOWN) h.postDelayed(cornerHold, 3000);
                else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) h.removeCallbacks(cornerHold);
                return false;
            }
        });
        root.addView(corner, new FrameLayout.LayoutParams(px, px, Gravity.TOP | Gravity.START));

        buildPanel();
        setContentView(root);
        hideBars();

        /* 처음 설치 · 업데이트: 지금까지처럼 예전 방식(연결 숫자). 구글 드라이브판은 설정 메뉴에서 고름 */
        if (drive() && sp.getString("rt", "").isEmpty()) startDeviceFlow();
        else if (b != null) web.restoreState(b);
        else web.loadUrl(home());
    }

    /* ================= 연결 화면 (앱 안 화면, 리모컨으로 고를 수 있게) ================= */
    private TextView tv(float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(size); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        t.setLineSpacing(0, 1.35f);
        if (bold) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return t;
    }
    private void buildPanel() {
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.parseColor("#1D2A25"));
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        panel.setPadding(pad, pad, pad, pad);
        int ink = Color.parseColor("#E4E0D3"), gold = Color.parseColor("#F2D16B");
        pTitle = tv(30, ink, true);
        pBody = tv(21, ink, false);
        pCode = tv(64, gold, true); pCode.setLetterSpacing(0.12f);
        pUrl = tv(26, gold, true);
        pMsg = tv(17, Color.parseColor("#9FB3A7"), false);
        pBtn1 = new Button(this); pBtn2 = new Button(this);
        pBtn1.setTextSize(19); pBtn2.setTextSize(17);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.topMargin = pad / 2;
        panel.addView(pTitle, lp);
        panel.addView(pBody, new LinearLayout.LayoutParams(-2, -2));
        panel.addView(pCode, lp);
        panel.addView(pUrl, new LinearLayout.LayoutParams(-2, -2));
        panel.addView(pMsg, lp);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-2, -2);
        bp.leftMargin = bp.rightMargin = pad / 3;
        row.addView(pBtn1, bp); row.addView(pBtn2, bp);
        panel.addView(row, lp);
        panel.setVisibility(View.GONE);
        root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    }
    private void panelShow(String title, String body, String code, String url, String msg) {
        pTitle.setText(title); pBody.setText(body);
        pCode.setText(code == null ? "" : code); pCode.setVisibility(code == null ? View.GONE : View.VISIBLE);
        pUrl.setText(url == null ? "" : url); pUrl.setVisibility(url == null ? View.GONE : View.VISIBLE);
        pMsg.setText(msg == null ? "" : msg);
        panel.setVisibility(View.VISIBLE);
        panel.bringToFront();
    }
    private void panelHide() { flowGen++; panel.setVisibility(View.GONE); }

    /* ================= 구글 기기 코드 연결 (google.com/device) ================= */
    private static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; } }
    private static String cs() { return new StringBuilder(new String(Base64.decode(KS, Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8)).reverse().toString(); }
    private static JSONObject post(String url, String form) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream o = c.getOutputStream()) { o.write(form.getBytes("UTF-8")); }
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); in.close(); }
        String body = bo.toString("UTF-8");
        JSONObject j;
        try { j = body.isEmpty() ? new JSONObject() : new JSONObject(body); } catch (Exception e) { j = new JSONObject(); }
        j.put("_code", code);
        return j;
    }
    private static String emailOf(String idToken) {
        try {
            String[] p = idToken.split("\\.");
            JSONObject j = new JSONObject(new String(Base64.decode(p[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), "UTF-8"));
            return j.optString("email", "");
        } catch (Exception e) { return ""; }
    }

    private void startDeviceFlow() {
        final int gen = ++flowGen;
        web.loadUrl("about:blank");
        panelShow("구글 계정으로 연결", "코드를 받는 중…", null, null, "");
        pBtn1.setVisibility(View.GONE);
        pBtn2.setVisibility(View.VISIBLE); pBtn2.setText("예전 방식으로 돌아가기");
        pBtn2.setOnClickListener(v -> confirmMode("old"));
        io.execute(() -> deviceLoop(gen, 0));
    }
    private void deviceLoop(final int gen, int round) {
        try {
            JSONObject d = post(OAUTH + "device/code", "client_id=" + enc(CID) + "&scope=" + enc(SCOPE));
            if (d.optInt("_code") != 200) throw new Exception("코드를 받지 못했어요 (" + d.optString("error", "" + d.optInt("_code")) + ")");
            final String userCode = d.getString("user_code");
            final String vurl = d.optString("verification_url", "https://www.google.com/device").replace("https://", "").replace("www.", "");
            final String devCode = d.getString("device_code");
            long until = System.currentTimeMillis() + d.optLong("expires_in", 1800) * 1000;
            long interval = Math.max(5, d.optLong("interval", 5)) * 1000;
            h.post(() -> { if (gen != flowGen) return;
                panelShow("구글 계정으로 연결",
                        "담임 선생님 휴대폰(또는 PC)에서 아래 주소를 열고, 코드를 넣은 뒤 [허용]을 눌러 주세요.\n클래스 나우 관리 화면과 같은 구글 계정으로 허용해야 해요.",
                        userCode, vurl, "기다리는 중… (코드는 몇 분 동안 쓸 수 있어요)");
                pBtn1.setVisibility(View.VISIBLE); pBtn1.setText("새 코드 받기");
                pBtn1.setOnClickListener(v -> startDeviceFlow());
                pBtn2.requestFocus();
            });
            while (gen == flowGen && System.currentTimeMillis() < until) {
                Thread.sleep(interval);
                if (gen != flowGen) return;
                JSONObject t;
                try {
                    t = post(OAUTH + "token", "client_id=" + enc(CID) + "&client_secret=" + enc(cs())
                            + "&device_code=" + enc(devCode) + "&grant_type=" + enc("urn:ietf:params:oauth:grant-type:device_code"));
                } catch (Exception net) { continue; }   /* 잠깐 끊김: 계속 기다림 */
                String err = t.optString("error", "");
                if (t.has("access_token")) {
                    final String rt = t.optString("refresh_token", "");
                    synchronized (this) { at = t.getString("access_token"); atExp = System.currentTimeMillis() + t.optLong("expires_in", 3600) * 1000; }
                    sp.edit().putString("rt", rt).putString("em", emailOf(t.optString("id_token", ""))).apply();
                    h.post(() -> { if (gen != flowGen) return; panelHide(); mainError = false; web.loadUrl(home()); toast("구글 드라이브에 연결했어요"); });
                    return;
                }
                if ("authorization_pending".equals(err)) continue;
                if ("slow_down".equals(err)) { interval += 5000; continue; }
                if ("access_denied".equals(err)) {
                    h.post(() -> { if (gen != flowGen) return; pMsg.setText("허용하지 않았어요. [새 코드 받기]로 다시 해 주세요."); pBtn1.requestFocus(); });
                    return;
                }
                break;   /* expired_token 등: 새 코드 */
            }
            if (gen == flowGen && round < 5) deviceLoop(gen, round + 1);
            else if (gen == flowGen) h.post(() -> { pCode.setVisibility(View.GONE); pUrl.setVisibility(View.GONE); pMsg.setText("시간이 지나 멈췄어요. 리모컨으로 [새 코드 받기]를 눌러 주세요."); pBtn1.requestFocus(); });
        } catch (Exception e) {
            final String m = e.getMessage();
            h.post(() -> { if (gen != flowGen) return;
                panelShow("구글 계정으로 연결", "구글에 연결하지 못했어요.\n인터넷 연결을 확인해 주세요.", null, null, m == null ? "" : m);
                pBtn1.setVisibility(View.VISIBLE); pBtn1.setText("다시 시도"); pBtn1.setOnClickListener(v -> startDeviceFlow()); pBtn1.requestFocus(); });
        }
    }

    /* 화면(웹)이 쓰는 한 시간짜리 열쇠: 기기 안 refresh token 으로 새로 받음 */
    private synchronized String accessToken(boolean force) throws Exception {
        if (!force && at != null && System.currentTimeMillis() < atExp - 120000) return at;
        String rt = sp.getString("rt", "");
        if (rt.isEmpty()) { h.post(this::startDeviceFlow); throw new Exception("구글 연결이 필요해요"); }
        JSONObject t;
        try {
            t = post(OAUTH + "token", "client_id=" + enc(CID) + "&client_secret=" + enc(cs()) + "&refresh_token=" + enc(rt) + "&grant_type=refresh_token");
        } catch (Exception net) { throw new Exception("인터넷 연결을 확인해 주세요"); }
        if (t.has("access_token")) {
            at = t.getString("access_token");
            atExp = System.currentTimeMillis() + t.optLong("expires_in", 3600) * 1000;
            return at;
        }
        String err = t.optString("error", "");
        if ("invalid_grant".equals(err) || "unauthorized_client".equals(err)) {   /* 선생님이 연결을 끊었거나 오래 안 씀 */
            at = null; sp.edit().remove("rt").apply();
            h.post(this::startDeviceFlow);
            throw new Exception("구글 연결이 끊겼어요");
        }
        throw new Exception("구글 연결 오류 (" + (err.isEmpty() ? t.optInt("_code") : err) + ")");
    }

    private void forgetDrive(final boolean revoke) {
        final String rt = sp.getString("rt", "");
        synchronized (this) { at = null; atExp = 0; }
        sp.edit().remove("rt").remove("em").apply();
        if (revoke && !rt.isEmpty()) io.execute(() -> { try { post(OAUTH + "revoke", "token=" + enc(rt)); } catch (Exception ignored) {} });
        /* TV 안에 남은 우리 반 자료 사본도 지움 */
        web.evaluateJavascript("try{Object.keys(localStorage).forEach(function(k){if(k.indexOf('cn_drv_')===0)localStorage.removeItem(k)})}catch(e){}", null);
    }

    private class Bridge {
        private boolean ok() {
            try { Uri u = Uri.parse(curUrl); return ours(u) && u.getPath() != null && u.getPath().startsWith("/class-diary/"); } catch (Exception e) { return false; }
        }
        @JavascriptInterface public boolean isDrive() { return ok() && drive(); }
        @JavascriptInterface public String email() { return ok() ? sp.getString("em", "") : ""; }
        @JavascriptInterface public void token(final String id, final boolean force) {
            if (!ok() || !drive()) return;
            io.execute(() -> {
                String tok = null, err = null;
                try { tok = accessToken(force); } catch (Exception e) { err = e.getMessage(); }
                final String js = "window.__cnTok&&window.__cnTok(" + JSONObject.quote(id) + "," + (tok == null ? "null" : JSONObject.quote(tok)) + "," + (err == null ? "null" : JSONObject.quote(err)) + ")";
                h.post(() -> web.evaluateJavascript(js, null));
            });
        }
        @JavascriptInterface public void relink() { if (ok()) h.post(MainActivity.this::confirmRelink); }
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (web != null) web.saveState(o); }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }

    @SuppressWarnings("deprecation")
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); hideBars(); }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { flowGen++; h.removeCallbacksAndMessages(null); io.shutdownNow(); if (web != null) web.destroy(); super.onDestroy(); }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) { showMenu(); return true; }
        return super.onKeyDown(code, e);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // 뒤로 가기로 앱이 실수로 닫히지 않게: 앞 화면이 있으면 그리로, 없으면 안내만
        if (panel != null && panel.getVisibility() == View.VISIBLE) { Toast.makeText(this, "설정은 리모컨 [메뉴]를 누르세요", Toast.LENGTH_SHORT).show(); return; }
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        Toast.makeText(this, "설정은 왼쪽 위 모서리를 3초 누르세요", Toast.LENGTH_SHORT).show();
    }

    private void showMenu() {
        final boolean beta = sp.getBoolean("beta", false);
        final boolean drv = drive();
        String em = sp.getString("em", "");
        String[] items = {
                "새로고침",
                drv ? "(구글 드라이브판은 정식판 · 시험판 구분 없음)" : beta ? "정식판으로 바꾸기 (지금: 시험판)" : "시험판으로 바꾸기 (지금: 정식판)",
                drv ? "구글 다시 연결 (다른 계정으로 바꾸기)" + (em.isEmpty() ? "" : "\n지금: " + em) : "TV 연결 다시 하기 (다른 반으로 바꾸기)",
                drv ? "연결 방식 바꾸기 (지금: 구글 드라이브판)" : "연결 방식 바꾸기 (지금: 예전 방식 · 공용 서버)",
                "크롬에서 열기",
                "앱 닫기"
        };
        new AlertDialog.Builder(this)
                .setTitle("클래스 나우 TV")
                .setItems(items, (d, i) -> {
                    if (i == 0) { if (panel.getVisibility() == View.VISIBLE && drv && sp.getString("rt", "").isEmpty()) startDeviceFlow(); else { mainError = false; web.reload(); } }
                    else if (i == 1) { if (drv) return; sp.edit().putBoolean("beta", !beta).apply(); if (panel.getVisibility() != View.VISIBLE) web.loadUrl(home()); }
                    else if (i == 2) { if (drv) confirmRelink(); else confirmRepair(); }
                    else if (i == 3) confirmMode(drv ? "old" : "drive");
                    else if (i == 4) openOutside(curUrl.startsWith("http") ? curUrl.replace("?drv=1", "") : home());
                    else if (i == 5) finishAndRemoveTask();
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void confirmRelink() {
        new AlertDialog.Builder(this)
                .setTitle("구글 다시 연결")
                .setMessage("이 TV의 구글 연결을 끊고, 새 코드를 띄울까요?\n(담임 선생님이 휴대폰에서 google.com/device 에 코드를 다시 넣어야 해요)")
                .setPositiveButton("다시 연결", (d, w) -> { forgetDrive(true); startDeviceFlow(); })
                .setNegativeButton("취소", null)
                .show();
    }

    private void confirmMode(final String to) {
        boolean toDrive = "drive".equals(to);
        new AlertDialog.Builder(this)
                .setTitle("연결 방식 바꾸기")
                .setMessage(toDrive
                        ? "구글 드라이브판으로 바꿀까요?\n자료를 담임 선생님 구글 드라이브에만 두는 방식이에요. 선생님 휴대폰으로 구글 연결을 한 번 해야 해요.\n(지금 쓰는 예전 방식 연결은 이 TV에 그대로 남아서, 언제든 돌아올 수 있어요)"
                        : "예전 방식(연결 숫자 · 공용 서버)으로 돌아갈까요?\n이 TV의 구글 연결은 끊고, TV 안의 드라이브판 자료 사본도 지워요.")
                .setPositiveButton("바꾸기", (d, w) -> {
                    if (toDrive) { sp.edit().putString("mode", "drive").apply(); startDeviceFlow(); }
                    else { forgetDrive(true); sp.edit().putString("mode", "old").apply(); panelHide(); web.loadUrl(home()); }
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void confirmRepair() {
        new AlertDialog.Builder(this)
                .setTitle("TV 연결 다시 하기")
                .setMessage("이 TV에 기억된 반 연결을 지우고, 새 연결 숫자를 띄울까요?\n(담임 선생님이 클래스 나우에서 숫자를 다시 넣어야 해요)")
                .setPositiveButton("다시 연결", (d, w) -> {
                    String key = sp.getBoolean("beta", false) ? "cr_tv_key_beta" : "cr_tv_key";
                    web.evaluateJavascript("try{localStorage.removeItem('" + key + "')}catch(e){}", v -> web.loadUrl(home()));
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void openOutside(String url) {
        try {
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception ex) {
            Toast.makeText(this, "이 링크를 열 앱이 없어요", Toast.LENGTH_SHORT).show();
        }
    }

    private static boolean ours(Uri u) {
        return u != null && HOST.equalsIgnoreCase(u.getHost());
    }

    private void showError() {
        mainError = true;
        errBox.setVisibility(View.VISIBLE);
        h.removeCallbacks(retry);
        h.postDelayed(retry, 15000);
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (ours(u)) return false;
            String sc = u.getScheme();
            if ("http".equals(sc) || "https".equals(sc)) {
                // 구글 로그인 등은 앱 안에서, 그 밖의 바깥 링크(드라이브 파일 등)는 크롬으로
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.endsWith("firebaseapp.com") || host.endsWith("accounts.google.com") || host.endsWith("googleapis.com")) return false;
            }
            openOutside(u.toString());
            return true;
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            Uri u = Uri.parse(url);
            if (ours(u)) return false;
            openOutside(url);
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, android.graphics.Bitmap fav) { curUrl = url == null ? "" : url; }

        @Override
        public void onPageFinished(WebView v, String url) {
            curUrl = url == null ? "" : url;
            if (!mainError) errBox.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) showError();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView v, int code, String desc, String url) {
            if (Build.VERSION.SDK_INT < 23) showError();
        }
    }

    private class Chrome extends WebChromeClient {
        // target=_blank / window.open 으로 여는 링크(첨부파일 원본 등)는 크롬에서
        @Override
        public boolean onCreateWindow(WebView v, boolean dialog, boolean user, Message msg) {
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
                    Uri u = r.getUrl();
                    if (ours(u)) web.loadUrl(u.toString()); else openOutside(u.toString());
                    w.destroy();
                    return true;
                }

                @SuppressWarnings("deprecation")
                @Override
                public boolean shouldOverrideUrlLoading(WebView w, String url) {
                    Uri u = Uri.parse(url);
                    if (ours(u)) web.loadUrl(url); else openOutside(url);
                    w.destroy();
                    return true;
                }
            });
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(tmp);
            msg.sendToTarget();
            return true;
        }
    }
}
