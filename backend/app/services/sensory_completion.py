"""Evidence-led completion. Legacy profiles are never reference observations."""

import re
from datetime import UTC, datetime
from statistics import median
from urllib.parse import urlsplit

from pydantic import ValidationError

from app.core.wine_types import normalize_wine_type
from app.models import Wine
from app.schemas.sensory_agent import (
    CompletedDimension,
    CompleteResearchOutput,
    ProfileReference,
    ResearchComparison,
    ResearchEvidence,
    ResearchTrait,
    SensoryResearchResult,
    SourceEvidence,
    SourceTrait,
)
from app.services.openai_client import OpenAIResponse
from app.services.score_sources import public_page_text
from app.services.shared_wine_data import normalize_identity_part as norm
from app.services.taste_profiles import SENSORY_DIMENSIONS


def supports_intensity(dimension: str, trait: SourceTrait) -> bool:
    """Reject known quality/intensity confusions, even if the model accepts them."""
    if not trait.intensity_supported:
        return False
    text = norm(trait.excerpt)
    intensity = bool(
        re.search(
            r"\b(high|low|medium|full|light|firm|strong|powerful|pronounced|marked|vibrant|"
            r"fresh|some|little|no|without|absent)\b|intens|decis|spiccat|elevat|contenut|"
            r"scarso|fresc|vivac|legger|pien|medio|mittelschwer|faible|puissant",
            text,
        )
    )
    if dimension == "tannin":
        intensity = bool(
            re.search(
                r"(firm|strong|powerful|pronounced|high|low|medium|light|intense)\s+(tannin|tannic)|"
                r"tannin\w*\s+(decis|intens|robust|legger|elevat|contenut|marcat)",
                text,
            )
        )
        if not intensity:
            return False
    if dimension == "acidity":
        intensity = bool(
            re.search(
                r"fresc|vivac|vibrant|fresh|high acidity|low acidity|medium acidity|acidite vive|"
                r"acidit\w* (elevat|contenut|medio|spiccat)",
                text,
            )
        )
    if (
        dimension == "tannin"
        and re.search(r"soft|silky|velvet|integrat|blended|morbido|morbidi|vellutat|setos", text)
        and not intensity
    ):
        return False
    if dimension == "acidity" and re.search(r"balanc|equilib|elegan", text) and not intensity:
        return False
    if (
        dimension == "wood"
        and re.search(r"unoaked|steel|acciaio|barrique", text)
        and not re.search(r"aroma|note|bois|sentor|oak flavor|oak flavour", text)
    ):
        return False
    if (
        dimension == "body"
        and re.search(r"structur|struttur|persist|long|lung", text)
        and not re.search(
            r"body|bodied|corpo|pien|full|medium|light|mittelschwer|ample|corpulent", text
        )
    ):
        return False
    if dimension == "fruit" and not re.search(
        r"intens|pronoun|rich|heavy|abundant|juicy|succulent|ricc|evident|fruttat|fruit.forward",
        text,
    ):
        return False
    if dimension == "fruit":
        intensity = True  # Fruit-specific intensity terms have passed the guard above.
    if dimension == "body" and not re.search(r"bodied|body|corpo|pien|corpulent|ample", text):
        return False
    if dimension == "wood" and not re.search(
        r"wood|oak|bois|legno|vanill|toast|cedar|tostat", text
    ):
        return False
    if dimension == "sweetness":
        intensity = intensity or bool(re.search(r"dry|sweet|secc|dolc|abboccat|amabil", text))
    if (
        dimension == "aromatic_intensity"
        and re.search(r"complex|layers|dimension|variet", text)
        and not re.search(r"intens|powerful|pronounced|restrained|delicat", text)
    ):
        return False
    return intensity


def exact_evidence(evidence: SourceEvidence, vintage: str) -> bool:
    if evidence.scope != "exact_vintage" or norm(evidence.vintage) != norm(vintage):
        return False
    if norm(vintage) in {"nv", "mv", "non vintage", "non millesimato"}:
        return evidence.published_year is not None and (
            datetime.now(UTC).year - 3 <= evidence.published_year <= datetime.now(UTC).year
        )
    return True


def evidence_from_trait(trait: SourceTrait) -> SourceEvidence:
    return SourceEvidence.model_validate(
        {key: getattr(trait, key) for key in SourceEvidence.model_fields}
    )


def build_complete_proposal(
    wine: Wine,
    response: OpenAIResponse,
    baseline: dict,
    *,
    source_texts: dict[str, str] | None = None,
) -> SensoryResearchResult:
    # Local import avoids a module cycle; the same public URL policy applies to every source.
    from app.services.sensory_agent import public_source_url

    result = SensoryResearchResult(
        wine_id=wine.id,
        identity_id=wine.shared_identity_id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        baseline=baseline,
        status="no_evidence",
        prompt_version="4",
        model=response.model,
        cost_usd=response.charged_cost_usd,
        complete_profile={
            key: CompletedDimension(issue="missing_evidence") for key in SENSORY_DIMENSIONS
        },
    )
    try:
        output = CompleteResearchOutput.model_validate_json(response.text)
    except ValidationError:
        result.status, result.issue = "failed", "invalid_output"
        return result
    if not output.identity_confirmed or any(
        norm(getattr(output, key)) != norm(getattr(wine, key))
        for key in ("name", "producer", "vintage")
    ):
        result.issue = "identity_mismatch"
        return result
    sources = {
        url: {"url": url, "title": str(source.get("title") or "")[:200]}
        for source in response.web_sources
        if (url := public_source_url(str(source.get("url") or "")))
    }
    used: set[str] = set()
    pages: dict[str, str] = {} if source_texts is None else dict(source_texts)

    def verified(evidence: SourceEvidence) -> bool:
        url = public_source_url(evidence.source_url)
        if url not in sources or not evidence.excerpt.strip():
            return False
        evidence.source_url = url
        used.add(url)
        if url not in pages:
            # The reader checks DNS/redirects, pins public addresses, and bounds size/time.
            pages[url] = public_page_text(url) if len(pages) < 12 and source_texts is None else ""
        page = norm(pages[url])
        segments = [
            norm(part) for part in re.split(r"\.{3}|\u2026", evidence.excerpt) if norm(part)
        ]
        if not page or not segments:
            warning = "source_excerpt_unverified:" + url
            if warning not in result.warnings:
                result.warnings.append(warning)
            return False
        position = 0
        for segment in segments:
            found = page.find(segment, position)
            if found < 0:
                warning = "source_excerpt_unverified:" + url
                if warning not in result.warnings:
                    result.warnings.append(warning)
                return False
            position = found + len(segment)
        return True

    result.summary, result.limitations = output.summary, output.limitations
    result.vintage_confirmed = (
        output.vintage_confirmed
        and verified(output.identity_evidence)
        and exact_evidence(output.identity_evidence, wine.vintage)
    )
    comparisons = {item.dimension: item for item in output.comparisons}
    for key, trait in output.dimensions:
        if trait is None:
            continue
        if not verified(trait):
            result.complete_profile[key].issue = "unverified_excerpt"
            continue
        if not supports_intensity(key, trait):
            result.complete_profile[key].issue = "unsupported_intensity"
            result.warnings.append(f"{key}:unsupported_intensity")
            continue
        evidence = evidence_from_trait(trait)
        comparison = comparisons.get(key)
        valid = [item for item in comparison.evidence if verified(item)] if comparison else []
        if comparison and comparison.agreement == "conflicting":
            result.complete_profile[key].issue = "conflicting_sources"
            result.warnings.append(f"{key}:conflicting_sources")
            continue
        exact = [item for item in [evidence, *valid] if exact_evidence(item, wine.vintage)]
        publishers = {norm(item.publisher) for item in exact}
        hosts = {str(urlsplit(item.source_url).hostname).removeprefix("www.") for item in exact}
        independent = bool(comparison and comparison.independent)
        copied = len({norm(item.excerpt) for item in exact}) < 2
        corroborated = (
            exact_evidence(evidence, wine.vintage)
            and comparison is not None
            and comparison.agreement == "corroborated"
            and independent
            and len(publishers) >= 2
            and len(hosts) >= 2
            and not copied
        )
        if exact_evidence(evidence, wine.vintage):
            origin, confidence = ("corroborated", 0.8) if corroborated else ("single_source", 0.55)
        elif evidence.scope == "wine_style":
            origin, confidence = "wine_style", 0.4
        elif (
            evidence.scope == "other_vintage"
            and evidence.vintage.isdigit()
            and wine.vintage.isdigit()
            and abs(int(evidence.vintage) - int(wine.vintage)) <= 3
        ):
            origin, confidence = "wine_style", 0.35
        else:
            result.complete_profile[key].issue = "historical_or_distant_vintage"
            result.warnings.append(f"{key}:historical_or_distant_vintage")
            continue
        result.complete_profile[key] = CompletedDimension(
            value=round(trait.value, 2),
            origin=origin,
            confidence=confidence,
            evidence=list({item.source_url: item for item in [evidence, *valid]}.values()),
        )
        result.dimensions[key] = ResearchTrait(
            value=round(trait.value, 2),
            basis=trait.basis,
            excerpt=trait.excerpt,
            source_url=trait.source_url,
        )
        if comparison:
            result.comparisons.append(
                ResearchComparison(
                    dimension=comparison.dimension,
                    agreement="corroborated" if corroborated else "single_source",
                    independent=corroborated,
                    explanation=comparison.explanation,
                    evidence=[
                        ResearchEvidence(excerpt=item.excerpt, source_url=item.source_url)
                        for item in list(
                            {item.source_url: item for item in [evidence, *valid]}.values()
                        )[:4]
                    ],
                )
            )

    # Conflicts remain unresolved; a donor cannot erase disagreement.
    for comparison in output.comparisons:
        if comparison.agreement == "conflicting":
            conflicting = [item for item in comparison.evidence if verified(item)]
            result.complete_profile[comparison.dimension] = CompletedDimension(
                issue="conflicting_sources", evidence=conflicting
            )
            result.dimensions.pop(comparison.dimension, None)
            if conflicting:
                result.comparisons.append(
                    ResearchComparison(
                        dimension=comparison.dimension,
                        agreement="conflicting",
                        independent=False,
                        explanation=comparison.explanation,
                        evidence=[
                            ResearchEvidence(excerpt=item.excerpt, source_url=item.source_url)
                            for item in conflicting
                        ],
                    )
                )

    for key, completed in result.complete_profile.items():
        if completed.value is not None or completed.issue == "conflicting_sources":
            continue
        donors: list[ProfileReference] = []
        seen: set[tuple[str, str, str]] = set()
        for reference in output.references:
            trait = getattr(reference.dimensions, key)
            if (
                not reference.identity_confirmed
                or not reference.production_style_matches
                or trait is None
            ):
                continue
            if (
                not verified(reference.identity_evidence)
                or not verified(trait)
                or not supports_intensity(key, trait)
            ):
                continue
            identity = (norm(reference.producer), norm(reference.name), norm(reference.vintage))
            if identity in seen:
                continue
            seen.add(identity)
            same_wine = identity[:2] == (norm(wine.producer), norm(wine.name))
            if same_wine:
                if norm(reference.vintage) == norm(wine.vintage):
                    continue  # Exact target observations belong in dimensions, not in donors.
                if trait.scope != "wine_style" and not (
                    reference.vintage.isdigit()
                    and wine.vintage.isdigit()
                    and abs(int(reference.vintage) - int(wine.vintage)) <= 3
                    and exact_evidence(trait, reference.vintage)
                ):
                    continue
                similarity = 0.8 if trait.scope == "wine_style" else 0.9
            else:
                if len(reference.production_evidence) != 2 or not all(
                    verified(item) for item in reference.production_evidence
                ):
                    continue
                target_grapes = {
                    norm(item.get("name")) for item in (wine.grapes or []) if isinstance(item, dict)
                } - {""}
                grapes = {norm(item) for item in reference.grapes} - {""}
                if not target_grapes or not grapes or not wine.appellation.strip():
                    continue
                if not (
                    normalize_wine_type(wine.type) == normalize_wine_type(reference.wine_type)
                    and norm(wine.appellation) == norm(reference.appellation)
                    and len(target_grapes & grapes) / len(target_grapes | grapes) >= 0.75
                ):
                    continue
                if not (
                    reference.vintage.isdigit()
                    and wine.vintage.isdigit()
                    and abs(int(reference.vintage) - int(wine.vintage)) <= 3
                    and exact_evidence(trait, reference.vintage)
                ):
                    continue
                similarity = 0.65
            donors.append(
                ProfileReference(
                    name=reference.name,
                    producer=reference.producer,
                    vintage=reference.vintage,
                    similarity=similarity,
                    value=trait.value,
                    evidence=evidence_from_trait(trait),
                    identity_evidence=reference.identity_evidence,
                    production_evidence=reference.production_evidence,
                )
            )
        same = [donor for donor in donors if donor.similarity >= 0.8]
        chosen = same or donors
        if not chosen:
            continue
        if not same and (len(chosen) < 3 or len({norm(d.evidence.publisher) for d in chosen}) < 2):
            continue
        values = [donor.value for donor in chosen]
        if max(values) - min(values) > 0.2 + 1e-9:
            completed.issue = "reference_disagreement"
            completed.references = chosen
            continue
        result.complete_profile[key] = CompletedDimension(
            value=round(median(values), 2),
            origin="wine_style" if same else "similar_wines",
            confidence=0.4 if same else 0.35,
            references=chosen,
            evidence=[donor.evidence for donor in chosen],
        )

    for aroma in output.aromas:
        url = public_source_url(aroma.source_url)
        if url in sources and verified(
            output.identity_evidence.model_copy(
                update={"source_url": url, "excerpt": aroma.excerpt}
            )
        ):
            aroma.source_url = url
            result.aromas.append(aroma)
            used.add(url)
    result.sources = [sources[url] for url in sorted(used)]
    available = sum(item.value is not None for item in result.complete_profile.values())
    corroborated = sum(item.origin == "corroborated" for item in result.complete_profile.values())
    exact = sum(
        item.origin in {"corroborated", "single_source"}
        for item in result.complete_profile.values()
    )
    result.coverage = {
        "available": available,
        "total": 9,
        "exact_vintage": exact,
        "corroborated": corroborated,
        "estimated": available - exact,
        "unknown": 9 - available,
    }
    result.confidence = round(
        sum(item.confidence for item in result.complete_profile.values()) / 9, 3
    )
    result.status = (
        "ready"
        if available == 9 and result.vintage_confirmed
        else "incomplete"
        if available
        else "no_evidence"
    )
    result.issue = (
        ""
        if result.status == "ready"
        else "vintage_unverified"
        if not result.vintage_confirmed
        else "incomplete_profile"
    )
    return result
