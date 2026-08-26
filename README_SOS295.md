# SOS295 · 이미지 전달 방식 변경 + 자동 재시도 확대

**파일 3개.** SQL 없음. SOS294 위에 덮어쓰세요. 빌드 확인 완료.

```
src\lib\sos-ai-training.ts
src\app\api\cron\sos-ai-generation\route.ts
src\app\api\admin\ai-generated-bank\route.ts
```

---

## 1) 이번 실패는 우리 검수 문제가 아니었습니다

```
Unable to download content from the provided URL before the timeout.
Check that the URL is publicly accessible and responds promptly.
```

**OpenAI가 원문 이미지를 못 받아온 것**입니다.

지금까지는 Supabase **서명 URL을 OpenAI에 건네주고, OpenAI가 직접 내려받게** 했습니다.
그래서 아래 요인 하나만 어긋나도 실패했습니다.

- 서명 URL 만료(20분) — 배치로 나누면서 후반 묶음이 만료 시각에 걸림
- Supabase 응답 지연
- OpenAI ↔ Supabase 간 네트워크

**우리가 통제할 수 없는 것에 매번 기대는 구조**였습니다.

### 고친 방법

이미지를 **서버가 직접 내려받아 base64로 실어 보냅니다.**

```ts
async function inlineImage(supabase, bucket, path) { ... }
```

난이도 재판정(SOS278)은 처음부터 이 방식이라 같은 오류가 없었습니다.
AI 문항 생성만 옛 방식으로 남아 있었습니다. 이제 맞췄습니다.

**학생 풀이사진**도 같은 방식이었으므로 함께 바꿨습니다.
진단 분석에서도 같은 오류가 날 수 있었습니다.

> 6MB가 넘는 파일은 건너뛰고 DNA 텍스트로 대체합니다.
> 다운로드가 실패해도 작업이 죽지 않고 텍스트로 진행합니다.

## 2) 이제 알아서 다시 만듭니다

지금까지는 **3회 실패하면 그대로 방치**됐습니다.
관리자가 화면을 열어보고 직접 되살려야 했고, 방치된 걸 알 방법도 없었습니다.
지난 이틀이 정확히 그 상황이었습니다.

**재시도 한도를 3회 → 8회로 올렸습니다.**

10분 주기이므로 **약 80분간 스스로 시도**합니다.
실패 원인이 대부분 일시적(AI 응답 지연, 이미지 다운로드 실패)이라
그 사이에 성공할 가능성이 높습니다.

관리자 수동 실행도 같은 기준으로 맞췄습니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\lib\sos-ai-training.ts sos-ai-training.SOS294.bak
copy src\app\api\cron\sos-ai-generation\route.ts cron-route.bak
copy src\app\api\admin\ai-generated-bank\route.ts ai-bank-route.bak
```

`SOS295` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS295" src\lib\sos-ai-training.ts
git add .
git commit -m "SOS295 이미지 base64 전달 및 자동 재시도 확대"
git push
```

---

## 배포 후

**「다시 대기열에」 한 번만 누르고 두셔도 됩니다.**

cron이 10분마다 최대 8회까지 알아서 시도합니다.
급하면 「지금 1건 생성」으로 즉시 진행할 수 있습니다.

한 시간쯤 뒤에 확인해 보시고, 그때도 안 되어 있으면 알려주세요.

---

## 아직 남은 것

**막힌 작업을 알려주는 장치가 없습니다.**

8회까지 시도하고도 실패하면 여전히 조용히 멈춥니다.
관리자 화면 상단에 **"막힌 작업 N건"** 배지를 띄우면
로그인할 때마다 눈에 들어와서 놓치지 않습니다.

필요하시면 만들어 드리겠습니다. 우선 이번 건이 통과하는지 보시죠.

**그리고 여러 번 실패했을 때 문항 수를 줄여서라도(10 → 6) 내보낼지**는
학습 품질에 관한 판단이라 사장님 결정이 필요합니다.
완벽한 10문항을 기다리는 것보다 학생 학습이 이어지는 게 나을 수도 있습니다.
