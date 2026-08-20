# SOS277 · 문항 이미지 잘림 — 진짜 원인 수정

**파일 1개.** SOS276 위에 덮어쓰세요. 빌드 확인 완료.

```
src\app\problem-bank\difficulty\page.tsx
```

---

## 확인된 사실

원본 이미지를 새 탭에서 열어보니 `032.webp (760×1004)` 로 **온전했습니다.**

- 크롭 파이프라인은 정상입니다
- 저장된 이미지는 멀쩡합니다
- 학생 화면도 문제없습니다
- 잘린 건 이 관리자 화면의 표시뿐입니다

## SOS276이 왜 부족했나

styled-jsx는 선택자를 변환할 때 **앞부분에도** 스코프 클래스를 붙입니다.

```css
/* 작성 */  .test-image-scroll :global(img) { ... }
/* 변환 */  .test-image-scroll.jsx-XXXX img { ... }
```

그런데 `.test-image-scroll` div는 `TestProblemImage`라는 **별도 컴포넌트 함수**
안에서 만들어지므로 `jsx-XXXX` 클래스가 붙지 않습니다.
`:global(img)`를 써도 **선택자 앞부분에서 이미 매칭이 깨집니다.**

같은 이유로 `.test-image-scroll` 자체 규칙(width / height / overflow)도
**한 번도 적용된 적이 없었습니다.** 그래서 이미지가 원본 760px 그대로 그려지고,
카드 폭을 넘어가는 부분이 잘려나갔습니다.

## 고친 방법

CSS 스코프 규칙에 기대지 않고 **인라인 스타일로 고정**했습니다.

```tsx
<div style={{ width:"100%", height:"100%", overflowY:"auto", overflowX:"auto", ... }}>
  <img style={{ display:"block", width:"100%", maxWidth:"100%", height:"auto" }} />
</div>
```

인라인 스타일은 styled-jsx 스코프와 무관하게 항상 적용됩니다.
로딩·실패 문구도 같은 이유로 스타일이 빠져 있어 함께 처리했습니다.

기존 CSS 규칙은 `:global(...)`로 바꿔 두었습니다(중복이지만 오해 방지용).

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\problem-bank\difficulty\page.tsx difficulty-page.SOS276.bak
```

파일 덮어쓴 뒤:

```
findstr "SOS277" src\app\problem-bank\difficulty\page.tsx
git add .
git commit -m "SOS277 난이도 화면 문항 이미지 인라인 스타일 고정"
git push
```

배포 후 **Ctrl+Shift+R** 로 강력 새로고침하고 확인하세요.
이미지가 카드 폭에 맞게 축소되어 전체가 보이면 정상입니다.

---

## 정정

앞서 "크롭 자체가 잘못됐을 수 있다", "학생도 잘린 문제를 보고 있을 수 있다"고
말씀드린 것은 **틀렸습니다.** 원본 이미지는 온전했고, 화면 표시만의 문제였습니다.
난이도 판정에 쓰인 이미지도 온전했으므로 기존 판정 결과는 그대로 유효합니다.
