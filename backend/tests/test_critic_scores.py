import pytest

from app.prompts.library import wine_scores_prompt
from app.services.critic_scores import score_matches_page, scores_for_display, supported_ai_scores


@pytest.mark.parametrize(
    "note",
    [
        "Stima prudente: potrebbe rientrare nel range tipico, ma non ho riscontro diretto.",
        "Ipotesi solo se recensito in modo aggregato; evidenza debole sulla bottiglia esatta.",
        "Possibile fascia, ma non trovo conferma specifica per Les Femelottes 2022.",
        "Range ipotetico basato sul profilo classico piemontese; evidenza diretta debole.",
        "Rosé 2016 di Louis Roederer, da verificare",
        "Stima molto incerta: i punteggi potrebbero non essere ancora pubblicati.",
    ],
)
def test_legacy_estimates_are_flagged_without_rewriting_them(note):
    score = {"critic": "Critic", "score": "89-91", "note": note}
    assert scores_for_display([score])[0]["verification_status"] == "unverified"
    assert "verification_status" not in score
    assert (
        supported_ai_scores(
            [{**score, "source_url": "https://example.com/wine", "exact_wine_and_vintage": True}],
            [{"url": "https://example.com/wine"}],
        )
        == []
    )


def test_scores_require_matching_consulted_source_and_exact_identity():
    score = {
        "critic": "Critic",
        "score": "89-91",
        "note": "Published en-primeur range",
        "source_url": "https://example.com/wine",
        "exact_wine_and_vintage": True,
    }
    assert supported_ai_scores([score], []) == []
    assert (
        supported_ai_scores(
            [{**score, "exact_wine_and_vintage": False}], [{"url": score["source_url"]}]
        )
        == []
    )
    assert supported_ai_scores([None, {}, "bad"], []) == []
    accepted = supported_ai_scores([score], [{"url": score["source_url"]}])
    assert accepted[0]["score"] == "89-91"
    assert "verification_status" not in scores_for_display(accepted)[0]
    assert (
        supported_ai_scores(
            [{**score, "score": "n/d (probabile pubblicazione futura)"}],
            [{"url": score["source_url"]}],
        )
        == []
    )


def test_quote_must_match_real_page_and_exact_wine_vintage_critic_score():
    quote = "Chavy-Chouet Les Femelottes 2022 — Jasper Morris 89-91 points."
    score = {"critic": "Jasper Morris", "score": "89-91", "evidence_quote": quote}
    identity = {"name": "Les Femelottes", "producer": "Chavy-Chouet", "vintage": "2022"}
    assert score_matches_page(score, quote, **identity)
    assert not score_matches_page(score, "Not found", **identity)
    assert not score_matches_page(score, quote, **{**identity, "vintage": "2023"})
    assert not score_matches_page({**score, "critic": "Wine Advocate"}, quote, **identity)
    assert not score_matches_page({**score, "score": "92"}, quote, **identity)


def test_source_reader_rejects_private_destinations(monkeypatch):
    from app.services.score_sources import public_page_text

    monkeypatch.setattr("socket.getaddrinfo", lambda *a, **kw: [(2, 1, 6, "", ("127.0.0.1", 80))])
    assert public_page_text("http://internal.example/review") == ""
    assert public_page_text("file:///etc/passwd") == ""
    assert public_page_text("https://user:secret@example.com/review") == ""


def test_source_reader_extracts_visible_text(monkeypatch):
    from app.services.score_sources import public_page_text

    monkeypatch.setattr(
        "socket.getaddrinfo", lambda *a, **kw: [(2, 1, 6, "", ("93.184.216.34", 443))]
    )

    class Response:
        status = 200

        def getheader(self, name, default=None):
            return "text/html"

        def read(self, limit):
            return b"<p>Wine 2022 Critic 92</p><script>fake 100</script>"

    class Connection:
        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr("http.client.HTTPSConnection", Connection)
    assert public_page_text("https://example.com/review") == "Wine 2022 Critic 92"


@pytest.mark.parametrize("locale", ["it", "en"])
def test_score_prompt_requires_evidence_and_retains_wine_context(locale):
    prompt = wine_scores_prompt(locale=locale, wine_context="Les Femelottes 2022")
    assert prompt.version == "2"
    assert "source_url" in prompt.system
    assert "exact_wine_and_vintage=true" in prompt.system
    assert "Never infer" in prompt.system
    assert "empty scores array" in prompt.user
    assert "Les Femelottes 2022" in prompt.user
