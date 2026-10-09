"""End-to-end: a real Spring Security config class in one file, a real
@RestController route in another, indexed together for real - proves the
whole pipeline (parse -> persist per-file security_rules in the
manifest -> merge into the matched route's graph node) actually wires
up, not just its pieces in isolation."""

from app.domain.models import SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.services.indexing_service import IndexingService
from app.services.postgres_job_manager import PostgresJobManager
from app.services.postgres_manifest import PostgresManifestStore
from app.services.postgres_repository_registry import PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "repo-spring-security-indexing-test"

_SECURITY_CONFIG = """
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .requestMatchers("/api/public/**").permitAll()
            .anyRequest().authenticated()
        );
        return http.build();
    }
}
"""

_ADMIN_CONTROLLER = """
@RestController
@RequestMapping("/admin")
public class AdminController {
    @GetMapping("/users")
    public String listUsers() {
        return "users";
    }
}
"""

_PUBLIC_CONTROLLER = """
@RestController
public class PublicController {
    @GetMapping("/api/public/status")
    public String status() {
        return "ok";
    }
}
"""


def _run(tmp_path):
    (tmp_path / "SecurityConfig.java").write_text(_SECURITY_CONFIG)
    (tmp_path / "AdminController.java").write_text(_ADMIN_CONTROLLER)
    (tmp_path / "PublicController.java").write_text(_PUBLIC_CONTROLLER)

    service = IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )
    job = service.job_manager.create(REPO_ID, str(tmp_path))
    service.run(job.id, REPO_ID, str(tmp_path))
    finished = service.job_manager.get(job.id)
    assert finished.status == "COMPLETED", finished.error
    return service


def test_global_security_rule_is_merged_into_the_route_it_governs(tmp_path):
    store = PostgresGraphStore()
    store.clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)

    _run(tmp_path)

    symbols = store.all_symbols(REPO_ID)
    list_users = next(s for s in symbols if s.name == "listUsers")
    assert list_users.kind == SymbolKind.API
    assert list_users.api.auth_required is True
    assert list_users.api.required_roles == ["ADMIN"]
    assert list_users.api.auth_mechanism == "security_filter_chain"
    assert any(m.kind == "global_filter" for m in list_users.api.middleware_chain)

    status = next(s for s in symbols if s.name == "status")
    assert status.api.auth_required is False


def test_reindexing_only_the_controller_file_keeps_the_merged_security_rule(tmp_path):
    """The security config file is unchanged on the second run - its
    rules must still be pulled from the persisted manifest, not
    re-parsed, and still correctly re-merged after the route is
    re-resolved."""
    store = PostgresGraphStore()
    store.clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)

    service = _run(tmp_path)

    # Touch only the admin controller and re-index.
    (tmp_path / "AdminController.java").write_text(_ADMIN_CONTROLLER.replace("listUsers", "listAllUsers"))
    job2 = service.job_manager.create(REPO_ID, str(tmp_path))
    service.run(job2.id, REPO_ID, str(tmp_path))
    finished = service.job_manager.get(job2.id)
    assert finished.status == "COMPLETED", finished.error

    symbols = store.all_symbols(REPO_ID)
    renamed = next(s for s in symbols if s.name == "listAllUsers")
    assert renamed.api.auth_required is True
    assert renamed.api.required_roles == ["ADMIN"]
