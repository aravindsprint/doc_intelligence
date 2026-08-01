"""
Deterministic, non-AI validation helpers for AI-extracted financial documents.

These run *after* the LLM extraction step and add a trust/safety layer without
spending any extra tokens:

  - validate_financials(): recalculates subtotal/tax/grand total from the
    extracted line items and tax entries, then cross-checks that against the
    AI-reported grand total within a tolerance band. Flags a HIGH risk_level
    if they disagree by more than the tolerance.

  - intelligent_supplier_match(): exact-match first, then a fuzzy
    difflib.SequenceMatcher pass against existing Suppliers. Deliberately
    returns no match (rather than guessing) when multiple suppliers are
    ambiguously close, so a human reviews it instead of an auto-pick being
    silently wrong.

Both are pure Python — no LLM calls, no network — so they're fast and free
to run on every extraction.
"""

import difflib
import frappe


def _safe_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def validate_financials(items, tax_amount=0, grand_total=0, tolerance_percent=0.02):
    """
    Recomputes subtotal/tax/grand total from extracted items and compares
    against the AI-reported grand_total.

    items: list of dicts with qty/rate and/or amount keys (same shape used
           by create_purchase_invoice's extracted items list).
    tax_amount: AI-reported total tax (single number, matches this app's
                extraction schema — unlike Zikpro's per-line tax array).
    grand_total: AI-reported grand total to validate against.
    tolerance_percent: allowed relative difference before flagging HIGH risk
                        (default 2%, matches typical rounding/tax slack).

    Returns a dict safe to send straight to the frontend for display.
    """
    calculated_subtotal = 0.0
    for item in (items or []):
        qty = _safe_float(item.get("qty"))
        rate = _safe_float(item.get("rate"))
        amount = _safe_float(item.get("amount"))
        if qty > 0 and rate > 0:
            calculated_subtotal += qty * rate
        else:
            calculated_subtotal += amount

    calculated_tax = _safe_float(tax_amount)
    calculated_grand_total = calculated_subtotal + calculated_tax
    detected_total = _safe_float(grand_total)

    mismatch_amount = abs(calculated_grand_total - detected_total)
    allowed_difference = (detected_total * tolerance_percent) if detected_total > 0 else 1.0

    is_valid = mismatch_amount <= allowed_difference
    risk_level = "LOW" if is_valid else "HIGH"
    confidence_adjustment = 5 if is_valid else -20

    return {
        "is_valid": is_valid,
        "calculated_subtotal": round(calculated_subtotal, 2),
        "calculated_tax": round(calculated_tax, 2),
        "calculated_grand_total": round(calculated_grand_total, 2),
        "detected_grand_total": round(detected_total, 2),
        "mismatch_amount": round(mismatch_amount, 2),
        "risk_level": risk_level,
        "confidence_adjustment": confidence_adjustment,
    }


def intelligent_entity_match(doctype, name_field, detected_name):
    """
    Generic version of intelligent_supplier_match — matches an AI-extracted
    name string against existing records of *any* doctype/name field
    (Item/item_name, Customer/customer_name, Employee/employee_name, etc).

    Same exact-then-fuzzy-with-ambiguity-detection logic: refuses to
    auto-pick when multiple records are ambiguously close, so a human
    reviews it instead of a silently-wrong auto-match.

    Returns: {"match": name_or_None, "confidence": 0-100, "multiple_matches": bool}
    """
    if not detected_name:
        return {"match": None, "confidence": 0, "multiple_matches": False}

    needle = detected_name.strip().lower()
    if not needle:
        return {"match": None, "confidence": 0, "multiple_matches": False}

    records = frappe.get_all(doctype, fields=["name", name_field])

    # 1. Exact match (case-insensitive)
    for r in records:
        val = r.get(name_field)
        if val and val.strip().lower() == needle:
            return {"match": r.name, "confidence": 100, "multiple_matches": False}

    # 2. Fuzzy similarity
    scores = []
    for r in records:
        val = r.get(name_field)
        if not val:
            continue
        score = difflib.SequenceMatcher(None, needle, val.strip().lower()).ratio()
        scores.append((score, r.name))

    if not scores:
        return {"match": None, "confidence": 0, "multiple_matches": False}

    scores.sort(reverse=True, key=lambda x: x[0])
    best_score, best_match = scores[0]
    confidence = int(best_score * 100)

    # 3. Ambiguity check — don't guess if several records are all plausibly close
    close_matches = [s for s in scores if s[0] > 0.75]
    if len(close_matches) > 1:
        return {"match": None, "confidence": confidence, "multiple_matches": True}

    # 4. Threshold — only auto-match with reasonable confidence
    if confidence >= 80:
        return {"match": best_match, "confidence": confidence, "multiple_matches": False}

    return {"match": None, "confidence": confidence, "multiple_matches": False}


def intelligent_supplier_match(detected_name):
    """
    Matches an AI-extracted supplier name string against existing Supplier
    records. Thin wrapper over intelligent_entity_match(), kept as its own
    function (and its own "supplier" response key) for backward
    compatibility with the existing Purchase Invoice flow.

    Returns: {"supplier": name_or_None, "confidence": 0-100, "multiple_matches": bool}
    """
    result = intelligent_entity_match("Supplier", "supplier_name", detected_name)
    return {
        "supplier": result["match"],
        "confidence": result["confidence"],
        "multiple_matches": result["multiple_matches"],
    }
