#!/usr/bin/env python3
"""
OCR de captcha por SEGMENTAÇÃO:
1. binariza imagem (texto preto isolado)
2. acha contornos / connected components
3. filtra por tamanho de caractere
4. ordena esquerda → direita
5. OCR cada caractere isoladamente
6. junta resultados

Uso: python3 ocr-segmented.py <image-path> [--debug-dir <dir>]
"""
import sys
import os
import re
import warnings

warnings.filterwarnings("ignore")

# No Railway, pacotes pip vão pra /app/python-packages via --target.
# Localmente (dev), site-packages padrão do venv/system Python.
_RAILWAY_DEPS = "/app/python-packages"
if os.path.isdir(_RAILWAY_DEPS) and _RAILWAY_DEPS not in sys.path:
    sys.path.insert(0, _RAILWAY_DEPS)

import cv2
import numpy as np
import easyocr

ALLOW = "abcdefghijklmnopqrstuvwxyz0123456789"

# Em produção (Railway), modelos foram pré-baixados aqui no build.
# Localmente, EasyOCR cai no default (~/.EasyOCR/).
_MODEL_DIR = "/app/easyocr-models" if os.path.isdir("/app/easyocr-models") else None


def segment_chars(image_path: str, debug_dir: str | None = None):
    """Retorna lista de imagens, uma por caractere candidato, esq→dir."""
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return [], None

    # Resize 4x para ter resolução
    h, w = img.shape
    img = cv2.resize(img, (w * 4, h * 4), interpolation=cv2.INTER_CUBIC)

    # Binariza: texto preto, fundo branco (OTSU acha threshold automático)
    _, bin_img = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Inverte: agora objetos (texto + círculos) ficam brancos, fundo preto.
    inverted = cv2.bitwise_not(bin_img)

    # ─── Limpeza morfológica ──────────────────────────────────────────────
    # OPENING 5x5 apaga linhas finas dos círculos.
    # Pode comer um pouco dos chars finos, mas isso é só pra SEGMENTAR (achar
    # posições). O OCR vai usar os pixels originais mascarados.
    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    opened = cv2.morphologyEx(inverted, cv2.MORPH_OPEN, open_kernel)

    # Closing pequeno reconecta gaps dos chars
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, close_kernel)

    # Dilata o cleaned para virar uma "máscara" que cobre o stroke completo
    # do char (não só o miolo erodido). Vai servir pra recortar pixels do
    # original sem trazer os círculos.
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.dilate(cleaned, dilate_kernel, iterations=1)

    # Connected components
    num, _, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)

    H, W = cleaned.shape

    candidates = []
    all_components = []
    for i in range(1, num):  # skip 0 = background
        x, y, cw, ch, area = stats[i]
        bbox_area = max(cw * ch, 1)
        solidity = area / bbox_area
        all_components.append(
            f"#{i} pos=({x},{y}) w={cw} h={ch} area={area} solid={solidity:.2f}"
        )

        # Filtros heurísticos relaxados:
        if area < 150 or area > W * H * 0.25:
            continue
        if ch < H * 0.2 or ch > H * 0.95:
            continue
        if cw < 15 or cw > W * 0.30:
            continue
        # Solidity > 0.18 descarta círculos ocos
        if solidity < 0.18:
            continue

        pad = 10
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(W, x + cw + pad)
        y1 = min(H, y + ch + pad)

        # Aplica a máscara dilatada nos pixels INVERTIDOS originais
        # (inverted = chars+círculos brancos sobre fundo preto):
        # pixels da máscara são onde EXISTE char → pega pixels do original.
        # Demais → pinta de preto. Resultado: só o char, sem círculos.
        crop_mask = mask[y0:y1, x0:x1]
        crop_inv = inverted[y0:y1, x0:x1]
        char_only = cv2.bitwise_and(crop_inv, crop_mask)

        # Inverte para black-on-white (formato natural pra OCR)
        crop = cv2.bitwise_not(char_only)

        # Margem branca melhora OCR de char isolado
        crop = cv2.copyMakeBorder(crop, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=255)

        candidates.append({"x": x, "img": crop, "w": cw, "solidity": solidity})

    candidates.sort(key=lambda c: c["x"])

    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "_01-binary.png"), bin_img)
        cv2.imwrite(os.path.join(debug_dir, "_02-opened.png"), opened)
        cv2.imwrite(os.path.join(debug_dir, "_03-cleaned.png"), cleaned)
        for idx, c in enumerate(candidates):
            cv2.imwrite(
                os.path.join(debug_dir, f"char-{idx:02d}.png"),
                c["img"],
            )
        print(
            f"  total components: {len(all_components)}, passaram: {len(candidates)}",
            file=sys.stderr,
        )
        for line in all_components:
            print(f"    {line}", file=sys.stderr)

    return [c["img"] for c in candidates], bin_img


def ocr_one(reader, img_array) -> str:
    """OCR de uma única imagem (esperado: 1 caractere)."""
    # EasyOCR aceita ndarray
    result = reader.readtext(
        img_array,
        allowlist=ALLOW,
        detail=0,
        paragraph=False,
        text_threshold=0.3,
        low_text=0.2,
        link_threshold=0.2,
        width_ths=2.0,
    )
    s = re.sub(r"[^a-z0-9]", "", "".join(result).lower())
    return s[:1] if s else ""  # primeiro char só, já que é segmento


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: ocr-segmented.py <image-path> [--debug-dir <dir>]", file=sys.stderr)
        return 2

    image_path = sys.argv[1]
    debug_dir = None
    if "--debug-dir" in sys.argv:
        debug_dir = sys.argv[sys.argv.index("--debug-dir") + 1]

    chars, _ = segment_chars(image_path, debug_dir=debug_dir)

    if not chars:
        print("", flush=True)
        return 0

    reader_kwargs = {"gpu": False, "verbose": False}
    if _MODEL_DIR:
        reader_kwargs["model_storage_directory"] = _MODEL_DIR
    reader = easyocr.Reader(["en"], **reader_kwargs)

    pieces = []
    for ch_img in chars:
        c = ocr_one(reader, ch_img)
        pieces.append(c if c else "?")

    text = "".join(pieces).replace("?", "")
    print(text, flush=True)

    # Diagnóstico para stderr (não atrapalha stdout consumido pelo Node)
    print(f"  segmentos: {len(chars)}  resultado: {text}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
