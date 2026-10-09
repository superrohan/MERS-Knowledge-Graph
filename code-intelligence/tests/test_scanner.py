from app.ingestion.scanner import RepositoryScanner


def test_scans_fixture_repository_python_files(fixture_repo_path):
    result = RepositoryScanner().scan(fixture_repo_path)

    python_paths = {f.relative_path for f in result.parseable_files}
    assert "src/services/auth_service.py" in python_paths
    assert "src/security/jwt.py" in python_paths
    assert "tests/test_auth_service.py" in python_paths
    assert len(result.parseable_files) == len(result.all_files)  # fixture repo is Python-only
    assert result.files_by_language() == {"python": result.parseable_files}


def test_skips_hidden_and_vendored_directories(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("x = 1\n")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("[core]\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "pkg.py").write_text("x = 1\n")

    result = RepositoryScanner().scan(str(tmp_path))

    paths = {f.relative_path for f in result.all_files}
    assert paths == {"src/app.py"}
