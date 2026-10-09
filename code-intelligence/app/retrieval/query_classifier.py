"""A small heuristic query classifier - just enough to decide which
direction to traverse the graph in, and which identifiers in the
question look like they name real symbols worth looking up directly."""

from __future__ import annotations

import re

_INCOMING_PATTERNS = re.compile(
    r"\b(what|who|which \w+) calls\b|\bcallers? of\b|\bcalled by\b|\bdepends? on\b|\bwho uses\b|\bwhat uses\b",
    re.IGNORECASE,
)

# CamelCase identifiers ("PaymentService") or snake_case identifiers
# ("jwt_validator", "create_payment") that look like real code symbols.
_IDENTIFIER_RE = re.compile(r"\b[A-Z][a-zA-Z0-9]*(?:[a-z][A-Za-z0-9]*)?\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")

_STOPWORDS = {"How", "What", "Where", "Which", "Who", "Why", "The", "This", "That"}


def classify(query_text: str) -> dict:
    direction = "in" if _INCOMING_PATTERNS.search(query_text) else "out"
    return {"queryType": "hybrid", "direction": direction}


def extract_candidate_identifiers(query_text: str) -> list[str]:
    candidates = []
    for match in _IDENTIFIER_RE.findall(query_text):
        if match in _STOPWORDS or len(match) < 3:
            continue
        candidates.append(match)
    return candidates
