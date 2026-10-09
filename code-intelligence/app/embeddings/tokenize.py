"""Code-aware tokenization shared by the local embedding provider.

Splits code/prose into lowercase tokens, additionally exploding
camelCase and snake_case identifiers (e.g. "AuthService" ->
["authservice", "auth", "service"]) so natural-language queries can
match identifier fragments, and emitting a fixed-length prefix for
longer words (a cheap stand-in for stemming) so "authentication" and
"authenticate" share a token ("authen") instead of only matching on
exact word equality.
"""

from __future__ import annotations

import re

_WORD_RE = re.compile(r"[A-Za-z0-9]+")
_CAMEL_RE = re.compile(r"[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])")
_STEM_PREFIX_LEN = 6


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []

    def add(word: str) -> None:
        lowered = word.lower()
        tokens.append(lowered)
        if len(lowered) > _STEM_PREFIX_LEN:
            tokens.append(lowered[:_STEM_PREFIX_LEN])

    for word in _WORD_RE.findall(text):
        add(word)
        parts = _CAMEL_RE.findall(word)
        if len(parts) > 1:
            for part in parts:
                add(part)
    return tokens
