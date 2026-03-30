"""CSV-driven attack alias normalization for scenario analysis."""

from __future__ import annotations

import csv
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_ATTACK_CSV_PATH = (
    Path(__file__).resolve().parents[3] / "analysis" / "data" / "off_neo4j_query_table_data_2026-3-30.csv"
)


class AttackAliasService:
    """Load offense technique names from CSV and resolve normalized aliases."""

    def __init__(self, csv_path: Path | None = None) -> None:
        self.csv_path = csv_path or DEFAULT_ATTACK_CSV_PATH
        self.alias_map: dict[str, str] = {}
        self._canonical_normalized_map: dict[str, str] = {}
        self._load_aliases()

    @staticmethod
    def normalize_attack_text(value: str | None) -> str:
        normalized = str(value or "").strip().lower()
        normalized = normalized.replace("-", " ").replace("_", " ")
        normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized)
        return normalized.strip()

    @staticmethod
    def _compact_attack_text(value: str) -> str:
        return value.replace(" ", "")

    def _load_aliases(self) -> None:
        if not self.csv_path.exists():
            logger.warning("Attack alias CSV was not found at '%s'.", self.csv_path)
            return

        try:
            with self.csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                for row in reader:
                    canonical_name = str(row.get("offense_tech_name", "")).strip()
                    if not canonical_name:
                        continue
                    self._register_attack_aliases(canonical_name)
        except Exception as exc:  # pragma: no cover - file system/runtime safety
            logger.warning("Attack alias CSV could not be loaded from '%s': %s", self.csv_path, exc)

    def _register_attack_aliases(self, canonical_name: str) -> None:
        normalized = self.normalize_attack_text(canonical_name)
        if not normalized:
            return

        self._canonical_normalized_map[normalized] = canonical_name
        generated_aliases = {
            normalized,
            canonical_name.strip().lower(),
            normalized.replace(" ", "-"),
            self._compact_attack_text(normalized),
        }

        for alias in generated_aliases:
            normalized_alias = self.normalize_attack_text(alias) if " " in alias or "-" in alias else alias.strip().lower()
            if not normalized_alias:
                continue
            self.alias_map[normalized_alias] = canonical_name

    def resolve_attack_alias(self, input_text: str) -> tuple[str | None, float]:
        """Resolve an attack name from CSV-derived aliases."""
        normalized_input = self.normalize_attack_text(input_text)
        if not normalized_input:
            return None, 0.0

        compact_input = self._compact_attack_text(normalized_input)

        if normalized_input in self._canonical_normalized_map:
            return self._canonical_normalized_map[normalized_input], 1.0

        if normalized_input in self.alias_map:
            return self.alias_map[normalized_input], 0.9

        if compact_input in self.alias_map:
            return self.alias_map[compact_input], 0.9

        contains_candidates = [
            (alias, canonical)
            for alias, canonical in self.alias_map.items()
            if alias and (alias in normalized_input or normalized_input in alias)
        ]
        if contains_candidates:
            best_alias, best_canonical = max(
                contains_candidates,
                key=lambda item: (len(item[0]), item[1].lower()),
            )
            logger.debug("CSV alias contains-match selected '%s' for '%s'.", best_alias, normalized_input)
            return best_canonical, 0.75

        return None, 0.0
