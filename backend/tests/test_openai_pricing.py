from decimal import Decimal

from app.services.openai_pricing import official_standard_pricing


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return b"""\
### Standard pricing data
| Model | input | cached input | cache writes | output |
| gpt-5.6-sol | $5.00 | $0.50 | $6.25 | $30.00 |
| gpt-5.6-terra | $2.00 | $0.20 | $2.50 | $12.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |
### Batch pricing data
"""


def test_official_standard_pricing_reads_short_context_rates(monkeypatch):
    monkeypatch.setattr(
        "app.services.openai_pricing.urllib.request.urlopen",
        lambda *_args, **_kwargs: FakeResponse(),
    )

    pricing = official_standard_pricing(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"])

    assert pricing["gpt-5.6-luna"] == {"input": "0.20", "cached_input": "0.02", "output": "1.20"}
    assert pricing["gpt-5.6-terra"] == {"input": "2.00", "cached_input": "0.20", "output": "12.00"}
    assert Decimal(pricing["gpt-5.6-sol"]["output"]) == Decimal("30.00")
