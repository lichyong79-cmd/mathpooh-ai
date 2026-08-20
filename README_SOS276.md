# SOS276 · 난이도 검증 화면에서 문항 이미지가 잘리던 문제

**파일 1개만 교체합니다.** SOS275를 먼저 적용한 뒤 이 파일로 덮어쓰세요.

```
src\app\problem-bank\difficulty\page.tsx
```

---

## 원인 — styled-jsx 범위 문제

이 페이지의 스타일은 `<style jsx>`(styled-jsx)로 작성돼 있습니다.
styled-jsx는 **같은 컴포넌트 안에서 직접 만든 태그에만** 스타일을 붙입니다.

문항 이미지는 `TestProblemImage`라는 **별도 컴포넌트 함수** 안에서 만들어집니다.

```tsx
function TestProblemImage(...) {
  return <div className="test-image-scroll"><img src={url} /></div>;
}
```

그래서 아래 규칙이 이 `<img>`에는 적용되지 않았습니다.

```css
.test-image-scroll img { width:100%; height:auto }   /* 적용 안 됨 */
```

결과적으로 이미지가 **원본 크기 그대로** 그려지고,
바깥 컨테이너의 `overflow-x:hidden`이 넘치는 오른쪽을 잘라냈습니다.
수식 오른쪽이 사라지고 선택지 ③이 안 보이던 게 이 때문입니다.

## 고친 내용

```css
.test-image-scroll :global(img){ display:block; width:100%; max-width:100%; height:auto }
```

`:global()`로 감싸 자식 컴포넌트의 `<img>`에도 적용되게 했습니다.
`.test-image-empty`(로딩·실패 문구)도 같은 이유로 스타일이 빠져 있어 함께 처리했습니다.

가로 넘침이 남는 경우를 대비해 `overflow-x`도 `hidden` → `auto`로 바꿨습니다.
잘라내는 대신 좌우로 스크롤해 확인할 수 있습니다.

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\problem-bank\difficulty\page.tsx difficulty-page.SOS275.bak
```
파일 덮어쓴 뒤:
```
findstr "SOS276" src\app\problem-bank\difficulty\page.tsx
git add .
git commit -m "SOS276 난이도 화면 문항 이미지 잘림 수정"
git push
```

## 배포 후 반드시 확인할 것

이번 건은 **화면 표시만의 문제가 아닐 수 있습니다.**

지금까지 AI는 이 화면과 같은 이미지 파일을 받아 난이도를 판정해 왔습니다.
화면이 잘린 것이 CSS 때문이라면 AI는 온전한 이미지를 봤을 것이고,
저장된 이미지 자체가 잘린 것이라면 AI도 반쪽 문제를 보고 판정한 것입니다.

배포 후 같은 문항을 다시 열어보세요.

- **이미지가 온전히 보인다** → CSS만의 문제였습니다. 기존 판정은 유효합니다.
- **여전히 잘려 있다** → 저장된 크롭 자체가 잘못된 것입니다.
  AI가 반쪽 문제를 보고 "재풀이 검증완료 · 정답대조 match"를 냈다는 뜻이므로,
  난이도 판정 이전에 크롭 파이프라인부터 손봐야 합니다.
  학생 화면도 같은 이미지를 쓰므로 더 급한 문제가 됩니다.
