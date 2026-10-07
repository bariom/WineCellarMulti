"""Conservative trait relevance for quotations already verified against a source.

A grape, region or production method is context, not a sensory observation.
These rules establish relevance only; they never assign numeric intensity.
"""

import re

from app.services.shared_wine_data import normalize_identity_part as norm

_TRAITS = {
    "body": (
        r"\bbody\b|bodied|\bcorpo\b|corpos[oa]|\bcorps\b|mittelschwer|vollmund|fyllig|"
        r"\bstructure\b|\bstruttura\b|\bmouth (?:is )?full\b|"
        r"\bpalato (?:ampio|pieno)\b|\bample(?:\s+gras|\s+genereux)* le palais\b|"
        r"\bfeels light and sculpted\b"
    ),
    "acidity": (
        r"acidit|\bsaure\b|syra|freschezza|fraicheur|\bfrische\b|"
        r"\bal palato (?:e )?fresco\b|\bpalate (?:is )?fresh\b(?!\s+(?:fruit|aroma))"
    ),
    "tannin": r"tannin|tannic|\btanins?\b|gerbstoff",
    "sweetness": (
        r"sweet|dolce|dolci|douceur|\bsec\b|secco|secca|trocken|\bdry\b|"
        r"residual sugar|zuccheri residui"
    ),
    "aromatic_intensity": r"arom[ai]|profum|perfume|bouquet|\bnose\b|\bnaso\b|\bnez\b|duft|doft",
    "fruit": (
        r"frutt|\bfruit\w*|frucht|frukt|cherry|cherries|cilieg|cassis|berry|berries|"
        r"prun|plum|agrum|citrus|peach|pesca"
    ),
    "wood": r"boise|vanill|cedar|cedro|toast|tostat|oak|wood|legno|holz|eiche",
    "spice": (
        r"\bspic|\bspezi|\bepic|\bwurz|\bkrydd|pepper|\bpepe|poivre|cannell|cinnamon|"
        r"liquiriz|licorice|liquorice|piperit|ginger|zenzer"
    ),
    "minerality": (
        r"mineral|salin|sapid|flint|pietra focaia|silex|chalk|gess|oyster shell|crushed rock"
    ),
}


def describes_trait(key: str, excerpt: str) -> bool:
    text = norm(excerpt)
    if not re.search(_TRAITS.get(key, r"(?!)"), text):
        return False
    if key == "wood" and re.search(
        r"barrel|barrique|botti|bott[ei]|affin|aged|aging|elevage", text
    ):
        return bool(
            re.search(r"aroma|note|nose|naso|nez|sentor|flavou?r|boise|vanill|cedar|tostat", text)
        )
    if key == "sweetness" and re.search(
        r"drying|appass|dried fruit|frutta secca|grape sugar", text
    ):
        return bool(re.search(r"residual sugar|zuccheri residui|sweetness|dolcezza", text))
    return True
