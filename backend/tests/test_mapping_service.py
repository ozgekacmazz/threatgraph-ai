import unittest

from app.services.mapping_service import MappingService


class FakeNeo4jClient:
    def __init__(self) -> None:
        self._artifacts = [
            {"artifact": "Access Token", "category": "Identity"},
            {"artifact": "DNS Lookup", "category": "Network"},
            {"artifact": "Create Process", "category": "Process"},
            {"artifact": "Session", "category": "Identity"},
            {"artifact": "Credential", "category": "Identity"},
            {"artifact": "Document File", "category": "File"},
        ]
        self._rules = [
            {"keyword": "token", "target_artifact": "Access Token", "rule_type": "basic_keyword", "weight": 2.0},
            {"keyword": "jwt", "target_artifact": "Access Token", "rule_type": "identity_keyword", "weight": 3.5},
            {"keyword": "dns", "target_artifact": "DNS Lookup", "rule_type": "protocol_keyword", "weight": 3.5},
            {"keyword": "auth", "target_artifact": "Credential", "rule_type": "identity_keyword", "weight": 3.0},
        ]

    def fetch_artifacts(self):
        return list(self._artifacts)

    def fetch_mapping_rules(self):
        return list(self._rules)

    def is_available(self) -> bool:
        return False


class NormalizedCatalogNeo4jClient(FakeNeo4jClient):
    def __init__(self) -> None:
        super().__init__()
        self._artifacts = [
            {"artifact": " access token ", "category": "Identity"},
            {"artifact": "dns lookup", "category": "Network"},
            {"artifact": "Create Process", "category": "Process"},
            {"artifact": "Session", "category": "Identity"},
            {"artifact": "Credential", "category": "Identity"},
        ]


class MappingServiceTests(unittest.TestCase):
    def test_jwt_token_maps_to_access_token(self) -> None:
        service = MappingService(FakeNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("jwt token", artifacts, rules, "")

        self.assertEqual(result.matched_artifact, "Access Token")
        self.assertEqual(result.mapping_method, "explicit_mapping")

    def test_token_with_auth_description_maps_to_access_token(self) -> None:
        service = MappingService(FakeNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("token", artifacts, rules, "authentication token")

        self.assertEqual(result.matched_artifact, "Access Token")
        self.assertEqual(result.mapping_method, "explicit_mapping")

    def test_dns_cache_maps_to_dns_lookup(self) -> None:
        service = MappingService(FakeNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("dns cache", artifacts, rules, "")

        self.assertEqual(result.matched_artifact, "DNS Lookup")
        self.assertEqual(result.mapping_method, "explicit_mapping")

    def test_powershell_script_maps_to_valid_catalog_artifact(self) -> None:
        service = MappingService(FakeNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("powershell script", artifacts, rules, "")

        self.assertEqual(result.matched_artifact, "Create Process")
        self.assertEqual(result.mapping_method, "explicit_mapping")

    def test_unknown_artifact_falls_back_gracefully(self) -> None:
        service = MappingService(FakeNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("totally unknown artifact", artifacts, rules, "")

        self.assertIsNotNone(result.mapping_method)
        self.assertLess(result.confidence_score, 0.55)

    def test_explicit_mapping_resolves_against_normalized_catalog(self) -> None:
        service = MappingService(NormalizedCatalogNeo4jClient())
        artifacts, rules = service.fetch_context()

        result = service.select_best_artifact("jwt token", artifacts, rules, "")

        self.assertEqual(result.matched_artifact, "access token")
        self.assertEqual(result.mapping_method, "explicit_mapping")


if __name__ == "__main__":
    unittest.main()
