#!/usr/bin/env python3
"""
Pré-carrega os modelos do EasyOCR durante o build do Railway.
Sem isso, o primeiro request em produção pagaria ~3-5s baixando
craft_mlt_25k.pth (~80MB) + english_g2.pth (~80MB) para /root/.EasyOCR/.
"""
import warnings

warnings.filterwarnings("ignore")

import easyocr

# Instantiating Reader força download dos modelos para o cache do container.
easyocr.Reader(["en"], gpu=False, verbose=False)
print("EasyOCR models cached.")
