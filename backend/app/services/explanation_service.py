"""Deterministic Turkish explanation layer for structured analysis results."""

from __future__ import annotations

from collections.abc import Mapping

from app.schemas.response_models import AnalyzeResponse, ExplanationSection


class ExplanationService:
    """Build short, honest Turkish explanations from existing analysis outputs."""

    @staticmethod
    def _as_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    @staticmethod
    def _pick_names(items: object, key: str) -> list[str]:
        if not isinstance(items, list):
            return []

        names: list[str] = []
        for item in items:
            if isinstance(item, Mapping):
                value = str(item.get(key, "")).strip()
                if value:
                    names.append(value)
        return names

    @staticmethod
    def _join_labels(values: list[str], limit: int = 3) -> str:
        selected = values[:limit]
        if not selected:
            return ""
        if len(selected) == 1:
            return selected[0]
        if len(selected) == 2:
            return f"{selected[0]} ve {selected[1]}"
        return f"{', '.join(selected[:-1])} ve {selected[-1]}"

    @staticmethod
    def _normalize_intent(intent: str | None) -> str:
        normalized = str(intent or "").strip().lower().replace(" ", "_")
        if normalized in {"defense", "defense_question", "savunma"}:
            return "defense"
        if normalized in {"attack_flow", "attack-flow", "flow", "saldiri_akisi"}:
            return "attack_flow"
        if normalized == "prediction":
            return "prediction"
        return "general"

    def build_analysis_explanation(
        self,
        result: AnalyzeResponse | Mapping[str, object],
        intent: str | None = None,
    ) -> dict[str, object]:
        """Create a short explanation without adding facts beyond the structured result."""
        payload: Mapping[str, object]
        if isinstance(result, AnalyzeResponse):
            payload = result.model_dump()
        else:
            payload = result

        matched_artifact = str(payload.get("matched_artifact") or "").strip()
        matched_attack = str(payload.get("matched_attack") or "").strip()
        matched_attack_exact = bool(payload.get("matched_attack_exact"))
        fallback_attack_family = str(payload.get("fallback_attack_family") or "").strip()
        fallback_attack_explanation = str(payload.get("fallback_attack_explanation") or "").strip()
        analysis_route = str(payload.get("analysis_route") or "").strip()
        confidence_label = str(payload.get("confidence_label") or "").strip()
        low_confidence_reason = str(payload.get("low_confidence_reason") or "").strip()
        direct_attacks = self._as_list(payload.get("direct_attacks"))
        may_impact_artifacts = self._as_list(payload.get("may_impact_artifacts"))
        may_impact_attacks = self._as_list(payload.get("may_impact_attacks"))
        direct_tactics = self._as_list(payload.get("direct_tactics"))
        next_tactics = self._as_list(payload.get("next_tactics"))
        defense_suggestions = self._pick_names(payload.get("defense_suggestions"), "title")
        predicted_attacks = self._pick_names(payload.get("predicted_attacks_top5"), "attack_name")
        normalized_intent = self._normalize_intent(intent or str(payload.get("intent") or ""))

        summary_title = "Analiz yorumu"
        intro_parts: list[str] = []
        sections: list[ExplanationSection] = []

        if matched_attack and analysis_route in {"attack_first", "hybrid"} and matched_attack_exact:
            intro_parts.append(
                f"Bu analiz en guclu sekilde {matched_attack} saldiri/teknigi ile iliskilendirildi."
            )
            if matched_artifact:
                intro_parts.append(
                    f"Ilgili artifact baglaminda {matched_artifact} one cikan eslesme olarak degerlendirildi."
                )
        elif matched_attack and analysis_route in {"attack_first", "hybrid"}:
            intro_parts.append(
                f"Girilen saldiri adi graph'ta dogrudan bulunamadigi icin {matched_attack} uzerinden yaklasik yorum yapildi."
            )
            if fallback_attack_family:
                intro_parts.append(
                    f"Yorum en yakin {fallback_attack_family} ailesi uzerinden surduruldu."
                )
        elif matched_artifact:
            intro_parts.append(
                f"Bu analiz en guclu sekilde {matched_artifact} artifact'i ile iliskilendirildi."
            )
        else:
            intro_parts.append(
                "Bu analizde girdi icin guclu bir primary eslesme uretilemedi."
            )

        if confidence_label:
            intro_parts.append(f"Guven duzeyi {confidence_label.lower()} olarak degerlendirildi.")

        flow_text = ""
        if direct_tactics or next_tactics:
            flow_sentences: list[str] = []
            if direct_tactics:
                flow_sentences.append(
                    f"Dogrudan tactic sinyalleri {self._join_labels(direct_tactics)} etrafinda yogunlasiyor."
                )
            if next_tactics:
                flow_sentences.append(
                    f"Sonraki asamada {self._join_labels(next_tactics)} yonunde ilerleme riski gorulebilir."
                )
            flow_text = " ".join(flow_sentences)
            sections.append(ExplanationSection(label="Olasi akis", text=flow_text))

        propagation_text = ""
        if may_impact_artifacts or may_impact_attacks:
            propagation_sentences: list[str] = []
            if may_impact_artifacts:
                propagation_sentences.append(
                    f"Etki yayilimi acisindan {self._join_labels(may_impact_artifacts)} gibi bagli varliklar da etkilenebilir."
                )
            if may_impact_attacks:
                propagation_sentences.append(
                    f"Bu yayilim hatti {self._join_labels(may_impact_attacks)} gibi ek saldiri yuzeyleriyle iliskilendiriliyor."
                )
            propagation_text = " ".join(propagation_sentences)
            sections.append(ExplanationSection(label="Etki yayilimi", text=propagation_text))

        defense_text = ""
        if defense_suggestions:
            defense_text = (
                f"Savunma odaginda {self._join_labels(defense_suggestions)} oncelikli gorunuyor."
            )
            sections.append(ExplanationSection(label="Savunma odagi", text=defense_text))

        prediction_text = ""
        if predicted_attacks:
            prediction_text = (
                f"ML siralamasi {self._join_labels(predicted_attacks)} saldirilarini oncelikli adaylar arasinda one cikariyor."
            )
            sections.append(ExplanationSection(label="Tahmin ozeti", text=prediction_text))

        emphasis_parts: list[str] = []
        if normalized_intent == "defense" and defense_text:
            emphasis_parts.append(defense_text)
        elif normalized_intent == "attack_flow" and flow_text:
            emphasis_parts.append(flow_text)
        elif normalized_intent == "prediction":
            if propagation_text:
                emphasis_parts.append(propagation_text)
            elif flow_text:
                emphasis_parts.append(flow_text)
        else:
            if matched_attack and analysis_route in {"attack_first", "hybrid"} and matched_attack_exact:
                emphasis_parts.append(
                    f"Saldiri baglami {matched_attack} etrafinda okunuyor ve mevcut graph sinyalleri buna gore yorumlaniyor."
                )
            elif matched_attack and analysis_route in {"attack_first", "hybrid"}:
                emphasis_parts.append(
                    "Bu sonuc tam bir teknik eslesmesine degil, yakin bir saldiri yorumuna dayanmaktadir."
                )
            elif direct_attacks:
                emphasis_parts.append(
                    f"Dogrudan saldiri sinyalleri {self._join_labels(direct_attacks)} uzerinden gorunur hale geliyor."
                )
            elif flow_text:
                emphasis_parts.append(flow_text)

        if not emphasis_parts and direct_attacks:
            emphasis_parts.append(
                f"Dogrudan saldiri sinyalleri {self._join_labels(direct_attacks)} uzerinden gorunur hale geliyor."
            )
        if not emphasis_parts and prediction_text:
            emphasis_parts.append(prediction_text)
        if not emphasis_parts and defense_text:
            emphasis_parts.append(defense_text)

        if low_confidence_reason:
            intro_parts.append(
                "Bu sonuc dusuk guven nedeniyle dikkatli yorumlanmalidir."
            )
            sections.append(ExplanationSection(label="Dikkat notu", text=low_confidence_reason))
        elif fallback_attack_explanation:
            sections.append(ExplanationSection(label="Yaklasik eslesme", text=fallback_attack_explanation))

        if not sections and not emphasis_parts:
            emphasis_parts.append(
                "Mevcut yapilandirilmis sinyaller sinirli oldugu icin bu cikti temkinli bir baslangic degerlendirmesi olarak okunmalidir."
            )

        summary_text = " ".join(part for part in [*intro_parts, *emphasis_parts] if part).strip()

        return {
            "summary_title": summary_title,
            "summary_text": summary_text,
            "summary_sections": [section.model_dump() for section in sections],
        }
