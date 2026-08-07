SOS 159-1 HOTFIX

증상:
source_files.training_course NOT NULL constraint 때문에 시험지 세트 등록 실패.

원인:
src/app/api/source-files/upload/route.ts 에서 training_course: null 을 명시적으로 전송함.
DB에는 training_course text NOT NULL DEFAULT '대표유형' 이 설정되어 있으므로 null을 보내면 기본값이 적용되지 않음.

수정:
training_course 필드를 INSERT payload에서 제거하여 DB 기본값 '대표유형'을 사용하도록 변경.

적용:
압축 내부의 src 폴더를 프로젝트 루트에 그대로 덮어쓰기.
추가 SQL 없음.

확인:
git status
git diff -- src/app/api/source-files/upload/route.ts
npm run build
