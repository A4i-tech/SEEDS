from __future__ import annotations

import struct

import numpy as np

_INT32_SIGN = 0x80000000
_UINT32_MASK = 0xFFFFFFFF


def sdk_rolling_hash(text: str) -> str:
    encoded = text.encode("utf-16-le", errors="surrogatepass")
    units = struct.unpack(f"<{len(encoded) // 2}H", encoded)
    hash_value = 0
    for unit in units:
        hash_value = (hash_value * 31 + unit) & _UINT32_MASK
    if hash_value & _INT32_SIGN:
        hash_value -= 1 << 32
    return "t" + np.base_repr(abs(hash_value), 36).lower()
