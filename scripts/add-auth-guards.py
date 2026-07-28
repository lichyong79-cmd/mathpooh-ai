#!/usr/bin/env python3
"""
src/app/api 아래 모든 route.ts의 export된 HTTP 핸들러 맨 앞에
로그인 확인 가드를 넣습니다. 이미 들어간 파일은 건너뜁니다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "src" / "app" / "api"

IMPORT_LINE = 'import { requireUser } from "@/lib/supabase/auth";'
GUARD = (
    "  const denied = await requireUser();\n"
    "  if (denied) return denied;\n"
)

HANDLER = re.compile(
    r"export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(",
    re.MULTILINE,
)


def body_brace_index(text: str, paren_open: int) -> int:
    """파라미터 목록의 여는 괄호 위치를 받아, 함수 본문 '{'의 인덱스를 돌려줍니다."""
    depth = 0
    i = paren_open
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                break
        i += 1
    # 닫는 괄호 뒤 첫 '{' 가 함수 본문입니다. (반환 타입 표기가 있어도 안전)
    return text.index("{", i)


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")

    if "requireUser" in text:
        return "skip (이미 적용됨)"

    matches = list(HANDLER.finditer(text))
    if not matches:
        return "skip (핸들러 없음)"

    # 뒤에서부터 넣어야 앞쪽 인덱스가 밀리지 않습니다.
    for m in reversed(matches):
        paren = text.index("(", m.end() - 1)
        brace = body_brace_index(text, paren)
        text = text[: brace + 1] + "\n" + GUARD + text[brace + 1 :]

    # import를 마지막 import 줄 뒤에 붙입니다.
    lines = text.split("\n")
    last_import = max(
        (i for i, l in enumerate(lines) if l.startswith("import ")), default=-1
    )
    lines.insert(last_import + 1, IMPORT_LINE)
    text = "\n".join(lines)

    path.write_text(text, encoding="utf-8")
    return f"patched ({len(matches)}개 핸들러)"


def main() -> int:
    routes = sorted(API_DIR.rglob("route.ts"))
    if not routes:
        print("route.ts를 찾지 못했습니다.", file=sys.stderr)
        return 1
    for route in routes:
        print(f"{route.relative_to(ROOT)} :: {patch(route)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
