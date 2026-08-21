# SOS283 · 완료 후 해설 · 모르겠어요 · 모바일 대응

**파일 8개.** SQL 없음. 빌드 확인 완료. SOS282 위에 덮어쓰세요.

```
src\app\layout.tsx                              ← viewport 메타 (모바일 핵심)
src\app\page.tsx                                ← 해설 버튼·모달
src\app\student.css                             ← 해설·모르겠어요 스타일
src\app\api\student\sos-training\route.ts       ← 해설 조회 액션
src\components\sos-training-runner.tsx          ← 모르겠어요·숫자 키보드
src\components\admin-portal-sidebar.tsx         ← 모바일 서랍
src\components\admin-portal-sidebar.module.css  ← 모바일 서랍 스타일
src\app\problem-bank\difficulty\page.tsx        ← 좁은 화면 가로 넘침
```

---

## 1) 완료 후 문항 해설 보기

이전에는 **오답 교정 중 3회 실패해야만** 풀이가 공개되고,
성적표에서는 다시 볼 수 없었습니다.

이제 채점이 끝난 세션(COMPLETED / PASSED / RETRAIN)의 성적표에서
문항마다 **「해설 보기」** 버튼이 있고, 눌러서 모달로 확인합니다.

- **AI 유사문항** → 생성 시 만들어 둔 풀이 텍스트
- **문제은행 문항** → 등록 때 저장한 공식 해설 이미지(서명 URL, 30분)
- 둘 다 없으면 정답만 표시

서버 쪽은 새 액션 `item_solution`입니다.
**끝난 세션의, 본인 세션 문항만** 내려보냅니다.
진행 중에는 403이므로 SOS281에서 막은 사전 노출이 다시 열리지 않습니다.

> 기존 `/api/problem-bank/questions/[id]/solution-image`는 SOS280에서
> 학생 접근을 막았기 때문에 학생 전용 경로를 따로 만들었습니다.

## 2) 「모르겠어요」

답을 입력해야만 다음으로 넘어갈 수 있어서, 막힌 학생은 **찍는 수밖에** 없었습니다.
찍은 오답과 "몰라서 못 푼 것"은 학습 기록으로서 의미가 전혀 다릅니다.

정답 입력창 아래에 **「모르겠어요」** 버튼을 넣었습니다.

- 정답과 절대 일치하지 않는 값으로 저장 → 채점은 오답
- 오답 교정 단계에서 이 문항을 다시 다룸
- 활동 로그에 `unknown` 표시가 남아 나중에 구분 가능

**정답 입력창에 `inputMode="numeric"`도 함께 넣었습니다.**
정답은 -999~999 정수인데 모바일에서 문자 키보드가 떴습니다.

## 3) 모바일 — 근본 원인은 viewport 메타 부재였습니다

`src/app/layout.tsx`에 **viewport 메타가 아예 없었습니다.**

그래서 모바일 브라우저가 데스크톱 폭(980px)으로 가정하고 화면 전체를 축소해 그렸고,
글씨가 작아지는 것은 물론 **반응형 CSS의 `@media`도 의도대로 걸리지 않았습니다.**
관리자·학생 화면 모두에 영향을 주던 문제입니다.

```ts
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
};
```

### 관리자 사이드바 — 서랍 방식으로 교체

900px 이하에서 사이드바를 **78px 아이콘 막대**로 줄이고 라벨을 숨기던 방식이었습니다.

- 아이콘만으로는 메뉴 구분이 불가능합니다. 같은 기호가 여러 번 쓰입니다
  (`▤` 2회, `✦` 2회, `↗` 2회)
- **`.footer{display:none}`이라 SOS282에서 넣은 로그아웃 버튼까지 사라졌습니다**
- 좁은 화면에서 78px이 계속 자리를 차지합니다

이제 모바일에서는 **서랍(drawer)** 입니다.

- 좌측 상단 **☰** 버튼으로 열기
- 배경을 누르거나 **✕** 로 닫기, 메뉴를 고르면 자동으로 닫힘
- 라벨이 모두 보이고 **로그아웃 버튼도 보입니다**
- 본문이 화면 전체 폭을 씁니다

### 난이도 관리 화면

검색창 `min-width:300px` 때문에 좁은 화면에서 가로 스크롤이 생기던 것과
버튼 줄바꿈을 정리했습니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\layout.tsx layout.bak
copy src\app\page.tsx student-page.bak
copy src\app\student.css student-css.bak
copy src\app\api\student\sos-training\route.ts sos-training-route.bak
copy src\components\sos-training-runner.tsx training-runner.bak
copy src\components\admin-portal-sidebar.tsx admin-sidebar.bak
copy src\app\problem-bank\difficulty\page.tsx difficulty-page.bak
```

`SOS283` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS283" src\app\layout.tsx
git add .
git commit -m "SOS283 완료 후 해설·모르겠어요·모바일 대응"
git push
```

---

## 배포 후 확인

**핸드폰 세로로** 관리자 페이지에 들어가 보세요.

- 좌측 상단에 ☰ 버튼이 있고, 누르면 사이드바가 덮이며 열립니다
- 메뉴 라벨이 모두 보이고, 맨 아래에 계정명과 로그아웃 버튼이 있습니다
- 글씨가 예전처럼 작게 축소되지 않습니다

**학생 계정으로**

- 훈련 화면에서 정답 칸을 누르면 숫자 키보드가 뜹니다
- 「모르겠어요」 버튼이 보입니다
- 끝난 학습의 성적표에서 문항마다 「해설 보기」가 있습니다

---

## 남은 것

- **AI 파이프라인 시간 예산** — `maxDuration=300`인데 2회 시도 시 최대 460초.
  재시도를 1회로 줄이거나 단계별 타임아웃을 낮추는 조정이 필요합니다.
- 학생 화면 자체의 모바일 세부 조정은 이번에 손대지 않았습니다.
  viewport 메타가 들어갔으니 먼저 실제로 보시고, 어색한 화면이 있으면 알려주세요.
