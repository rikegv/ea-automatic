"""Fixtures comuns. Define um token interno determinístico, isola o cache de settings e
aponta o STAGING_DIR para uma pasta temporária dedicada (o guard de path traversal exige
que os arquivos estejam contidos nela).

Gemini e Drive são SEMPRE mockados nos testes — nenhuma chamada de rede no pytest.
"""

import os
import tempfile
from pathlib import Path

import pytest

os.environ["INTERNAL_TOKEN"] = "test-token"
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "./credentials.json")
os.environ["APP_ENV"] = "dev"

# Staging de teste: pasta real e isolada. Resolvida para casar com o guard (Path.resolve()).
_STAGING = str(Path(tempfile.mkdtemp(prefix="ea-test-staging-")).resolve())
os.environ["STAGING_DIR"] = _STAGING

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

TOKEN = "test-token"
AUTH = {"X-Internal-Token": TOKEN}


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return AUTH


@pytest.fixture
def staging_dir() -> Path:
    """Diretório de staging de teste (== STAGING_DIR). Arquivos aqui passam no guard."""
    return Path(_STAGING)
