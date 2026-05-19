#!/usr/bin/env python3
"""Testa EasyOCR em várias imagens com diferentes configs."""
import sys
import re

import easyocr

reader = easyocr.Reader(["en"], gpu=False, verbose=False)

ALLOW = "abcdefghijklmnopqrstuvwxyz0123456789"


def clean(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


for path in sys.argv[1:]:
    print(f"\n=== {path} ===")

    # 1) sem allowlist, sem paragraph
    r1 = reader.readtext(path, detail=0, paragraph=False)
    print(f"  sem-allow:   {r1} -> {clean(''.join(r1))!r}")

    # 2) sem allowlist, COM paragraph
    r2 = reader.readtext(path, detail=0, paragraph=True)
    print(f"  paragraph:   {r2} -> {clean(''.join(r2))!r}")

    # 3) com allowlist
    r3 = reader.readtext(path, allowlist=ALLOW, detail=0, paragraph=False)
    print(f"  allowlist:   {r3} -> {clean(''.join(r3))!r}")

    # 4) com allowlist + thresholds relaxados
    r4 = reader.readtext(
        path,
        allowlist=ALLOW,
        detail=0,
        paragraph=False,
        text_threshold=0.5,
        low_text=0.3,
        link_threshold=0.3,
    )
    print(f"  th-relax:    {r4} -> {clean(''.join(r4))!r}")
