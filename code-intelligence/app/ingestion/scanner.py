"""Walks a cloned repository on disk and enumerates the files to index.

The repository is treated strictly as data: this module only ever reads
file bytes off disk. It never executes anything found in the repository,
and never installs dependencies.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.parsing.registry import language_for_extension

_SKIP_DIRS = {
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    "dist",
    "build",
    ".idea",
    ".vscode",
    "target",  # Java/Maven build output
    ".gradle",
}

_MAX_FILE_BYTES = 2_000_000  # skip anything absurdly large (generated/binary-ish files)


@dataclass
class ScannedFile:
    relative_path: str
    absolute_path: str
    size_bytes: int
    language: str | None = None


@dataclass
class ScanResult:
    all_files: list[ScannedFile]
    parseable_files: list[ScannedFile]

    def files_by_language(self) -> dict[str, list[ScannedFile]]:
        grouped: dict[str, list[ScannedFile]] = {}
        for f in self.parseable_files:
            grouped.setdefault(f.language, []).append(f)
        return grouped


class RepositoryScanner:
    def scan(self, repository_path: str) -> ScanResult:
        all_files: list[ScannedFile] = []
        parseable_files: list[ScannedFile] = []

        for root, dirnames, filenames in os.walk(repository_path):
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS and not d.startswith(".")]

            for filename in filenames:
                absolute_path = os.path.join(root, filename)
                try:
                    size_bytes = os.path.getsize(absolute_path)
                except OSError:
                    continue
                relative_path = os.path.relpath(absolute_path, repository_path).replace(os.sep, "/")

                scanned = ScannedFile(relative_path=relative_path, absolute_path=absolute_path, size_bytes=size_bytes)
                all_files.append(scanned)

                _, extension = os.path.splitext(filename)
                language = language_for_extension(extension)
                if language and size_bytes <= _MAX_FILE_BYTES:
                    scanned.language = language
                    parseable_files.append(scanned)

        all_files.sort(key=lambda f: f.relative_path)
        parseable_files.sort(key=lambda f: f.relative_path)
        return ScanResult(all_files=all_files, parseable_files=parseable_files)
