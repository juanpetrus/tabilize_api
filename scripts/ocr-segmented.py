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
EXPECTED_CHARS = 6  # captcha do TST tem sempre 6 caracteres

# Em produção (Railway), modelos foram pré-baixados aqui no build.
# Localmente, EasyOCR cai no default (~/.EasyOCR/).
_MODEL_DIR = "/app/easyocr-models" if os.path.isdir("/app/easyocr-models") else None


def _make_crop(bin_img, mask, x: int, y: int, w: int, h: int):
    """Recorta um pedaço da imagem original mascarado (sem círculos)."""
    H, W = bin_img.shape
    pad = 10
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(W, x + w + pad)
    y1 = min(H, y + h + pad)
    inv = cv2.bitwise_not(bin_img[y0:y1, x0:x1])
    crop_mask = mask[y0:y1, x0:x1]
    char_only = cv2.bitwise_and(inv, crop_mask)
    crop = cv2.bitwise_not(char_only)
    return cv2.copyMakeBorder(crop, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=255)


def _force_exact_count(candidates, target: int, bin_img, mask):
    """Ajusta a lista de candidatos para conter exatamente `target` itens."""
    # Caso 1: temos mais que o esperado → mantém os `target` mais largos
    # (chars verdadeiros são maiores que ruído residual).
    while len(candidates) > target:
        smallest_idx = min(
            range(len(candidates)),
            key=lambda i: candidates[i]["w"] * candidates[i]["solidity"],
        )
        candidates.pop(smallest_idx)

    # Caso 2: faltam segmentos → divide o mais largo em duas metades.
    # Repete até bater no target.
    while len(candidates) < target:
        if not candidates:
            break
        widest_idx = max(range(len(candidates)), key=lambda i: candidates[i]["w"])
        widest = candidates[widest_idx]
        w = widest["w"]
        if w < 30:
            break  # nada que valha a pena dividir

        # Pega a bbox real do componente (estamos recortando do bin_img/mask)
        # — para isso precisamos das stats originais. Como simplificação,
        # dividimos a IMAGEM JÁ RECORTADA do candidato no meio.
        img = widest["img"]
        ih, iw = img.shape[:2]
        # img tem margem de 25px de cada lado; ignora margem.
        inner_w = iw - 50
        if inner_w < 30:
            break

        mid = 25 + inner_w // 2
        left_img = img[:, :mid + 5]
        right_img = img[:, mid - 5:]

        candidates.pop(widest_idx)
        candidates.append(
            {"x": widest["x"], "img": left_img, "w": w // 2, "solidity": widest["solidity"]}
        )
        candidates.append(
            {
                "x": widest["x"] + w // 2,
                "img": right_img,
                "w": w // 2,
                "solidity": widest["solidity"],
            }
        )
        candidates.sort(key=lambda c: c["x"])

    return candidates


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

    # ─── Força EXATAMENTE 6 segmentos ─────────────────────────────────────
    # Captcha do TST sempre tem 6 chars. Usa isso pra recuperar erros de
    # segmentação:
    # - Se sobrou (>6): descarta o(s) menor(es) — provavelmente é(são) ruído
    # - Se faltou (<6): pega o(s) mais largo(s) e divide na vertical, pois
    #   provavelmente são 2 chars grudados num componente.
    candidates = _force_exact_count(candidates, EXPECTED_CHARS, bin_img, mask)

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


def _best_text(detail_result) -> str:
    """De um resultado detail=1, pega o texto com maior confiança."""
    if not detail_result:
        return ""
    detail_result.sort(key=lambda r: -r[2])  # ordena por confiança desc
    txt = re.sub(r"[^a-z0-9]", "", detail_result[0][1].lower())
    return txt[:1] if txt else ""


def ocr_one(reader, img_array) -> str:
    """OCR de um segmento (esperado: 1 caractere). Cascade de passes."""
    # 1ª passada: thresholds normais com allowlist
    r1 = reader.readtext(
        img_array,
        allowlist=ALLOW,
        detail=1,
        paragraph=False,
        text_threshold=0.3,
        low_text=0.2,
        link_threshold=0.2,
    )
    t = _best_text(r1)
    if t:
        return t

    # 2ª passada: thresholds muito baixos, sem allowlist (pega o que sair)
    r2 = reader.readtext(
        img_array,
        detail=1,
        paragraph=False,
        text_threshold=0.1,
        low_text=0.05,
        link_threshold=0.05,
    )
    t = _best_text(r2)
    if t:
        return t

    # 3ª passada: imagem aumentada 2x — às vezes resolve chars finos
    h, w = img_array.shape[:2]
    bigger = cv2.resize(img_array, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    r3 = reader.readtext(
        bigger,
        detail=1,
        paragraph=False,
        text_threshold=0.1,
        low_text=0.05,
        link_threshold=0.05,
    )
    return _best_text(r3)


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
    missing = 0
    for ch_img in chars:
        c = ocr_one(reader, ch_img)
        if c:
            pieces.append(c)
        else:
            # Segmento existe mas OCR não conseguiu ler.
            # Mantém placeholder pra preservar contagem - Node decide se vale
            # submeter (rejeitar string com '?' é melhor que submeter incompleto).
            pieces.append("?")
            missing += 1

    text = "".join(pieces)
    # Stdout limpo (sem '?') pra Node consumir, mas se faltou char, devolve vazio
    # — assim Node sabe que não tem string confiável e recarrega captcha.
    if missing > 0:
        print("", flush=True)
    else:
        print(text, flush=True)

    print(
        f"  segmentos: {len(chars)}  resultado: {text}  missing: {missing}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
