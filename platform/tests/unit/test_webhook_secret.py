from __future__ import annotations

import pytest
from cryptography.fernet import Fernet, InvalidToken
from pydantic import ValidationError

from app.platform.auth import webhook_secret
from app.platform.auth.webhook_secret import decrypt_secret, encrypt_secret, reencrypt_secret
from app.platform.settings import get_settings
from app.repositories.content_aggregator_webhook_repository import SECRET_ENCRYPTED_FIELD
from tools import reencrypt_webhook_secrets
from tools.reencrypt_webhook_secrets import reencrypt_all

OLD_KEY = Fernet.generate_key().decode("utf-8")
NEW_KEY = Fernet.generate_key().decode("utf-8")


@pytest.fixture
def use_keys(monkeypatch):
    def _use(value):
        monkeypatch.setenv("WEBHOOK_SECRET_ENCRYPTION_KEY", value)
        get_settings.cache_clear()
        webhook_secret._get_fernet.cache_clear()

    yield _use
    get_settings.cache_clear()
    webhook_secret._get_fernet.cache_clear()


def test_multi_key_encrypts_with_first_and_decrypts_with_any(use_keys):
    use_keys(OLD_KEY)
    old_token = encrypt_secret("s3cret")

    use_keys(f"{NEW_KEY},{OLD_KEY}")
    assert decrypt_secret(old_token) == "s3cret"
    assert Fernet(NEW_KEY.encode("utf-8")).decrypt(encrypt_secret("s3cret").encode("utf-8")) == b"s3cret"


def test_reencrypt_secret_moves_token_to_first_key(use_keys):
    use_keys(OLD_KEY)
    old_token = encrypt_secret("s3cret")

    use_keys(f"{NEW_KEY},{OLD_KEY}")
    rotated = reencrypt_secret(old_token)

    use_keys(NEW_KEY)
    assert decrypt_secret(rotated) == "s3cret"
    with pytest.raises(InvalidToken):
        decrypt_secret(old_token)


def test_encryption_key_entries_are_stripped(use_keys):
    use_keys(f" {NEW_KEY} , {OLD_KEY} ")
    assert get_settings().webhook_secret_encryption_key == f"{NEW_KEY},{OLD_KEY}"


@pytest.mark.parametrize("value", ["", " ", f"{NEW_KEY},", f"{NEW_KEY}, ,{OLD_KEY}", "not-a-fernet-key"])
def test_invalid_or_empty_encryption_key_entries_rejected(use_keys, value):
    use_keys(value)
    with pytest.raises(ValidationError):
        get_settings()


async def test_reencrypt_all_rotates_every_secret(db, use_keys):
    col = db["contentAggregatorWebhooks"]
    use_keys(OLD_KEY)
    await col.insert_many([{"_id": i, SECRET_ENCRYPTED_FIELD: encrypt_secret(f"s{i}")} for i in range(2)])

    use_keys(f"{NEW_KEY},{OLD_KEY}")
    assert await reencrypt_all(col) == (2, [])

    use_keys(NEW_KEY)
    for i in range(2):
        doc = await col.find_one({"_id": i})
        assert decrypt_secret(doc[SECRET_ENCRYPTED_FIELD]) == f"s{i}"


async def test_reencrypt_all_does_not_overwrite_concurrently_rotated_secret(db, use_keys, monkeypatch):
    col = db["contentAggregatorWebhooks"]
    use_keys(OLD_KEY)
    await col.insert_one({"_id": 1, SECRET_ENCRYPTED_FIELD: encrypt_secret("stale")})

    use_keys(f"{NEW_KEY},{OLD_KEY}")
    concurrent = encrypt_secret("fresh")

    def _rotate_during_read(token):
        col._collection.update_one({"_id": 1}, {"$set": {SECRET_ENCRYPTED_FIELD: concurrent}})
        return reencrypt_secret(token)

    monkeypatch.setattr(reencrypt_webhook_secrets, "reencrypt_secret", _rotate_during_read)
    assert await reencrypt_all(col) == (0, [1])
    doc = await col.find_one({"_id": 1})
    assert doc[SECRET_ENCRYPTED_FIELD] == concurrent
