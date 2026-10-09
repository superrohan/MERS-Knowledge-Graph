import pytest

from app.domain.models import Symbol, SymbolKind
from app.embeddings.hashing import HashingEmbeddingProvider
from app.embeddings.tokenize import tokenize
from app.ingestion.chunker import chunk_symbol
from app.services.postgres_repository_registry import DEFAULT_REPO_KEY, PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "test-repo-vector-pipeline"


@pytest.fixture(autouse=True)
def clean_repo():
    PostgresRepositoryRegistry().set_path(REPO_ID, DEFAULT_REPO_KEY, "/tmp/does-not-need-to-exist")
    store = PostgresVectorStore()
    store.clear_repository(REPO_ID)
    yield
    store.clear_repository(REPO_ID)


def test_tokenize_splits_camel_case_identifiers():
    assert "auth" in tokenize("AuthService")
    assert "service" in tokenize("AuthService")
    assert "authservice" in tokenize("AuthService")


def test_chunk_symbol_extracts_exact_source_lines():
    source_lines = [f"line {i}" for i in range(1, 11)]
    symbol = Symbol(
        id="s1",
        repository_id=REPO_ID,
        kind=SymbolKind.FUNCTION,
        name="foo",
        qualified_name="mod.foo",
        file_path="mod.py",
        start_line=3,
        end_line=6,
    )
    chunks = chunk_symbol(REPO_ID, symbol, source_lines)
    assert len(chunks) == 1
    assert chunks[0].text == "line 3\nline 4\nline 5\nline 6"
    assert chunks[0].start_line == 3
    assert chunks[0].end_line == 6


def test_chunk_symbol_splits_long_symbols():
    source_lines = [f"line {i}" for i in range(1, 201)]
    symbol = Symbol(
        id="s1",
        repository_id=REPO_ID,
        kind=SymbolKind.CLASS,
        name="Big",
        qualified_name="mod.Big",
        file_path="mod.py",
        start_line=1,
        end_line=150,
    )
    chunks = chunk_symbol(REPO_ID, symbol, source_lines)
    assert len(chunks) == 3  # 60 + 60 + 30 lines
    assert chunks[0].start_line == 1 and chunks[0].end_line == 60
    assert chunks[-1].end_line == 150


def test_vector_search_ranks_relevant_chunk_first():
    provider = HashingEmbeddingProvider()
    texts = [
        "class AuthService: def authenticate(self, username, password): ...",
        "class PaymentService: def create_payment(self, user_id, amount): ...",
        "def unrelated_helper(): return 42",
    ]
    vectors = provider.embed_documents(texts)

    store = PostgresVectorStore()
    for i, (text, vector) in enumerate(zip(texts, vectors)):
        symbol = Symbol(
            id=f"s{i}",
            repository_id=REPO_ID,
            kind=SymbolKind.FUNCTION,
            name=f"f{i}",
            qualified_name=f"mod.f{i}",
            file_path="mod.py",
            start_line=1,
            end_line=1,
        )
        chunk = chunk_symbol(REPO_ID, symbol, [text])[0]
        chunk.text = text
        store.add(REPO_ID, chunk, vector)

    query_vector = provider.embed_query("How does authentication work?")
    results = store.search(REPO_ID, query_vector, top_k=2)

    assert len(results) > 0
    assert "AuthService" in results[0][0].text


def test_remove_file_drops_only_that_files_chunks():
    provider = HashingEmbeddingProvider()
    vectors = provider.embed_documents(["a", "b"])
    store = PostgresVectorStore()
    symbol_a = Symbol(
        id="a", repository_id=REPO_ID, kind=SymbolKind.FUNCTION, name="a",
        qualified_name="a.a", file_path="a.py", start_line=1, end_line=1,
    )
    symbol_b = Symbol(
        id="b", repository_id=REPO_ID, kind=SymbolKind.FUNCTION, name="b",
        qualified_name="b.b", file_path="b.py", start_line=1, end_line=1,
    )
    chunk_a = chunk_symbol(REPO_ID, symbol_a, ["a"])[0]
    chunk_b = chunk_symbol(REPO_ID, symbol_b, ["b"])[0]
    store.add(REPO_ID, chunk_a, vectors[0])
    store.add(REPO_ID, chunk_b, vectors[1])

    store.remove_file(REPO_ID, "a.py")

    assert store.count(REPO_ID) == 1
    assert store.get_chunk(REPO_ID, chunk_b.id) is not None
    assert store.get_chunk(REPO_ID, chunk_a.id) is None
