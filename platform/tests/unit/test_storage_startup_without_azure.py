"""
The platform must import and start when azure-storage-blob is not installed.

Each check runs in a fresh interpreter that blocks only ``azure.storage.blob``.
Application Insights and the other Azure packages stay available.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.platform.settings import Settings

PLATFORM_DIR = Path(__file__).resolve().parents[2]
STORAGE_REFERENCE = re.compile(r"blob_storage|blob_service|audio_capture")
AZURE_PROVIDER = PLATFORM_DIR / "app" / "providers" / "azure_blob_storage.py"

BLOCK_AZURE_BLOB = textwrap.dedent(
    """
    import importlib.abc
    import sys

    class BlockAzureBlob(importlib.abc.MetaPathFinder):
        def find_spec(self, name, path=None, target=None):
            if name == "azure.storage.blob" or name.startswith("azure.storage.blob."):
                raise ModuleNotFoundError(f"blocked for test: {name}", name=name)

    sys.meta_path.insert(0, BlockAzureBlob())
    try:
        import azure.storage.blob
    except ImportError:
        pass
    else:
        raise SystemExit("test setup error: azure.storage.blob is not blocked")
    """
)


def _storage_modules() -> list[str]:
    modules = ["app.main"]
    for path in (PLATFORM_DIR / "app").rglob("*.py"):
        if path == AZURE_PROVIDER or not STORAGE_REFERENCE.search(path.read_text(encoding="utf-8")):
            continue
        parts = path.relative_to(PLATFORM_DIR).with_suffix("").parts
        modules.append(".".join(parts[:-1] if parts[-1] == "__init__" else parts))
    return sorted(set(modules) | {"app.providers.object_store_blob_storage"})


def _run(code: str, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", BLOCK_AZURE_BLOB + textwrap.dedent(code)],
        cwd=PLATFORM_DIR,
        env={**os.environ, "APPLICATIONINSIGHTS_CONNECTION_STRING": "", **env},
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_storage_modules_are_found() -> None:
    modules = _storage_modules()

    assert "app.providers.blob_storage" in modules
    assert "app.services.content_service" in modules
    assert "app.services.audio.audio_capture" in modules


def test_platform_modules_that_touch_storage_import_without_azure_blob() -> None:
    result = _run(
        f"""
        import importlib

        for name in {_storage_modules()!r}:
            importlib.import_module(name)

        from app.providers.blob_storage import get_blob_storage_provider

        print(type(get_blob_storage_provider()).__name__)
        assert "azure.storage.blob" not in sys.modules
        """,
        OBJECT_STORE_ENDPOINT_URL="http://minio.test:9000",
    )

    assert result.returncode == 0, result.stderr[-2000:]
    assert result.stdout.strip().splitlines()[-1] == "ObjectStoreBlobStorageProvider"


def test_azure_backend_without_azure_blob_says_how_to_fix_it() -> None:
    result = _run(
        """
        from app.providers.blob_storage import get_blob_storage_provider

        try:
            get_blob_storage_provider()
        except RuntimeError as exc:
            print(exc)
        """,
        STORAGE_BACKEND="azure",
    )

    assert result.returncode == 0, result.stderr[-2000:]
    assert "STORAGE_BACKEND=azure needs the azure-storage-blob package" in result.stdout
    assert "poetry install -E azure" in result.stdout


@pytest.mark.parametrize(
    ("backend", "shown"),
    [(None, "unset"), ("", "unset"), ("mongodb", '"mongodb"')],
)
def test_unset_or_unsupported_storage_backend_names_the_fix(monkeypatch, backend, shown):
    monkeypatch.delenv("STORAGE_BACKEND")
    kwargs = {} if backend is None else {"storage_backend": backend}
    with pytest.raises(ValidationError) as caught:
        Settings(_env_file=None, **kwargs)
    assert f"STORAGE_BACKEND is {shown}. Set STORAGE_BACKEND to object-store or azure." in str(caught.value)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"object_store_endpoint_url": ""}, "OBJECT_STORE_ENDPOINT_URL is not set"),
        ({"object_store_bucket_name": ""}, "OBJECT_STORE_BUCKET_NAME is not set"),
    ],
)
def test_object_store_backend_needs_endpoint_and_bucket_at_start_up(overrides, message):
    kwargs = {"storage_backend": "object-store", "object_store_endpoint_url": "http://s:9000", "object_store_bucket_name": "b"}
    with pytest.raises(ValidationError, match=message):
        Settings(_env_file=None, **{**kwargs, **overrides})


def test_blob_container_follows_the_backend():
    azure = Settings(_env_file=None, storage_backend="azure", azure_storage_container="az-box")
    store = Settings(
        _env_file=None,
        storage_backend="object-store",
        object_store_endpoint_url="http://s:9000",
        object_store_bucket_name="remediation",
    )

    assert azure.blob_container == "az-box"
    assert store.blob_container == "remediation"
