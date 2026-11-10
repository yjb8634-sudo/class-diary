# 설치판 한 파일(코드.gs) 만들기: 앱.gs + core.js
a = open('앱.gs').read(); b = open('core.js').read()
open('클래스나우_설치판.gs', 'w').write(a + '\n\n' + b)
print('made', len(a) + len(b))
