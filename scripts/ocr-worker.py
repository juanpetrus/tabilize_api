#!/usr/bin/env python3
"""
Worker OCR PERSISTENTE para o captcha do CNDT.

Diferença para ocr-segmented.py (one-shot CLI): este processo carrega o
easyocr.Reader UMA única vez e fica em loop lendo caminhos de imagem do
stdin (um por linha), devolvendo o texto reconhecido no stdout.

Assim o Node reaproveita o MESMO processo nas N tentativas de captcha (e
entre requests), eliminando o cold-start (import torch + load do modelo)
que estourava o timeout de 30s no Railway a cada spawn.

Protocolo (uma linha por mensagem):
  stdin :  <caminho-da-imagem>\n
  stdout:  <texto-reconhecido>\n   (linha vazia = não conseguiu ler)
  Ao terminar de carregar o modelo, imprime "__READY__" no stdout.

Reusa a segmentação + OCR de ocr-segmented.py (arquivo com hífen → importlib).
"""
import sys
import os
import importlib.util
import warnings

warnings.filterwarnings("ignore")

# No Railway, pacotes pip vão para /app/python-packages (--target).
_RAILWAY_DEPS = "/app/python-packages"
_ON_RAILWAY = os.path.isdir(_RAILWAY_DEPS)
if _ON_RAILWAY and _RAILWAY_DEPS not in sys.path:
    sys.path.insert(0, _RAILWAY_DEPS)

# Reusa a lógica de segmentação + OCR já testada (segment_chars, ocr_one).
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "ocr_segmented", os.path.join(_HERE, "ocr-segmented.py")
)
_seg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_seg)

import easyocr


def _build_reader():
    """Cria o Reader uma vez. Em produção exige modelo local (sem download)."""
    model_dir = _seg._MODEL_DIR  # /app/easyocr-models se existir, senão None

    if _ON_RAILWAY:
        # Baixar ~160MB de pesos em runtime trava e estoura o timeout.
        # Falha alto pra deixar claro no log do Railway que o cache do
        # build não chegou na imagem (deploy.inputs do railpack).
        if not model_dir:
            print(
                "FATAL: /app/easyocr-models ausente — modelo não foi "
                "pré-baixado no build (verifique deploy.inputs no railpack.json).",
                file=sys.stderr,
                flush=True,
            )
            sys.exit(3)
        pths = [f for f in os.listdir(model_dir) if f.endswith(".pth")]
        if not pths:
            print(
                f"FATAL: {model_dir} existe mas não contém pesos .pth.",
                file=sys.stderr,
                flush=True,
            )
            sys.exit(3)

    kwargs = {"gpu": False, "verbose": False}
    if model_dir:
        kwargs["model_storage_directory"] = model_dir
        kwargs["download_enabled"] = False  # nunca baixar em runtime
    return easyocr.Reader(["en"], **kwargs)


def _recognize(reader, image_path: str) -> str:
    """Segmenta + OCR de um captcha. Retorna 6 chars ou '' se incompleto."""
    chars, _ = _seg.segment_chars(image_path)
    if not chars:
        return ""

    pieces = []
    missing = 0
    for ch_img in chars:
        c = _seg.ocr_one(reader, ch_img)
        if c:
            pieces.append(c)
        else:
            pieces.append("?")
            missing += 1

    # Se faltou algum char, devolve vazio: o Node prefere recarregar o
    # captcha a submeter uma string incompleta.
    return "" if missing > 0 else "".join(pieces)


def main() -> int:
    reader = _build_reader()
    # Sinaliza ao Node que o modelo já está em memória e pronto pra uso.
    print("__READY__", flush=True)

    # readline() (em vez de `for line in sys.stdin`) evita o read-ahead
    # buffering do iterador, que poderia segurar a linha até o buffer encher.
    while True:
        line = sys.stdin.readline()
        if not line:  # EOF → Node fechou o stdin / encerrou o worker
            break
        path = line.strip()
        if not path:
            print("", flush=True)
            continue
        try:
            print(_recognize(reader, path), flush=True)
        except Exception as e:
            # Um captcha ruim nunca pode derrubar o worker.
            print("", flush=True)
            print(f"erro OCR: {e}", file=sys.stderr, flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
