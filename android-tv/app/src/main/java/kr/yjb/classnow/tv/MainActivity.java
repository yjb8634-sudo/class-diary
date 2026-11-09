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
 * - 처음엔 TV 화면이 6자리 연결 숫자를 보여 주고, 선생님이 클래스 나우에서 그 숫자를 넣으면 연결됩니다.
 *   (연결 정보는 이 기기 안에만 저장되고, 앱 안에는 어떤 반 주소도 들어 있지 않습니다)
 * - 왼쪽 위 모서리를 3초 누르거나 리모컨 [메뉴]를 누르면 설정이 열립니다.
 */
public class MainActivity extends Activity {

    static final String HOST = "yjb8634-sudo.github.io";
    static final String PROD = "https://" + HOST + "/class-diary/classroom/tv.html";
    static final String BETA = "https://" + HOST + "/class-diary/classroom-beta/tv.html";

    private WebView web;
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

    private String home() { return sp.getBoolean("beta", false) ? BETA : PROD; }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("tv", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
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

        setContentView(root);
        hideBars();

        if (b != null) web.restoreState(b);
        else web.loadUrl(home());
    }

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
    @Override protected void onDestroy() { h.removeCallbacksAndMessages(null); if (web != null) web.destroy(); super.onDestroy(); }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) { showMenu(); return true; }
        return super.onKeyDown(code, e);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // 뒤로 가기로 앱이 실수로 닫히지 않게: 앞 화면이 있으면 그리로, 없으면 안내만
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        Toast.makeText(this, "설정은 왼쪽 위 모서리를 3초 누르세요", Toast.LENGTH_SHORT).show();
    }

    private void showMenu() {
        final boolean beta = sp.getBoolean("beta", false);
        String[] items = {
                "새로고침",
                beta ? "정식판으로 바꾸기 (지금: 시험판)" : "시험판으로 바꾸기 (지금: 정식판)",
                "TV 연결 다시 하기 (다른 반으로 바꾸기)",
                "크롬에서 열기",
                "앱 닫기"
        };
        new AlertDialog.Builder(this)
                .setTitle("클래스 나우 TV")
                .setItems(items, (d, i) -> {
                    if (i == 0) { mainError = false; web.reload(); }
                    else if (i == 1) { sp.edit().putBoolean("beta", !beta).apply(); web.loadUrl(home()); }
                    else if (i == 2) confirmRepair();
                    else if (i == 3) openOutside(web.getUrl() != null ? web.getUrl() : home());
                    else if (i == 4) finishAndRemoveTask();
                })
                .setNegativeButton("닫기", null)
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
        public void onPageFinished(WebView v, String url) {
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
