#!/usr/bin/env python3
"""
OCR de captcha via EasyOCR.
Uso: python3 ocr-captcha.py <image-path>
Imprime o texto reconhecido em stdout (lowercase, só [a-z0-9]).
"""
import sys
import re

import easyocr

ALLOW = "abcdefghijklmnopqrstuvwxyz0123456789"


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: ocr-captcha.py <image-path>", file=sys.stderr)
        return 2

    image_path = sys.argv[1]

    # gpu=False força CPU (Railway não tem GPU). verbose=False evita poluir stdout.
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)

    result = reader.readtext(
        image_path,
        allowlist=ALLOW,
        detail=0,
        paragraph=False,
    )

    text = "".join(result).lower()
    text = re.sub(r"[^a-z0-9]", "", text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
