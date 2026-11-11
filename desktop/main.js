/* 클래스 나우 데스크톱 — Electron 껍데기
 * 로컬 서버(server.js)를 켜고, 관리 화면 창과 TV 전체 화면 창을 엽니다.
 * 창을 닫아도 오른쪽 아래 트레이에 남아 전자칠판 연결을 계속 받습니다. */
'use strict';
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const { createApp } = require('./server.js');

let cn = null;        /* 로컬 서버 */
let adminWin = null;
let tvWin = null;
let tray = null;
let quitting = false;

const one = app.requestSingleInstanceLock();
if (!one) app.quit();

function origin() { return 'http://127.0.0.1:' + cn.port; }

function openExternalFilter(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin())) {
      /* 미리 보기 등 내부 주소 새 창은 기본 브라우저 대신 새 창으로 */
      const w = new BrowserWindow({ width: 1280, height: 800, autoHideMenuBar: true });
      w.loadURL(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function openAdmin() {
  if (adminWin && !adminWin.isDestroyed()) { adminWin.show(); adminWin.focus(); return; }
  adminWin = new BrowserWindow({
    width: 1360, height: 900, minWidth: 960, minHeight: 640,
    autoHideMenuBar: true,
    title: '클래스 나우',
    icon: path.join(__dirname, 'screens', 'app-512.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  openExternalFilter(adminWin);
  adminWin.loadURL(origin() + '/?admin=1');
  adminWin.on('closed', () => { adminWin = null; });
}

function openTv() {
  if (tvWin && !tvWin.isDestroyed()) { tvWin.show(); tvWin.focus(); return; }
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const ext = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);   /* 두 번째 화면(TV)이 있으면 거기로 */
  tvWin = new BrowserWindow({
    x: ext ? ext.bounds.x + 40 : undefined, y: ext ? ext.bounds.y + 40 : undefined,
    width: 1280, height: 800,
    fullscreen: true, autoHideMenuBar: true,
    title: '클래스 나우 — 교실 TV',
    icon: path.join(__dirname, 'screens', 'app-512.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  openExternalFilter(tvWin);
  tvWin.loadURL(origin() + '/?tv=1');
  /* Esc 로 전체 화면만 해제 (창은 남김) */
  tvWin.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape' && tvWin.isFullScreen()) { tvWin.setFullScreen(false); e.preventDefault(); }
  });
  tvWin.on('closed', () => { tvWin = null; });
}

function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'screens', 'icon-192.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('클래스 나우');
  const menu = Menu.buildFromTemplate([
    { label: '관리 화면 열기', click: openAdmin },
    { label: 'TV 화면 열기 (전체 화면)', click: openTv },
    { type: 'separator' },
    { label: '끝내기 (TV 연결도 멈춤)', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', openAdmin);
}

function checkUpdates() {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', () => {
      if (!adminWin || adminWin.isDestroyed()) return;
      dialog.showMessageBox(adminWin, {
        type: 'info', buttons: ['지금 다시 시작', '나중에'],
        message: '클래스 나우 새 버전이 준비됐어요.',
        detail: '다시 시작하면 새 버전으로 열려요. (자료는 그대로 있어요)'
      }).then(r => { if (r.response === 0) { quitting = true; autoUpdater.quitAndInstall(); } });
    });
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600e3);
  } catch (e) {}
}

app.on('second-instance', () => openAdmin());
app.on('window-all-closed', () => { /* 트레이에 남아 전자칠판 연결을 계속 받습니다 */ });
app.on('before-quit', () => { quitting = true; if (cn) try { cn.store.flush(); } catch (e) {} });

app.whenReady().then(async () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  cn = createApp({ dir: dataDir, screens: path.join(__dirname, 'screens'), appVer: app.getVersion() });
  try {
    await cn.listen(8537);
  } catch (e) {
    dialog.showErrorBox('클래스 나우', '로컬 서버를 켜지 못했어요.\n' + String(e.message || e));
    app.quit();
    return;
  }
  buildTray();
  openAdmin();
  checkUpdates();
});
