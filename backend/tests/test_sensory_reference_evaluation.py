from scripts.evaluate_sensory_references import evaluate, render


def test_offline_comparison_preserves_uncertainty_and_is_reproducible():
    report = evaluate()
    assert report == evaluate()
    summary = report["summary"]
    assert (summary["wines"], summary["countries"], summary["styles"]) == (15, 11, 5)
    assert summary["traits"] == 135
    assert summary["accuracy"] is None
    assert summary["calibration_references"] == 0
    rows = {r["id"]: r for r in report["rows"]}
    assert all(t["action"] == "blocked" for t in rows["catena-malbec-2022"]["traits"])
    ridge = {t["dimension"]: t for t in rows["ridge-estate-chardonnay-2022"]["traits"]}
    assert ridge["body"]["evidence_status"] == "conflicting"
    assert ridge["acidity"]["action"] == "blocked"
    for row in report["rows"]:
        assert not row["calibration_eligible"]
        for trait in row["traits"]:
            if trait["action"] == "retain":
                assert trait["before"] == trait["proposed"]
    changes = [
        (r["id"], t["dimension"], t["before"], t["proposed"])
        for r in report["rows"]
        for t in r["traits"]
        if t["action"] == "adjust"
    ]
    assert changes == [("klein-vin-de-constance-2020", "body", 0.52, 0.6)]


def test_report_escapes_text_and_distinguishes_baseline_scope():
    report = evaluate()
    report["rows"][0]["wine"] = "<script>unsafe</script>"
    result = render(report)
    assert "<script>" not in result
    assert "&lt;script&gt;" in result
    assert "senza profili del server" in result
    assert "non valida il numero conservato" in result
