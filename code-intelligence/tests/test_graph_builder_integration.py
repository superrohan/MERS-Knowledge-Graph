"""End-to-end test of scan -> parse -> resolve for the real fixture repo.

This exercises the exact pipeline the indexing service runs, so a broken
resolution strategy shows up here even before the FastAPI layer exists.
"""

from app.domain.models import RelationshipType, SymbolKind
from app.graph.graph_builder import GraphBuilder
from app.graph.postgres_store import PostgresGraphStore
from app.ingestion.scanner import RepositoryScanner
from app.parsing.python_parser import PythonFileParser

REPO_ID = "test-repo-graph-builder-integration"


def build_graph(fixture_repo_path):
    store = PostgresGraphStore()
    store.clear_repository(REPO_ID)
    scanner = RepositoryScanner()
    parser = PythonFileParser(REPO_ID)

    scan_result = scanner.scan(fixture_repo_path)
    all_unresolved = []
    for f in scan_result.parseable_files:
        with open(f.absolute_path, encoding="utf-8") as fh:
            source = fh.read()
        parsed, unresolved = parser.parse(f.relative_path, source)
        store.add_symbols(REPO_ID, parsed.symbols)
        store.add_relationships(REPO_ID, parsed.relationships)
        all_unresolved.extend(unresolved)

    relationships = GraphBuilder(store).resolve(REPO_ID, all_unresolved)
    store.add_relationships(REPO_ID, relationships)
    return store


def test_stats_reflect_real_symbol_counts(fixture_repo_path):
    store = build_graph(fixture_repo_path)
    stats = store.stats(REPO_ID)

    assert stats["files"] == 17  # includes __init__.py files, all real .py files in the fixture repo
    assert stats["classes"] >= 6  # LoginController, AuthService, JWTValidator, UserRepository, PaymentController, PaymentService, ...
    assert stats["functions"] + stats["methods"] > 15
    assert stats["relationships"] > 10


def test_login_controller_calls_auth_service(fixture_repo_path):
    store = build_graph(fixture_repo_path)

    login = store.find_by_qualified_name(REPO_ID, "src.api.auth_controller.LoginController.login")
    auth_service_construct = store.find_by_simple_name(REPO_ID, "AuthService", kinds={SymbolKind.CLASS})[0]
    authenticate = store.find_by_qualified_name(
        REPO_ID, "src.services.auth_service.AuthService.authenticate"
    )
    assert login is not None
    assert authenticate is not None

    calls = store.get_relationships(REPO_ID, source_id=login.id, types={RelationshipType.CALLS})
    call_targets = {rel.target_id for rel in calls}
    assert authenticate.id in call_targets


def test_auth_service_calls_user_repository_and_jwt_validator(fixture_repo_path):
    store = build_graph(fixture_repo_path)

    authenticate = store.find_by_qualified_name(REPO_ID, "src.services.auth_service.AuthService.authenticate")
    find_method = store.find_by_qualified_name(REPO_ID, "src.repositories.user_repository.UserRepository.find")
    issue_method = store.find_by_qualified_name(REPO_ID, "src.security.jwt.JWTValidator.issue")

    calls = store.get_relationships(REPO_ID, source_id=authenticate.id, types={RelationshipType.CALLS})
    call_targets = {rel.target_id for rel in calls}

    assert find_method.id in call_targets
    assert issue_method.id in call_targets


def test_extends_relationship_for_authentication_error(fixture_repo_path):
    store = build_graph(fixture_repo_path)
    # AuthenticationError(Exception) - "Exception" is a Python builtin with
    # no symbol in the repo, so this must NOT produce a fabricated edge.
    auth_error = store.find_by_qualified_name(REPO_ID, "src.services.auth_service.AuthenticationError")
    extends = store.get_relationships(REPO_ID, source_id=auth_error.id, types={RelationshipType.EXTENDS})
    assert extends == []


def test_test_function_links_to_the_function_it_tests(fixture_repo_path):
    store = build_graph(fixture_repo_path)

    test_fn = store.find_by_qualified_name(
        REPO_ID, "tests.test_payment_service.test_create_payment_for_active_user"
    )
    create_payment = store.find_by_qualified_name(
        REPO_ID, "src.services.payment_service.PaymentService.create_payment"
    )
    assert test_fn is not None
    assert create_payment is not None

    tests_rels = store.get_relationships(REPO_ID, source_id=test_fn.id, types={RelationshipType.TESTS})
    assert any(rel.target_id == create_payment.id for rel in tests_rels)


def test_import_relationship_resolves_to_class_symbol(fixture_repo_path):
    store = build_graph(fixture_repo_path)

    controller_module = store.find_by_qualified_name(REPO_ID, "src.api.auth_controller")
    auth_service_class = store.find_by_qualified_name(REPO_ID, "src.services.auth_service.AuthService")

    imports = store.get_relationships(REPO_ID, source_id=controller_module.id, types={RelationshipType.IMPORTS})
    import_targets = {rel.target_id for rel in imports}
    assert auth_service_class.id in import_targets
