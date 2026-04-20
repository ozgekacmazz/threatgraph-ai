"""Deterministic multilingual normalization and keyword interpretation for artifact analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
import unicodedata

from app.services.attack_alias_service import AttackAliasService


@dataclass(frozen=True)
class QueryInterpretation:
    """Structured output used to enrich the existing mapping pipeline safely."""

    original_artifact: str
    original_description: str
    normalized_artifact: str
    normalized_description: str
    canonical_keywords: list[str] = field(default_factory=list)
    enriched_text: str = ""
    turkish_terms_detected: bool = False
    english_terms_detected: bool = False


@dataclass(frozen=True)
class SignalRule:
    """Readable weighted rule for multilingual security phrases."""

    phrase: str
    weight: float
    family: str = "general"


TURKISH_CHAR_TRANSLATION = str.maketrans(
    {
        "i": "i",
        "I": "i",
        "ı": "i",
        "İ": "i",
        "ş": "s",
        "Ş": "s",
        "ğ": "g",
        "Ğ": "g",
        "ü": "u",
        "Ü": "u",
        "ö": "o",
        "Ö": "o",
        "ç": "c",
        "Ç": "c",
    }
)

IDENTITY_ACCESS_FAMILY = "identity_access"
TOKEN_FAMILY = "token"
SESSION_FAMILY = "session"
EXECUTION_FAMILY = "execution"
DOCUMENT_FAMILY = "document"
NETWORK_FAMILY = "network"
ATTACK_FAMILY = "attack"

# Multi-word Turkish phrases carry higher weights than loose single-token hints.
SECURITY_SIGNAL_RULES: dict[str, tuple[SignalRule, ...]] = {
    "credential": (
        SignalRule("kimlik bilgisi", 4.8, IDENTITY_ACCESS_FAMILY),
        SignalRule("kimlik bilgileri", 5.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("giris bilgisi", 4.8, IDENTITY_ACCESS_FAMILY),
        SignalRule("giris bilgileri", 5.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("oturum acma bilgisi", 4.8, IDENTITY_ACCESS_FAMILY),
        SignalRule("oturum acma bilgileri", 5.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("login info", 4.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("login infos", 4.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("credential", 3.8, IDENTITY_ACCESS_FAMILY),
        SignalRule("credentials", 4.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("giris", 1.1, IDENTITY_ACCESS_FAMILY),
    ),
    "password": (
        SignalRule("password", 3.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("sifre", 3.8, IDENTITY_ACCESS_FAMILY),
        SignalRule("parola", 3.8, IDENTITY_ACCESS_FAMILY),
    ),
    "user account": (
        SignalRule("kullanici hesabi", 5.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("kullanici hesaplari", 5.0, IDENTITY_ACCESS_FAMILY),
        SignalRule("user account", 4.5, IDENTITY_ACCESS_FAMILY),
        SignalRule("user accounts", 4.5, IDENTITY_ACCESS_FAMILY),
        SignalRule("hesap", 2.4, IDENTITY_ACCESS_FAMILY),
        SignalRule("account", 2.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("kullanici", 1.7, IDENTITY_ACCESS_FAMILY),
        SignalRule("user", 1.5, IDENTITY_ACCESS_FAMILY),
    ),
    "domain user account": (
        SignalRule("domain hesabi", 5.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("domain kullanici hesabi", 5.4, IDENTITY_ACCESS_FAMILY),
        SignalRule("domain user account", 5.2, IDENTITY_ACCESS_FAMILY),
    ),
    "identity": (
        SignalRule("kullanici kimligi", 4.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("identity", 3.2, IDENTITY_ACCESS_FAMILY),
        SignalRule("kimlik", 2.6, IDENTITY_ACCESS_FAMILY),
    ),
    "access token": (
        SignalRule("access token", 4.8, TOKEN_FAMILY),
        SignalRule("authentication token", 4.8, TOKEN_FAMILY),
        SignalRule("erisim belirteci", 5.0, TOKEN_FAMILY),
    ),
    "token": (
        SignalRule("token", 3.4, TOKEN_FAMILY),
        SignalRule("belirtec", 3.4, TOKEN_FAMILY),
    ),
    "session": (
        SignalRule("browser session", 4.0, SESSION_FAMILY),
        SignalRule("web session", 4.0, SESSION_FAMILY),
        SignalRule("session", 3.2, SESSION_FAMILY),
        SignalRule("oturum", 3.2, SESSION_FAMILY),
    ),
    "session cookie": (
        SignalRule("session cookie", 4.8, SESSION_FAMILY),
        SignalRule("oturum cerezi", 5.0, SESSION_FAMILY),
        SignalRule("cookie", 3.0, SESSION_FAMILY),
        SignalRule("cerez", 3.0, SESSION_FAMILY),
    ),
    "web session cookie": (
        SignalRule("web session cookie", 5.0, SESSION_FAMILY),
        SignalRule("browser session cookie", 5.0, SESSION_FAMILY),
    ),
    "executable file": (
        SignalRule("calistirilabilir dosya", 4.8, EXECUTION_FAMILY),
        SignalRule("executable file", 4.5, EXECUTION_FAMILY),
    ),
    "process": (
        SignalRule("process", 3.0, EXECUTION_FAMILY),
        SignalRule("islem", 3.0, EXECUTION_FAMILY),
        SignalRule("surec", 2.8, EXECUTION_FAMILY),
    ),
    "binary": (
        SignalRule("zararli exe", 4.8, EXECUTION_FAMILY),
        SignalRule("zararli dosya", 4.5, EXECUTION_FAMILY),
        SignalRule("binary", 3.2, EXECUTION_FAMILY),
        SignalRule("exe", 3.2, EXECUTION_FAMILY),
    ),
    "document file": (
        SignalRule("document file", 4.0, DOCUMENT_FAMILY),
        SignalRule("document", 3.2, DOCUMENT_FAMILY),
        SignalRule("belge", 3.2, DOCUMENT_FAMILY),
        SignalRule("dokuman", 3.2, DOCUMENT_FAMILY),
        SignalRule("rapor", 2.8, DOCUMENT_FAMILY),
    ),
    "file": (
        SignalRule("file", 2.6, DOCUMENT_FAMILY),
        SignalRule("dosya", 2.8, DOCUMENT_FAMILY),
    ),
    "pdf": (SignalRule("pdf", 3.0, DOCUMENT_FAMILY),),
    "dns lookup": (
        SignalRule("dns lookup", 4.5, NETWORK_FAMILY),
        SignalRule("dns log", 4.2, NETWORK_FAMILY),
        SignalRule("dns trafigi", 4.4, NETWORK_FAMILY),
        SignalRule("dns", 2.8, NETWORK_FAMILY),
    ),
    "network traffic": (
        SignalRule("network traffic", 4.2, NETWORK_FAMILY),
        SignalRule("ag trafigi", 4.2, NETWORK_FAMILY),
        SignalRule("traffic log", 3.8, NETWORK_FAMILY),
    ),
    "dns network traffic": (
        SignalRule("dns network traffic", 4.6, NETWORK_FAMILY),
        SignalRule("supheli dns trafigi", 4.6, NETWORK_FAMILY),
    ),
    "stolen": (
        SignalRule("calindi", 2.8, ATTACK_FAMILY),
        SignalRule("stolen", 2.8, ATTACK_FAMILY),
        SignalRule("theft", 2.6, ATTACK_FAMILY),
    ),
    "compromised": (
        SignalRule("ele gecirildi", 3.6, ATTACK_FAMILY),
        SignalRule("compromised", 3.2, ATTACK_FAMILY),
        SignalRule("compromise", 3.0, ATTACK_FAMILY),
        SignalRule("ihlal", 2.8, ATTACK_FAMILY),
    ),
    "exfiltration": (
        SignalRule("veri sizdirma", 4.2, ATTACK_FAMILY),
        SignalRule("sizdirma", 3.2, ATTACK_FAMILY),
        SignalRule("exfiltration", 3.8, ATTACK_FAMILY),
    ),
    "remote access": (
        SignalRule("uzaktan erisim", 3.8, ATTACK_FAMILY),
        SignalRule("remote access", 3.6, ATTACK_FAMILY),
    ),
    "impersonation": (
        SignalRule("kimlik taklidi", 4.0, ATTACK_FAMILY),
        SignalRule("impersonation", 3.6, ATTACK_FAMILY),
    ),
    "session hijacking": (
        SignalRule("oturum ele gecirme", 4.8, SESSION_FAMILY),
        SignalRule("session hijacking", 4.6, SESSION_FAMILY),
    ),
    "lateral movement": (
        SignalRule("yan hareket", 4.0, ATTACK_FAMILY),
        SignalRule("yatay hareket", 4.0, ATTACK_FAMILY),
        SignalRule("lateral movement", 3.8, ATTACK_FAMILY),
    ),
    "privilege escalation": (
        SignalRule("ayricalik yukseltme", 4.0, ATTACK_FAMILY),
        SignalRule("privilege escalation", 3.8, ATTACK_FAMILY),
    ),
}

SCENARIO_ARTIFACT_CANONICALS = (
    "credential",
    "password",
    "user account",
    "domain user account",
    "identity",
    "access token",
    "token",
    "session",
    "session cookie",
    "web session cookie",
    "executable file",
    "process",
    "binary",
    "document file",
    "file",
    "pdf",
    "dns lookup",
    "network traffic",
    "dns network traffic",
)

SCENARIO_ATTACK_CANONICALS = (
    "phishing",
    "dynamic resolution",
    "network sniffing",
    "session hijacking",
    "browser session hijacking",
    "credential theft",
    "token impersonation",
    "pass the hash",
    "golden ticket",
    "remote desktop protocol",
    "remote service session hijacking",
    "spearphishing link",
    "exfiltration",
    "remote access",
    "impersonation",
    "lateral movement",
    "privilege escalation",
)

SCENARIO_ATTACK_RULES: dict[str, tuple[SignalRule, ...]] = {
    "phishing": (SignalRule("phishing", 4.0, ATTACK_FAMILY), SignalRule("oltalama", 4.0, ATTACK_FAMILY)),
    "dynamic resolution": (
        SignalRule("dynamic resolution", 5.2, ATTACK_FAMILY),
        SignalRule("dynamic resolution saldirisi", 5.4, ATTACK_FAMILY),
    ),
    "network sniffing": (
        SignalRule("network sniffing", 5.2, ATTACK_FAMILY),
        SignalRule("network sniffing saldirisi", 5.4, ATTACK_FAMILY),
    ),
    "session hijacking": SECURITY_SIGNAL_RULES["session hijacking"],
    "browser session hijacking": (
        SignalRule("browser session hijacking", 5.2, ATTACK_FAMILY),
        SignalRule("tarayici oturum ele gecirme", 5.2, ATTACK_FAMILY),
    ),
    "credential theft": (
        SignalRule("kimlik bilgisi", 3.6, ATTACK_FAMILY),
        SignalRule("kimlik bilgileri", 3.8, ATTACK_FAMILY),
        SignalRule("giris bilgisi", 3.6, ATTACK_FAMILY),
        SignalRule("giris bilgileri", 3.8, ATTACK_FAMILY),
        SignalRule("password theft", 4.0, ATTACK_FAMILY),
        SignalRule("credential theft", 4.0, ATTACK_FAMILY),
        SignalRule("ele gecirildi", 3.4, ATTACK_FAMILY),
        SignalRule("calindi", 3.2, ATTACK_FAMILY),
    ),
    "exfiltration": SECURITY_SIGNAL_RULES["exfiltration"],
    "token impersonation": (
        SignalRule("token impersonation", 5.0, ATTACK_FAMILY),
        SignalRule("token taklidi", 4.8, ATTACK_FAMILY),
    ),
    "pass the hash": (
        SignalRule("pass the hash", 5.4, ATTACK_FAMILY),
        SignalRule("pass the hash saldirisi", 5.4, ATTACK_FAMILY),
    ),
    "golden ticket": (
        SignalRule("golden ticket", 5.2, ATTACK_FAMILY),
        SignalRule("golden ticket saldirisi", 5.2, ATTACK_FAMILY),
    ),
    "remote desktop protocol": (
        SignalRule("remote desktop protocol", 4.8, ATTACK_FAMILY),
        SignalRule("rdp", 4.2, ATTACK_FAMILY),
    ),
    "remote service session hijacking": (
        SignalRule("remote service session hijacking", 5.4, ATTACK_FAMILY),
    ),
    "spearphishing link": (
        SignalRule("spearphishing link", 5.2, ATTACK_FAMILY),
        SignalRule("spearphishing", 4.8, ATTACK_FAMILY),
    ),
    "remote access": SECURITY_SIGNAL_RULES["remote access"],
    "impersonation": SECURITY_SIGNAL_RULES["impersonation"],
    "lateral movement": SECURITY_SIGNAL_RULES["lateral movement"],
    "privilege escalation": SECURITY_SIGNAL_RULES["privilege escalation"],
}

TURKISH_HINT_TOKENS = {
    "sifre",
    "parola",
    "giris",
    "kimlik",
    "erisim",
    "belirtec",
    "oturum",
    "cerez",
    "calistirilabilir",
    "zararli",
    "belge",
    "dokuman",
    "ag",
    "kullanici",
    "hesap",
    "hesabi",
    "ele",
    "gecirildi",
    "sizdirma",
    "uzaktan",
    "taklidi",
    "hareket",
    "ayricalik",
}

ENGLISH_HINT_TOKENS = {
    "credential",
    "credentials",
    "password",
    "token",
    "session",
    "cookie",
    "browser",
    "process",
    "binary",
    "document",
    "file",
    "dns",
    "network",
    "traffic",
    "account",
    "identity",
    "stolen",
    "compromised",
    "exfiltration",
    "remote",
    "impersonation",
    "hijacking",
    "lateral",
    "privilege",
}

IDENTITY_ACCESS_CANONICALS = {
    "credential",
    "password",
    "user account",
    "domain user account",
    "identity",
}

STRONG_IDENTITY_ACCESS_INDICATORS = {
    "kimlik bilgisi",
    "kimlik bilgileri",
    "giris bilgisi",
    "giris bilgileri",
    "oturum acma bilgisi",
    "kullanici hesabi",
    "domain hesabi",
    "password",
    "credential",
    "credentials",
    "user account",
    "identity",
}

ATTACK_FALLBACK_TARGETS: dict[str, str] = {
    "pass the hash": "credential theft",
    "pass-the-hash": "credential theft",
    "pth": "credential theft",
    "sniffing": "network sniffing",
    "network sniffing": "network sniffing",
}

ATTACK_FALLBACK_FAMILIES: dict[str, str] = {
    "credential theft": "credential abuse",
    "session hijacking": "session abuse",
    "network sniffing": "network surveillance",
    "phishing": "phishing-related credential compromise",
}

DEFINITION_CANONICAL_ALIASES: dict[str, str] = {
    "kerberos ticket": "access token",
}

DEFINITION_QUERY_PATTERNS = (
    re.compile(r"^(?P<term>.+?)\s+nedir$"),
    re.compile(r"^(?P<term>.+?)\s+ne\s+demek$"),
    re.compile(r"^what\s+is\s+(?P<term>.+)$"),
    re.compile(r"^what\s+does\s+(?P<term>.+?)\s+mean$"),
)


class QueryInterpreterService:
    """Rule-based multilingual interpretation layer for Turkish and English inputs."""

    def __init__(self, attack_alias_service: AttackAliasService | None = None) -> None:
        self.attack_alias_service = attack_alias_service or AttackAliasService()

    @staticmethod
    def _strip_accents(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        return "".join(char for char in normalized if not unicodedata.combining(char))

    def normalize_text(self, text: str | None) -> str:
        """Normalize punctuation, Turkish characters, casing, and spacing deterministically."""
        value = str(text or "").strip().lower().translate(TURKISH_CHAR_TRANSLATION)
        value = self._strip_accents(value)
        value = re.sub(r"[^a-z0-9\s]+", " ", value)
        value = re.sub(r"\s+", " ", value)
        return value.strip()

    def _detect_language_hints(self, artifact_text: str, description_text: str) -> tuple[bool, bool]:
        combined_tokens = set(f"{artifact_text} {description_text}".split())
        turkish_detected = bool(combined_tokens & TURKISH_HINT_TOKENS)
        english_detected = bool(combined_tokens & ENGLISH_HINT_TOKENS)
        return turkish_detected, english_detected

    @staticmethod
    def _rule_matches(text: str, phrase: str) -> bool:
        return bool(text and phrase and phrase in text)

    def _score_rules(
        self,
        text: str,
        rule_map: dict[str, tuple[SignalRule, ...]],
        allowed_canonicals: tuple[str, ...] | None = None,
    ) -> tuple[dict[str, float], bool, dict[str, str]]:
        if not text:
            return {}, False, {}

        phrase_priority_used = False
        scores: dict[str, float] = {}
        families: dict[str, str] = {}
        allowed = set(allowed_canonicals) if allowed_canonicals else None

        for canonical, rules in rule_map.items():
            if allowed is not None and canonical not in allowed:
                continue
            total_score = 0.0
            for rule in rules:
                if self._rule_matches(text, rule.phrase):
                    total_score += rule.weight
                    families[canonical] = rule.family
                    if " " in rule.phrase:
                        phrase_priority_used = True
            if total_score > 0:
                scores[canonical] = round(total_score, 3)

        return scores, phrase_priority_used, families

    def get_attack_fallback_target(self, attack_name: str) -> str | None:
        """Return a related attack fallback when the exact technique is absent from the graph."""
        normalized_attack = self.normalize_text(attack_name)
        canonical_attack, _ = self.attack_alias_service.resolve_attack_alias(normalized_attack)
        canonical_attack = self.normalize_text(canonical_attack or normalized_attack)
        return ATTACK_FALLBACK_TARGETS.get(canonical_attack) or ATTACK_FALLBACK_TARGETS.get(normalized_attack)

    def get_attack_fallback_family(self, attack_name: str) -> str | None:
        """Return a short family label for approximate attack interpretation."""
        fallback_target = self.get_attack_fallback_target(attack_name)
        if not fallback_target:
            resolved_attack, _ = self.attack_alias_service.resolve_attack_alias(attack_name)
            fallback_target = self.normalize_text(resolved_attack or attack_name)
        return ATTACK_FALLBACK_FAMILIES.get(fallback_target)

    def _extract_canonical_keywords(self, artifact_text: str, description_text: str) -> list[str]:
        combined_text = " ".join(part for part in [artifact_text, description_text] if part).strip()
        scores, _, _ = self._score_rules(combined_text, SECURITY_SIGNAL_RULES)
        return sorted(scores, key=lambda keyword: (-scores[keyword], keyword))

    @staticmethod
    def _extract_definition_term(text: str) -> str | None:
        normalized_text = text.strip().rstrip("?.!").strip()
        if not normalized_text:
            return None

        for pattern in DEFINITION_QUERY_PATTERNS:
            match = pattern.match(normalized_text)
            if match:
                term = str(match.group("term") or "").strip()
                if term:
                    return term
        return None

    @staticmethod
    def _resolve_definition_canonical(
        definition_term: str | None,
        ranked_artifacts: list[str],
        ranked_attacks: list[str],
    ) -> str | None:
        normalized_term = str(definition_term or "").strip()
        if not normalized_term:
            return None
        if normalized_term in SCENARIO_ARTIFACT_CANONICALS:
            return normalized_term
        if normalized_term in SCENARIO_ATTACK_CANONICALS:
            return normalized_term
        if normalized_term in DEFINITION_CANONICAL_ALIASES:
            return DEFINITION_CANONICAL_ALIASES[normalized_term]
        if ranked_artifacts:
            return ranked_artifacts[0]
        if ranked_attacks:
            return ranked_attacks[0]
        return None

    @staticmethod
    def _detect_scenario_intent(text: str) -> str:
        if not text:
            return "prediction"
        if QueryInterpreterService._extract_definition_term(text):
            return "definition"

        defense_markers = (
            "nasil korun",
            "nasil savun",
            "nasil onlenir",
            "nasil engellenir",
            "savunma",
            "savunmasi",
            "what defenses apply",
            "mitigation",
            "defend",
            "prevent",
        )
        attack_flow_markers = (
            "asamalari neler",
            "hangi tactic",
            "nasil ilerler",
            "attack flow",
            "flow",
            "attack chain",
        )
        prediction_markers = (
            "sonra ne olur",
            "hangi risklere yol acar",
            "what happens next",
            "olabilir",
            "muhtemel",
            "predict",
            "tahmin",
            "risk",
            "possible",
        )

        if any(marker in text for marker in defense_markers):
            return "defense"
        if any(marker in text for marker in attack_flow_markers):
            return "attack_flow"
        if any(marker in text for marker in prediction_markers):
            return "prediction"
        return "general"

    @staticmethod
    def _top_family_from_scores(
        scores: dict[str, float],
        families: dict[str, str],
    ) -> str | None:
        if not scores:
            return None

        family_scores: dict[str, float] = {}
        for canonical, score in scores.items():
            family = families.get(canonical, "general")
            family_scores[family] = family_scores.get(family, 0.0) + score

        top_family = max(family_scores.items(), key=lambda item: item[1])[0]
        return top_family

    def _strong_identity_access_bias(self, normalized_text: str, scores: dict[str, float]) -> bool:
        return any(indicator in normalized_text for indicator in STRONG_IDENTITY_ACCESS_INDICATORS) or any(
            canonical in IDENTITY_ACCESS_CANONICALS for canonical in scores
        )

    @staticmethod
    def _dedupe_ranked_values(values: list[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = value.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(value)
        return deduped

    @staticmethod
    def _select_analysis_route(
        artifact_scores: dict[str, float],
        attack_scores: dict[str, float],
    ) -> str:
        top_artifact = max(artifact_scores.values(), default=0.0)
        top_attack = max(attack_scores.values(), default=0.0)

        if top_attack >= 4.4 and top_attack > top_artifact + 0.6:
            return "attack_first"
        if top_attack >= 3.8 and top_artifact >= 3.6:
            return "hybrid"
        return "artifact_first"

    def interpret(self, artifact_name: str, description: str | None) -> QueryInterpretation:
        """Interpret raw artifact and description text into canonical security hints."""
        original_artifact = str(artifact_name or "")
        original_description = str(description or "")
        normalized_artifact = self.normalize_text(original_artifact)
        normalized_description = self.normalize_text(original_description)
        canonical_keywords = self._extract_canonical_keywords(normalized_artifact, normalized_description)
        turkish_detected, english_detected = self._detect_language_hints(
            normalized_artifact,
            normalized_description,
        )

        enriched_parts = [normalized_artifact, normalized_description, " ".join(canonical_keywords)]
        enriched_text = " ".join(part for part in enriched_parts if part).strip()

        return QueryInterpretation(
            original_artifact=original_artifact,
            original_description=original_description,
            normalized_artifact=normalized_artifact,
            normalized_description=normalized_description,
            canonical_keywords=canonical_keywords,
            enriched_text=enriched_text,
            turkish_terms_detected=turkish_detected,
            english_terms_detected=english_detected,
        )

    def interpret_scenario(self, text: str) -> dict[str, object]:
        """Interpret free-text scenarios into ranked artifacts, attacks, keywords, and intent.

        Examples:
        - "Bir kullanici hesabi ele gecirilirse..." should stay in the identity/account family.
        - "Kimlik bilgileri sizdirildiysa..." should strongly prefer credential-oriented artifacts.
        """
        normalized_text = self.normalize_text(text)
        artifact_scores, phrase_priority_used, artifact_families = self._score_rules(
            normalized_text,
            SECURITY_SIGNAL_RULES,
            allowed_canonicals=SCENARIO_ARTIFACT_CANONICALS,
        )
        attack_scores, _, _ = self._score_rules(
            normalized_text,
            SCENARIO_ATTACK_RULES,
            allowed_canonicals=SCENARIO_ATTACK_CANONICALS,
        )
        csv_matched_attack, csv_alias_confidence = self.attack_alias_service.resolve_attack_alias(text)
        csv_alias_match_used = bool(csv_matched_attack)
        if csv_matched_attack:
            normalized_attack_scores = dict(attack_scores)
            normalized_attack_scores[csv_matched_attack] = max(
                normalized_attack_scores.get(csv_matched_attack, 0.0),
                5.2 if csv_alias_confidence >= 1.0 else 4.8,
            )
            attack_scores = normalized_attack_scores

        identity_access_bias = self._strong_identity_access_bias(normalized_text, artifact_scores)
        if identity_access_bias:
            for canonical in IDENTITY_ACCESS_CANONICALS:
                if canonical in artifact_scores:
                    artifact_scores[canonical] = round(artifact_scores[canonical] + 0.75, 3)

        ranked_artifacts = sorted(artifact_scores, key=lambda item: (-artifact_scores[item], item))
        ranked_attacks = sorted(attack_scores, key=lambda item: (-attack_scores[item], item))
        if csv_matched_attack:
            ranked_attacks = [csv_matched_attack] + [
                attack for attack in ranked_attacks if attack.strip().lower() != csv_matched_attack.strip().lower()
            ]
        ranked_attacks = self._dedupe_ranked_values(ranked_attacks)
        keywords = sorted(
            set(ranked_artifacts) | set(ranked_attacks) | set(self._extract_canonical_keywords("", normalized_text))
        )
        intent = self._detect_scenario_intent(normalized_text)
        definition_term = self._extract_definition_term(normalized_text)
        definition_canonical = self._resolve_definition_canonical(
            definition_term=definition_term,
            ranked_artifacts=ranked_artifacts,
            ranked_attacks=ranked_attacks,
        )
        top_family = self._top_family_from_scores(artifact_scores, artifact_families)
        analysis_route = "attack_first" if csv_matched_attack else self._select_analysis_route(artifact_scores, attack_scores)

        return {
            "artifacts": ranked_artifacts,
            "attacks": ranked_attacks,
            "keywords": keywords,
            "intent": intent,
            "definition_term": definition_term,
            "definition_canonical": definition_canonical,
            "analysis_route": analysis_route,
            "csv_matched_attack": csv_matched_attack,
            "csv_alias_match_used": csv_alias_match_used,
            "csv_alias_confidence": csv_alias_confidence,
            "artifact_scores": artifact_scores,
            "attack_scores": attack_scores,
            "phrase_priority_used": phrase_priority_used,
            "top_candidate_family": top_family,
            "identity_access_bias_used": identity_access_bias,
        }
