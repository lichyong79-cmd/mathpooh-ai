#!/usr/bin/env python3
"""
브라우저에서 Supabase REST/Storage를 직접 fetch할 때 쓰던
`apikey: config.key, Authorization: Bearer <anon key>` 조합을
로그인 사용자 토큰을 넣는 `...(await authHeaders())`로 바꿉니다.

한 줄/여러 줄/공백 없는 압축 형태를 모두 처리합니다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TARGETS = [
    "src/app/page.tsx",
    "src/app/problem-bank/page.tsx",
    "src/app/pdf-mapper/page.tsx",
]

IMPORT_LINE = 'import { authHeaders } from "@/lib/supabase/rest";'

PATTERN = re.compile(
    r"apikey\s*:\s*config\.key\s*,\s*Authorization\s*:\s*`Bearer \$\{config\.key\}`"
)
REPLACEMENT = "...(await authHeaders())"


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")

    if "authHeaders" in text:
        return "skip (이미 적용됨)"

    text, count = PATTERN.subn(REPLACEMENT, text)
    if count == 0:
        return "skip (대상 없음)"

    lines = text.split("\n")
    last_import = max(
        (i for i, l in enumerate(lines) if l.startswith("import ")), default=-1
    )
    lines.insert(last_import + 1, IMPORT_LINE)
    path.write_text("\n".join(lines), encoding="utf-8")

    return f"patched ({count}곳)"


def main() -> int:
    for rel in TARGETS:
        path = ROOT / rel
        if not path.exists():
            print(f"{rel} :: 없음", file=sys.stderr)
            continue
        print(f"{rel} :: {patch(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
