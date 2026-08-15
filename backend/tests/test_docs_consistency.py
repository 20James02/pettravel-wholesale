import os
import re
import pytest

MASTER_PLAN_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "pettravel_master_plan_v2.md"
)
RECONCILIATION_REPORT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "verification_reports", "V11_V12_post_production_evidence_reconciliation.md"
)

def test_master_plan_exists_and_readable():
    assert os.path.exists(MASTER_PLAN_PATH), f"Missing Master Plan at {MASTER_PLAN_PATH}"
    with open(MASTER_PLAN_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    assert len(content) > 10000

def test_master_plan_no_internal_status_contradictions():
    with open(MASTER_PLAN_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # If P1 Status is PRODUCTION_VERIFIED_V11_V12 at top, Section 34 Phase Matrix must not say "Production Verified" = NO for P1
    if "P1 Status: `PRODUCTION_VERIFIED_V11_V12`" in content or "P1 Status**: `PRODUCTION_VERIFIED_V11_V12`" in content:
        # Check P1 row in Phase Matrix
        for line in content.split("\n"):
            if "| **P1** |" in line:
                cols = [c.strip() for c in line.split("|") if c.strip()]
                # cols: [Phase, Scope, Arch, Business, Code, Tests, ProdVer, Overall]
                assert len(cols) >= 8, f"Unexpected P1 columns count: {cols}"
                prod_ver_col = cols[6]
                overall_status_col = cols[7]
                assert "NO" not in prod_ver_col, f"Contradiction: Top P1 is verified, but Section 34 says Production Verified = {prod_ver_col}"
                assert "PRODUCTION_VERIFIED_V11_V12" in overall_status_col

def test_refund_persistence_is_not_falsely_claimed_production_verified():
    with open(MASTER_PLAN_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # P1-REFUND-PERSISTENCE must remain DESIGN_READY or NOT_IMPLEMENTED
    found = False
    for line in content.split("\n"):
        if "P1-REFUND-PERSISTENCE" in line and "|" in line:
            cols = [c.strip() for c in line.split("|") if c.strip()]
            status_col = cols[-1] # last column is Current Exact Status
            assert "DESIGN_READY" in status_col or "NOT_IMPLEMENTED" in status_col, f"P1-REFUND-PERSISTENCE must not be marked verified, found: {status_col}"
            found = True
            break
    assert found, "Could not find P1-REFUND-PERSISTENCE row in Sub-Capability Matrix"

def test_policy_and_tax_blockers_preserved():
    with open(MASTER_PLAN_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    assert "ADR-008" in content
    assert "PENDING_ACCOUNTING_REVIEW" in content
    assert "BLOCKED_BY_TAX_ACCOUNTING_REVIEW" in content

def test_production_postgresql_version_reconciled():
    with open(MASTER_PLAN_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    assert "PostgreSQL 17.6" in content, "Master Plan must reference actual verified production engine PostgreSQL 17.6"

def test_reconciliation_report_exists_and_covers_required_invariants():
    assert os.path.exists(RECONCILIATION_REPORT_PATH), f"Missing report at {RECONCILIATION_REPORT_PATH}"
    with open(RECONCILIATION_REPORT_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    required_keywords = [
        "PostgreSQL 17.6",
        "update_v11_security_accounting_hardening.sql",
        "update_v12_commercial_sot_hardening.sql",
        "pt_reserve_order_stock",
        "pt_post_order_accounting",
        "search_path",
        "ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS",
        "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING",
        "DESIGN_READY / NOT_IMPLEMENTED",
        "PENDING_ACCOUNTING_REVIEW"
    ]
    for kw in required_keywords:
        assert kw in content, f"Reconciliation report missing required keyword: {kw}"
