# SOS260

AI 유사문항(2차훈련/3제 굳히기)을 실제 수식 조판 PNG로 표시합니다.

1. 생성 AI가 question 외에 renderBlocks를 함께 저장합니다.
2. 한국어 문장은 text, 수학식은 완전한 MathML로 저장합니다.
3. 학생 브라우저가 MathML을 실제 수식으로 조판합니다.
4. 조판된 문제지 전체를 Canvas에 rasterize하여 data:image/png로 만듭니다.
5. 학생에게는 최종 PNG <img>만 표시합니다.
6. 오답 화면도 같은 PNG 렌더러를 사용합니다.
7. 과거 renderBlocks 없는 AI 문항은 보조 변환 후 PNG 처리합니다.
8. SQL 없음.
