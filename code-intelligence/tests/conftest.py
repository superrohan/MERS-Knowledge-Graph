import os

import pytest

FIXTURE_REPO = os.path.join(os.path.dirname(__file__), "..", "..", "test-repository")


@pytest.fixture
def fixture_repo_path() -> str:
    return os.path.abspath(FIXTURE_REPO)
