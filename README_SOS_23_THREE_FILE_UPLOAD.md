# SOS 23 - 시험지 세트 업로드

## 추가 기능
- 한글 원본(HWP/HWPX)
- 시험지 PDF
- 해설지 PDF
- 학년/과목
- 세 파일을 한 세트로 Supabase Storage와 source_files에 저장

## 적용 순서
1. 전체 파일을 프로젝트에 덮어쓰기
2. Supabase SQL Editor에서 `supabase-v1.2-source-file-bundle.sql` 실행
3. `npm install`
4. `npm run build`
5. Git 반영

```bash
git add .
git commit -m "feat: add three-file exam bundle upload"
git push origin main
```
