// 데스크톱 앱에 담을 화면 파일을 classroom-beta 에서 복사합니다 (빌드 때마다 실행)
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'classroom-beta');
const dst = path.join(__dirname, 'screens');
fs.mkdirSync(dst, { recursive: true });
const names = ['index.html', 'tv.html', 'gs2.js', 'ck.js', 'fb.js', 'quotes.json', 'manifest.webmanifest']
  .concat(fs.readdirSync(src).filter(n => n.endsWith('.png')));
for (const n of names) fs.copyFileSync(path.join(src, n), path.join(dst, n));
fs.copyFileSync(path.join(root, 'solo', 'core.js'), path.join(__dirname, 'core.js'));
console.log('screens:', names.length, 'files + core.js');
