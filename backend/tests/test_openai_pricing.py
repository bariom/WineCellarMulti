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
| gpt-6.1-sol | $2.00 | $0.10 | $2.50 | $10.00 |
| gpt-6-luna | $0.10 | $0.01 | $0.125 | $0.50 |
| gpt-6-astra | $10.00 | $1.00 | $12.50 | $50.00 |
### Batch pricing data
"""


def test_official_standard_pricing_reads_short_context_rates(monkeypatch):
    monkeypatch.setattr(
        "app.services.openai_pricing.urllib.request.urlopen",
        lambda *_args, **_kwargs: FakeResponse(),
    )

    pricing = official_standard_pricing(["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"])

    assert pricing["gpt-6-luna"] == {"input": "0.10", "cached_input": "0.01", "output": "0.50"}
    assert pricing["gpt-6.1-sol"] == {"input": "2.00", "cached_input": "0.10", "output": "10.00"}
    assert pricing["gpt-6-astra"] == {"input": "10.00", "cached_input": "1.00", "output": "50.00"}
