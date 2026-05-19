#!/usr/bin/env python3
"""
Pré-carrega os modelos do EasyOCR durante o build do Railway.
Sem isso, o primeiro request em produção pagaria ~3-5s baixando
craft_mlt_25k.pth (~80MB) + english_g2.pth (~80MB) para /root/.EasyOCR/.
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")

_RAILWAY_DEPS = "/app/python-packages"
if os.path.isdir(_RAILWAY_DEPS) and _RAILWAY_DEPS not in sys.path:
    sys.path.insert(0, _RAILWAY_DEPS)

import easyocr

# Salva modelos em /app pra garantir que ficam na imagem final do Railway
# (/root/ nem sempre é preservado entre build e deploy).
MODEL_DIR = "/app/easyocr-models"
os.makedirs(MODEL_DIR, exist_ok=True)

easyocr.Reader(
    ["en"],
    gpu=False,
    verbose=False,
    model_storage_directory=MODEL_DIR,
)
print(f"EasyOCR models cached em {MODEL_DIR}")
