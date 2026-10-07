import pytest

from app.services.sensory_relevance import describes_trait


@pytest.mark.parametrize("key", ["body", "tannin", "fruit", "spice", "aromatic_intensity"])
def test_grape_identity_is_context_only(key):
    assert not describes_trait(key, "Der Rosso del Principe, ein reinsortiger Merlot")


@pytest.mark.parametrize(
    "key,text,expected",
    [
        ("aromatic_intensity", "un rosato dagli aromi decisi ed intensi", True),
        ("tannin", "des tanins puissants", True),
        ("body", "Ample, gras, généreux, le palais", True),
        ("acidity", "Al palato è fresco", True),
        ("acidity", "fresh fruit aromas", False),
        ("wood", "un nez boisé et épicé.", True),
        ("spice", "un nez boisé et épicé.", True),
        ("aromatic_intensity", "un nez boisé et épicé.", True),
        ("tannin", "Le palais est structuré et long.", False),
        ("fruit", "mittelschwerer Wein", False),
        ("body", "mittelschwerer Wein", True),
        ("acidity", "Der Stil orientiert sich an Frische und Eleganz", True),
        ("wood", "Aged in oak barrels for 18 months", False),
        ("wood", "Aged in oak barrels, with pronounced vanilla aromas", True),
        ("sweetness", "Dried fruit notes", False),
        ("fruit", "Aromi di ciliegia", True),
    ],
)
def test_trait_relevance_is_not_numeric_intensity(key, text, expected):
    assert describes_trait(key, text) is expected
