from __future__ import annotations

import struct

_INT32_SIGN = 0x80000000
_UINT32_MASK = 0xFFFFFFFF
_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"
def _to_base36(value: int) -> str:
    if value == 0:
        return "0"
    digits = []
    while value:
        value, rem = divmod(value, 36)
        digits.append(_BASE36[rem])
    return "".join(reversed(digits))


def sdk_rolling_hash(text: str) -> str:
    encoded = text.encode("utf-16-le", errors="surrogatepass")
    units = struct.unpack(f"<{len(encoded) // 2}H", encoded)
    hash_value = 0
    for unit in units:
        hash_value = (hash_value * 31 + unit) & _UINT32_MASK
    if hash_value & _INT32_SIGN:
        hash_value -= 1 << 32
    return "t" + _to_base36(abs(hash_value))
