"""
Pengganti minimal untuk orjson (pustaka Rust yang tidak tersedia di Android).

musicdl hanya memakai orjson.dumps (QQ Music) dan mengharapkan hasil bytes JSON yang ringkas
tanpa spasi dengan karakter non-ASCII apa adanya, sama seperti orjson asli.
"""
import json

JSONDecodeError = json.JSONDecodeError


def dumps(obj, default=None, option=None) -> bytes:
    return json.dumps(obj, default=default, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def loads(data):
    if isinstance(data, (bytes, bytearray, memoryview)):
        data = bytes(data).decode("utf-8")
    return json.loads(data)
