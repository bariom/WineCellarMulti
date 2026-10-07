"""Conservative trait relevance for quotations already verified against a source.

A grape, region or production method is context, not a sensory observation.
These rules establish relevance only; they never assign numeric intensity.
"""

import re

from app.services.shared_wine_data import normalize_identity_part as norm

_TRAITS = {
    "body": r"\bbody\b|bodied|\bcorpo\b|\bcorps\b|mittelschwer|vollmund|fyllig",
    "acidity": r"acidit|\bsaure\b|syra|freschezza|fraicheur|\bfrische\b",
    "tannin": r"tannin|tannic|gerbstoff",
    "sweetness": (
        r"sweet|dolce|dolci|douceur|\bsec\b|secco|secca|trocken|\bdry\b|"
        r"residual sugar|zuccheri residui"
    ),
    "aromatic_intensity": r"aroma|profum|bouquet|\bnose\b|\bnaso\b|\bnez\b|duft|doft",
    "fruit": (
        r"frutt|\bfruit\w*|frucht|frukt|cherry|cherries|cilieg|cassis|berry|berries|"
        r"prun|plum|agrum|citrus|peach|pesca"
    ),
    "wood": r"boise|vanill|cedar|cedro|toast|tostat|oak|wood|legno|holz|eiche",
    "spice": r"\bspic|\bspezi|\bepic|\bwurz|\bkrydd|pepper|\bpepe|poivre|cannell|cinnamon",
    "minerality": r"mineral|salin|sapid|flint|pietra focaia|silex",
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
