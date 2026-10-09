from app.domain.api_models import ApiEndpointInfo
from app.domain.models import Symbol, SymbolKind
from app.services.spring_security_merger import compute_updates

REPO = "repo1"


def _api_symbol(id_, route_path, http_method="GET", auth_required=False, required_roles=None):
    s = Symbol(
        id=id_, repository_id=REPO, kind=SymbolKind.API, name=id_, qualified_name=id_,
        file_path="mod.java", start_line=1, end_line=1,
    )
    s.api = ApiEndpointInfo(
        http_method=http_method, route_path=route_path, auth_required=auth_required,
        required_roles=required_roles or [], framework="spring",
    )
    return s


_RULES = [
    {"pattern": "/admin/**", "effect": "has_role", "roles": ["ADMIN"], "source_file": "SecurityConfig.java", "order": 0},
    {"pattern": "/api/public/**", "effect": "permit_all", "roles": [], "source_file": "SecurityConfig.java", "order": 1},
    {"pattern": "/api/orders/**", "effect": "authenticated", "roles": [], "source_file": "SecurityConfig.java", "order": 2},
]


def test_no_rules_produces_no_updates():
    assert compute_updates([_api_symbol("s1", "/admin/x")], []) == []


def test_route_with_no_existing_auth_signal_gets_the_matched_rules_role():
    symbol = _api_symbol("s1", "/admin/users")
    updates = compute_updates([symbol], _RULES)
    assert len(updates) == 1
    assert updates[0]["auth_required"] is True
    assert updates[0]["required_roles"] == ["ADMIN"]
    assert updates[0]["auth_mechanism"] == "security_filter_chain"


def test_permit_all_rule_does_not_force_auth_required():
    symbol = _api_symbol("s1", "/api/public/status")
    updates = compute_updates([symbol], _RULES)
    assert updates[0]["auth_required"] is False


def test_existing_method_level_auth_is_never_weakened_by_a_broader_permit_all():
    # A route under /api/public/** that ALSO has its own @PreAuthorize -
    # the global permitAll for the broader pattern must not erase it.
    symbol = _api_symbol("s1", "/api/public/admin-only", auth_required=True, required_roles=["ADMIN"])
    updates = compute_updates([symbol], _RULES)
    assert updates[0]["auth_required"] is True
    assert updates[0]["required_roles"] == ["ADMIN"]


def test_matched_rule_is_always_recorded_in_middleware_chain_even_when_not_overriding_auth():
    symbol = _api_symbol("s1", "/api/public/admin-only", auth_required=True, required_roles=["ADMIN"])
    updates = compute_updates([symbol], _RULES)
    chain = updates[0]["middleware_chain"]
    assert any(step["kind"] == "global_filter" for step in chain)


def test_first_matching_rule_wins_when_patterns_overlap():
    rules = [
        {"pattern": "/api/orders/special", "effect": "permit_all", "roles": [], "source_file": "x.java", "order": 0},
        {"pattern": "/api/orders/**", "effect": "authenticated", "roles": [], "source_file": "x.java", "order": 1},
    ]
    symbol = _api_symbol("s1", "/api/orders/special")
    updates = compute_updates([symbol], rules)
    assert updates[0]["auth_required"] is False  # the more specific, earlier rule wins


def test_no_matching_rule_produces_no_update():
    symbol = _api_symbol("s1", "/totally/unrelated")
    assert compute_updates([symbol], _RULES) == []


def test_non_spring_symbols_are_ignored():
    symbol = _api_symbol("s1", "/admin/x")
    symbol.api.framework = "express"
    assert compute_updates([symbol], _RULES) == []


def test_ant_double_star_matches_nested_segments():
    symbol = _api_symbol("s1", "/admin/users/123/roles")
    updates = compute_updates([symbol], _RULES)
    assert updates[0]["required_roles"] == ["ADMIN"]


def test_ant_single_star_does_not_match_nested_segments():
    rules = [{"pattern": "/admin/*", "effect": "has_role", "roles": ["ADMIN"], "source_file": "x.java", "order": 0}]
    matched = compute_updates([_api_symbol("s1", "/admin/users")], rules)
    unmatched = compute_updates([_api_symbol("s2", "/admin/users/123")], rules)
    assert matched[0]["required_roles"] == ["ADMIN"]
    assert unmatched == []
