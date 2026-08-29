# SOS318 · 문제인식 검수 박스를 실제 자르기 영역으로

**파일 1개.** SQL 없음. 빌드 확인 완료(49/49).

```
src\app\problem-bank\ai-upload\page.tsx
```

---

## 먼저 · 자르기는 정상이었습니다

문제은행에서 확인한 16·17·18번은 문항번호부터 선택지까지 온전했고,
18번은 표준정규분포표까지 정확히 들어가 있었습니다.

**잘못된 것은 검수 화면의 녹색 박스뿐이었습니다.**

## 원인

`recognitionDisplayRect`가 **저장된 자르기 좌표를 쓰지 않고 다시 계산**했습니다.

```ts
const top = Math.max(0, anchor.topPct - 2.6);
const bottom = Math.min(100, anchor.bottomPct);
```

- 위: 문항번호 위치에서 2.6% 위 — 이 값이 실제 문항번호 줄 높이와 맞지 않아
  박스가 한 줄쯤 아래에서 시작했습니다
- 아래: 같은 단의 다음 문항번호까지, 마지막 문항이면 단 끝까지 —
  그래서 빈 공간이 길게 남았습니다

결과적으로 **자르기는 멀쩡한데 검수 화면만 "첫 줄이 잘린 것처럼"** 보였습니다.

## 고친 방법

검수 화면의 목적은 "실제로 이렇게 잘립니다"를 확인하는 것이므로,
**저장된 crop 좌표를 그대로 표시**합니다.

```ts
const rect = questionRect(question);
if (rect.width > 0 && rect.height > 0) return rect;
```

이제 녹색 박스 = 실제 저장되는 이미지입니다.

자르기 좌표가 아직 없는 문항(수동 추가 직후 등)만 예전처럼
문항번호 위치로 임시 표시합니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\problem-bank\ai-upload\page.tsx ai-upload-page.bak
```

`SOS318` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS318" src\app\problem-bank\ai-upload\page.tsx
git add .
git commit -m "SOS318 검수 박스를 실제 자르기 영역으로 표시"
git push
```

---

## 배포 후 확인

같은 시험지의 문제인식 검수 화면을 다시 열어보세요.

- 녹색 박스가 **문항번호부터 선택지 끝까지** 딱 맞게 잡혀야 합니다
- 아래로 길게 남던 빈 공간이 사라집니다
- 박스 안 내용 = 문제은행에 저장된 이미지

**박스와 실제 결과가 다르면** 그건 진짜 자르기 문제이므로 알려주세요.
이제 박스만 보고도 판단하실 수 있습니다.
