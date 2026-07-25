SOS PDF 문항영역 지정기 설치 방법

이 ZIP은 기존 SOS 화면을 덮어쓰지 않습니다.
프로젝트 루트에 풀면 아래 새 경로만 추가됩니다.

app/pdf-mapper/page.tsx

1. SOS 프로젝트 폴더에서 ZIP의 app 폴더를 그대로 복사합니다.
2. 터미널에서 실행합니다.

npm install pdfjs-dist
npm run build
npm run dev

3. 브라우저에서 아래 주소로 확인합니다.

http://localhost:3000/pdf-mapper

기능
- 30문항짜리 시험지 PDF 한 번에 업로드
- 해설지 PDF 업로드
- 시험시간 100분 고정
- PDF 각 페이지를 실제 화면에 렌더링
- 1~30번 문항 영역 드래그 지정
- 지정 후 다음 번호 자동 이동
- 각 문항 실제 잘린 이미지 미리보기
- 객관식/단답형 정답 입력
- 영역 좌표와 정답을 JSON으로 저장

주의
- 현재는 독립 테스트 페이지입니다.
- 기존 SOS의 app/page.tsx를 덮어쓰지 않습니다.
- 테스트 성공 후 Supabase 저장 및 SOS 학생 화면과 연결하면 됩니다.
