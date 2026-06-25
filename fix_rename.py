#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Rename 'xuyên ngày' -> 'dài ngày' at raw byte level.
No encoding issues possible since we work with bytes directly.
"""

filepath = "index.html"
with open(filepath, "rb") as f:
    raw = f.read()

print(f"File: {len(raw)} bytes")

def replace_bytes(data, old_bytes, new_bytes):
    count = 0
    result = b""
    i = 0
    while i < len(data):
        if data[i:i+len(old_bytes)] == old_bytes:
            result += new_bytes
            i += len(old_bytes)
            count += 1
        else:
            result += data[i:i+1]
            i += 1
    return result, count

# From diagnostic:
# "xuyên" in file = bytes: 78 75 79 c3 aa 6e  (UTF-8 for 'xuyên')
# "Xuyên" in file = bytes: 58 75 79 c3 aa 6e  (UTF-8 for 'Xuyên')
# "XUYÊN" in file = bytes: 58 55 59 c3 8a 4e  (wait, check: 58=X,55=U,59=Y,c38a=Ê... hmm)
# Actually from: 585559c38a4e -> X U Y Ê N
# "ngày" in file = bytes: 6e 67 c3 a0 79  (UTF-8: n g à y)
# "NGÀY" in file = bytes: 4e 47 c3 80 59  (N G À Y)

# Target bytes for "dài ngày":
# "dài" = 64 c3 a0 69 (UTF-8: d à i)
# "Dài" = 44 c3 a0 69 (UTF-8: D à i)
# "DÀI" = 44 c3 80 49 (UTF-8: D À I) -- uppercase à = c3 80... wait
# Actually: À = U+00C0 = bytes c3 80 ; à = U+00E0 = bytes c3 a0
# So "dài" UTF-8: 64 c3 a0 69
#    "ngày" UTF-8: 6e 67 c3 a0 79

# From diagnostic:
# "xuyÃªn ngÃ y" in latin-1 view = "xuyên ngày" in UTF-8
# bytes for "xuyên ngày": 78 75 79 c3 aa 6e 20 6e 67 c3 a0 79
# bytes for "Xuyên ngày": 58 75 79 c3 aa 6e 20 6e 67 c3 a0 79
# bytes for "XUYÊN NGÀY": from hex 585559c38a4e204e47c3805 -> 58 55 59 c3 8a 4e 20 4e 47 c3 80 59

# Vietnamese "dài ngày" UTF-8:
# d=64, à=c3 a0, i=69, space=20, n=6e, g=67, à=c3 a0, y=79
# = 64 c3 a0 69 20 6e 67 c3 a0 79

# "Dài ngày" = 44 c3 a0 69 20 6e 67 c3 a0 79
# "DÀI NGÀY" = 44 c3 80 49 20 4e 47 c3 80 59  (D À I N G À Y)

replacements_bytes = [
    # xuyên ngày -> dài ngày (lowercase)
    (bytes.fromhex("787579c3aa6e206e67c3a079"), bytes.fromhex("64c3a069206e67c3a079")),
    # Xuyên ngày -> Dài ngày (sentence case)
    (bytes.fromhex("587579c3aa6e206e67c3a079"), bytes.fromhex("44c3a069206e67c3a079")),
    # XUYÊN NGÀY -> DÀI NGÀY (uppercase, from the comment block)
    # bytes from diagnostic: 585559c38a4e204e47c38059
    (bytes.fromhex("585559c38a4e204e47c38059"), bytes.fromhex("44c3804920 4e47c38059".replace(" ", ""))),
]

total = 0
data = raw
for old_b, new_b in replacements_bytes:
    data, count = replace_bytes(data, old_b, new_b)
    if count:
        print(f"OK ({count}x): {old_b.hex()} -> {new_b.hex()}")
        total += count
    else:
        print(f"NOT FOUND: {old_b.hex()}")

print(f"\nTotal: {total} replacements")

with open(filepath, "wb") as f:
    f.write(data)
print("File saved (binary).")
