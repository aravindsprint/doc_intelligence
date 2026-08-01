import frappe
from frappe.utils import nowdate, cint, flt
import json


def check_app_permission():
    return frappe.session.user != "Guest"


@frappe.whitelist()
def list_documents(status=None, document_type=None, limit=20, offset=0):
    filters = {}
    if status:
        filters["status"] = status
    if document_type:
        filters["document_type"] = document_type
    docs = frappe.get_list(
        "AI Document", filters=filters,
        fields=["name","title","document_type","status","processed_on","token_count","provider_used","creation","owner"],
        order_by="creation desc", limit=cint(limit), start=cint(offset),
    )
    return {"data": docs, "total": frappe.db.count("AI Document", filters=filters)}


@frappe.whitelist()
def get_document(doc_name):
    doc = frappe.get_doc("AI Document", doc_name)
    d = doc.as_dict()
    if d.get("extracted_table"):
        try:
            d["extracted_table_parsed"] = json.loads(d["extracted_table"])
        except Exception:
            d["extracted_table_parsed"] = []
    return d


@frappe.whitelist()
def delete_document(doc_name):
    """Deletes an AI Document. Only the document's owner or a System Manager
    may delete it, and only if it isn't currently mid-processing."""
    doc = frappe.get_doc("AI Document", doc_name)

    is_owner = doc.owner == frappe.session.user
    is_manager = "System Manager" in frappe.get_roles(frappe.session.user)
    if not (is_owner or is_manager):
        frappe.throw("You don't have permission to delete this document.", frappe.PermissionError)

    if doc.status == "Processing":
        frappe.throw("This document is still processing — please wait for it to finish before deleting.")

    frappe.delete_doc("AI Document", doc_name, ignore_permissions=True)
    return {"success": True}


@frappe.whitelist()
def bulk_delete_documents(doc_names):
    """Deletes multiple AI Documents in one call. Same permission/status
    rules as delete_document, applied per-document — one bad document
    (not yours, or still processing) doesn't block the rest from deleting."""
    if isinstance(doc_names, str):
        doc_names = json.loads(doc_names)

    is_manager = "System Manager" in frappe.get_roles(frappe.session.user)
    deleted, skipped = [], []

    for doc_name in doc_names:
        try:
            doc = frappe.get_doc("AI Document", doc_name)
        except frappe.DoesNotExistError:
            skipped.append({"name": doc_name, "reason": "Not found"})
            continue

        is_owner = doc.owner == frappe.session.user
        if not (is_owner or is_manager):
            skipped.append({"name": doc_name, "reason": "No permission"})
            continue
        if doc.status == "Processing":
            skipped.append({"name": doc_name, "reason": "Still processing"})
            continue

        frappe.delete_doc("AI Document", doc_name, ignore_permissions=True)
        deleted.append(doc_name)

    return {"deleted": deleted, "skipped": skipped}


@frappe.whitelist()
def upload_document(title, document_type, file_url):
    doc = frappe.get_doc({"doctype": "AI Document", "title": title, "document_type": document_type, "file_attachment": file_url, "status": "Pending"})
    doc.insert()
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def ask_document(doc_name, question):
    from doc_intelligence.doc_intelligence.llm_engine import ask_question
    doc = frappe.get_doc("AI Document", doc_name)
    if doc.status != "Ready":
        frappe.throw("Document must be in Ready status before asking questions.")
    settings = frappe.get_single("Doc Intelligence Settings")
    result = ask_question(doc.raw_text, doc.title, doc.document_type, question, frappe.session.user, settings.max_tokens_per_request or 2000)
    tokens = (result.get("_meta") or {}).get("tokens_out", 0)
    doc.user_question = question
    doc.ai_answer = result.get("answer", "")
    doc.save(ignore_permissions=True)
    return {"answer": doc.ai_answer, "provider": (result.get("_meta") or {}).get("provider"), "tokens": tokens}


@frappe.whitelist()
def compare_documents(doc_name_a, doc_name_b, aspect=None):
    from doc_intelligence.doc_intelligence.llm_engine import compare_documents as engine_compare
    doc_a = frappe.get_doc("AI Document", doc_name_a)
    doc_b = frappe.get_doc("AI Document", doc_name_b)
    for d in [doc_a, doc_b]:
        if d.status != "Ready":
            frappe.throw(f"Document '{d.name}' must be in Ready status.")
    settings = frappe.get_single("Doc Intelligence Settings")
    result = engine_compare(doc_a.raw_text, doc_a.title, doc_b.raw_text, doc_b.title, aspect, frappe.session.user, settings.max_tokens_per_request or 2000)
    return result


@frappe.whitelist()
def get_document_stats():
    total = frappe.db.count("AI Document")
    ready = frappe.db.count("AI Document", {"status": "Ready"})
    processing = frappe.db.count("AI Document", {"status": "Processing"})
    failed = frappe.db.count("AI Document", {"status": "Failed"})
    pending = frappe.db.count("AI Document", {"status": "Pending"})
    tokens = frappe.db.sql("SELECT SUM(token_count) FROM `tabAI Document`")[0][0] or 0
    by_type = frappe.db.sql("SELECT document_type, COUNT(*) as cnt FROM `tabAI Document` GROUP BY document_type", as_dict=True)
    return {"total": total, "ready": ready, "processing": processing, "failed": failed, "pending": pending, "total_tokens": tokens, "by_type": by_type}


@frappe.whitelist()
def get_provider_health_stats():
    from doc_intelligence.doc_intelligence.llm_engine import get_provider_health
    return get_provider_health()


@frappe.whitelist()
def get_provider_settings():
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Only System Manager can view provider settings.", frappe.PermissionError)
    settings = frappe.get_single("Doc Intelligence Settings")
    def mask(val): return "xxxxxx" if val else ""
    return {
        "enabled_providers": settings.enabled_providers or "groq,gemini,cerebras,openrouter,mistral,claude",
        "groq_api_key": mask(settings.groq_api_key), "groq_model": settings.groq_model,
        "gemini_api_key": mask(settings.gemini_api_key), "gemini_model": settings.gemini_model,
        "cerebras_api_key": mask(settings.cerebras_api_key), "cerebras_model": settings.cerebras_model,
        "openrouter_api_key": mask(settings.openrouter_api_key), "openrouter_model": settings.openrouter_model,
        "mistral_api_key": mask(settings.mistral_api_key), "mistral_model": settings.mistral_model,
        "claude_api_key": mask(settings.claude_api_key), "claude_model": settings.claude_model,
        "openai_api_key": mask(settings.openai_api_key), "openai_model": settings.openai_model,
        "deepseek_api_key": mask(settings.deepseek_api_key), "deepseek_model": settings.deepseek_model,
        "max_tokens_per_request": settings.max_tokens_per_request or 2000,
        "platform_name": settings.platform_name, "support_email": settings.support_email,
    }


@frappe.whitelist()
def save_provider_settings(settings):
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Only System Manager can update provider settings.", frappe.PermissionError)
    if isinstance(settings, str):
        settings = json.loads(settings)
    doc = frappe.get_single("Doc Intelligence Settings")
    key_fields = ["groq_api_key","gemini_api_key","cerebras_api_key","openrouter_api_key","mistral_api_key","claude_api_key","deepseek_api_key","openai_api_key"]
    for field, value in settings.items():
        if field in key_fields and value == "xxxxxx":
            continue
        if hasattr(doc, field):
            setattr(doc, field, value)
    doc.save(ignore_permissions=True)
    return {"success": True}


@frappe.whitelist()
def test_providers():
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Only System Manager can test providers.", frappe.PermissionError)
    from doc_intelligence.doc_intelligence.llm_engine import PROVIDERS, _get_settings, _call_openai_compat, _call_claude, _RateLimitError, _ProviderError
    settings = _get_settings()
    results = []
    for p in PROVIDERS:
        key = getattr(settings, p["key_field"], None)
        if not key:
            results.append({"provider": p["id"], "status": "skipped", "message": "No API key"})
            continue
        try:
            resp = _call_openai_compat(p, "Reply with single word: ok", "You are a test.", 10, settings) if p["openai_compat"] else _call_claude(p, "Reply with single word: ok", "You are a test.", 10, settings)
            results.append({"provider": p["id"], "status": "pass", "response": resp.get("text", "")[:50]})
        except Exception as e:
            results.append({"provider": p["id"], "status": "fail", "message": str(e)})
    return results


@frappe.whitelist()
def create_purchase_invoice(doc_name):
    """Use AI to extract Purchase Invoice fields from AI Document and create a draft PI."""
    from doc_intelligence.doc_intelligence.llm_engine import llm_call

    doc = frappe.get_doc("AI Document", doc_name)
    if doc.status != "Ready":
        frappe.throw("Document must be in Ready status before creating a Purchase Invoice.")

    if not doc.raw_text:
        frappe.throw("No raw text found. Please re-process the document first.")

    # Get default company info for context
    default_company = frappe.defaults.get_global_default("company") or ""
    
    prompt = f"""You are an ERPNext expert. Extract Purchase Invoice fields from this invoice document text.

Return ONLY a valid JSON object with these exact keys (use null for fields not found):
{{
  "supplier_name": "exact supplier/vendor name as shown",
  "bill_no": "invoice number / bill number",
  "bill_date": "invoice date in YYYY-MM-DD format",
  "posting_date": "today or invoice date in YYYY-MM-DD format", 
  "due_date": "due date or payment due date in YYYY-MM-DD format, null if not found",
  "currency": "currency code like INR, USD etc, default INR",
  "items": [
    {{
      "item_name": "description of item/service",
      "qty": numeric_quantity,
      "rate": numeric_unit_rate,
      "amount": numeric_total_amount,
      "uom": "unit like Nos, Kg, Meter etc"
    }}
  ],
  "grand_total": numeric_grand_total,
  "tax_amount": numeric_total_tax_if_any,
  "remarks": "any additional notes or remarks"
}}

Document text:
---
{doc.raw_text[:8000]}
---

Return only the JSON, no explanation."""

    settings = frappe.get_single("Doc Intelligence Settings")
    result = llm_call(prompt, "You are a precise invoice data extractor. Return only valid JSON.", 
                      settings.max_tokens_per_request or 2000)

    # Parse AI response
    import json, re
    text = result.get("text", "")
    # Strip markdown code blocks if present
    text = re.sub(r"```json\s*|\s*```", "", text).strip()
    
    try:
        extracted = json.loads(text)
    except Exception:
        frappe.throw(f"AI could not parse invoice data. Raw response: {text[:500]}")

    # Match supplier using exact-then-fuzzy matching with ambiguity detection,
    # instead of trusting the first crude LIKE hit.
    from doc_intelligence.doc_intelligence.validation import intelligent_supplier_match, validate_financials

    supplier_name = extracted.get("supplier_name") or ""
    supplier_match = intelligent_supplier_match(supplier_name)
    matched_supplier = supplier_match["supplier"]

    # Build items list
    items = []
    for item in (extracted.get("items") or []):
        items.append({
            "item_name": item.get("item_name") or "Services",
            "description": item.get("item_name") or "Services",
            "qty": float(item.get("qty") or 1),
            "rate": float(item.get("rate") or item.get("amount") or 0),
            "amount": float(item.get("amount") or 0),
            "uom": item.get("uom") or "Nos",
            "expense_account": frappe.db.get_value("Company", default_company, "default_expense_account") or "",
        })

    if not items:
        items = [{
            "item_name": "Invoice Amount",
            "description": f"From document: {doc.title}",
            "qty": 1,
            "rate": float(extracted.get("grand_total") or 0),
            "amount": float(extracted.get("grand_total") or 0),
            "uom": "Nos",
        }]

    # Independently recompute totals from the extracted items/tax and flag
    # any disagreement with the AI-reported grand_total before this ever
    # reaches a draft Purchase Invoice.
    validation = validate_financials(
        items,
        tax_amount=extracted.get("tax_amount") or 0,
        grand_total=extracted.get("grand_total") or 0,
    )

    # Duplicate invoice check — same bill_no already recorded against this
    # supplier (or unmatched supplier + same bill_no as a softer signal).
    duplicate_of = None
    bill_no = extracted.get("bill_no")
    if bill_no:
        filters = {"bill_no": bill_no}
        if matched_supplier:
            filters["supplier"] = matched_supplier
        existing = frappe.db.get_value(
            "Purchase Invoice", filters, ["name", "supplier", "grand_total"], as_dict=True
        )
        if existing:
            duplicate_of = existing

    return {
        "extracted": extracted,
        "matched_supplier": matched_supplier,
        "supplier_name": supplier_name,
        "supplier_match_confidence": supplier_match["confidence"],
        "supplier_multiple_matches": supplier_match["multiple_matches"],
        "items": items,
        "doc_name": doc_name,
        "ai_provider": result.get("provider", ""),
        "validation": validation,
        "duplicate_of": duplicate_of,
    }


@frappe.whitelist()
def create_purchase_invoice_doc(supplier, bill_no, bill_date, posting_date, due_date,
                                 company, currency, items, remarks, naming_series,
                                 confirm_duplicate=0):
    import json

    if isinstance(items, str):
        items = json.loads(items)

    # Hard safety net: block an exact-duplicate bill_no+supplier unless the
    # user has explicitly confirmed they want to proceed anyway (the
    # frontend already warns on this via create_purchase_invoice's
    # duplicate_of field — this is the server-side backstop).
    if bill_no and supplier and not frappe.utils.cint(confirm_duplicate):
        existing = frappe.db.get_value(
            "Purchase Invoice", {"bill_no": bill_no, "supplier": supplier}, "name"
        )
        if existing:
            frappe.throw(
                f"A Purchase Invoice with bill no '{bill_no}' already exists for this "
                f"supplier ({existing}). Pass confirm_duplicate=1 to create it anyway."
            )

    expense_account = frappe.db.get_value("Company", company, "default_expense_account") or "Cost of Goods Sold - PSS"

    pi_items = []
    for item in items:
        pi_items.append({
            "item_name": item.get("item_name") or "Services",
            "description": item.get("item_name") or "Services",
            "qty": float(item.get("qty") or 1),
            "rate": float(item.get("rate") or 0),
            "uom": item.get("uom") or "Nos",
            "expense_account": expense_account,
        })

    doc = frappe.get_doc({
        "doctype": "Purchase Invoice",
        "naming_series": naming_series or "PINV26/.#####",
        "supplier": supplier,
        "bill_no": bill_no,
        "bill_date": bill_date,
        "posting_date": posting_date,
        "due_date": due_date or posting_date,
        "company": company,
        "currency": currency or "INR",
        "items": pi_items,
        "custom_pending_remarks": remarks or "Created via Doc Intelligence",
    })
    doc.insert(ignore_mandatory=True)
    frappe.db.commit()
    return {"name": doc.name, "doctype": "Purchase Invoice"}
# =====================================================================
# ENTITY CREATE ACTIONS  —  append to:
#   apps/doc_intelligence/doc_intelligence/doc_intelligence/api/__init__.py
#
# Pattern mirrors create_purchase_invoice / create_purchase_invoice_doc:
#   extract_entity(doc_name, entity_type)  -> AI extracts + matches existing
#   create_entity_doc(entity_type, values) -> inserts the target doctype
# =====================================================================

import json
import re


# ---- Per-entity extraction schemas (what the AI should pull out) ----
# Each schema is the JSON shape we ask the model to return. Keep keys
# aligned with the target doctype's fieldnames where possible so the
# dialog + creation step stay simple.
_ENTITY_SCHEMAS = {
    "Item": {
        "item_name": "name of the product/item",
        "item_code": "item code / SKU if present, else null",
        "description": "short description",
        "item_group": "category/group if mentioned, else null",
        "stock_uom": "unit of measure like Nos, Kg, Meter (default Nos)",
        "standard_rate": "unit price as a number, else null",
        "hsn_code": "HSN/SAC tax code if present, else null",
        "brand": "brand if mentioned, else null",
    },
    "Supplier": {
        "supplier_name": "vendor / supplier company name",
        "supplier_group": "group/category if mentioned, else null",
        "supplier_type": "'Company' or 'Individual' (default Company)",
        "tax_id": "GSTIN / VAT / tax number if present, else null",
        "email_id": "email if present, else null",
        "mobile_no": "phone/mobile if present, else null",
        "address_line1": "street address if present, else null",
        "city": "city, else null",
        "state": "state, else null",
        "pincode": "postal code, else null",
        "country": "country (default India)",
    },
    "Customer": {
        "customer_name": "customer / buyer name",
        "customer_group": "group if mentioned, else null",
        "customer_type": "'Company' or 'Individual' (default Company)",
        "tax_id": "GSTIN / VAT / tax number if present, else null",
        "email_id": "email if present, else null",
        "mobile_no": "phone/mobile if present, else null",
        "territory": "region/territory if mentioned, else null",
        "address_line1": "street address if present, else null",
        "city": "city, else null",
        "state": "state, else null",
        "pincode": "postal code, else null",
        "country": "country (default India)",
    },
    "Employee": {
        "employee_name": "full name of the person",
        "first_name": "first / given name",
        "last_name": "surname / family name, else null",
        "designation": "job title / role, else null",
        "department": "department if mentioned, else null",
        "gender": "'Male'/'Female'/'Other' if inferable, else null",
        "date_of_birth": "DOB in YYYY-MM-DD, else null",
        "date_of_joining": "joining date in YYYY-MM-DD, else null",
        "cell_number": "phone/mobile if present, else null",
        "personal_email": "email if present, else null",
    },
    "Address": {
        "address_title": "a short label for this address (person/company name)",
        "address_type": "one of Billing/Shipping/Office/Personal (default Billing)",
        "address_line1": "street address line 1",
        "address_line2": "street address line 2, else null",
        "city": "city",
        "state": "state, else null",
        "pincode": "postal / ZIP code, else null",
        "country": "country (default India)",
        "email_id": "email if present, else null",
        "phone": "phone if present, else null",
    },
    "Contact": {
        "first_name": "first / given name",
        "last_name": "surname / family name, else null",
        "designation": "job title if present, else null",
        "company_name": "organisation they belong to, else null",
        "email_id": "primary email, else null",
        "mobile_no": "mobile/phone, else null",
        "department": "department if present, else null",
    },
    "Warehouse": {
        "warehouse_name": "name of the warehouse / storage location",
        "warehouse_type": "type if mentioned (e.g. Stores, Transit), else null",
        "address_line1": "street address if present, else null",
        "city": "city, else null",
        "state": "state, else null",
        "pincode": "postal code, else null",
        "phone_no": "phone if present, else null",
    },
}

# Which existing doctype to search for a fuzzy match, and on which field.
# Used to warn "already exists in ERPNext" in the dialog.
_ENTITY_MATCH = {
    "Item": ("Item", "item_name"),
    "Supplier": ("Supplier", "supplier_name"),
    "Customer": ("Customer", "customer_name"),
    "Employee": ("Employee", "employee_name"),
    "Warehouse": ("Warehouse", "warehouse_name"),
    # Address / Contact are party-linked; no meaningful standalone match
}


@frappe.whitelist()
def extract_entity(doc_name, entity_type):
    """Use AI to extract fields for a target ERPNext entity from the AI Document text."""
    from doc_intelligence.doc_intelligence.llm_engine import llm_call

    if entity_type not in _ENTITY_SCHEMAS:
        frappe.throw(f"Unsupported entity type: {entity_type}")

    doc = frappe.get_doc("AI Document", doc_name)
    if doc.status != "Ready":
        frappe.throw("Document must be in Ready status before extracting data.")
    if not doc.raw_text:
        frappe.throw("No raw text found. Please re-process the document first.")

    schema = _ENTITY_SCHEMAS[entity_type]
    schema_json = json.dumps(schema, indent=2)

    prompt = f"""You are an ERPNext expert. From the document text below, extract the fields to create a new {entity_type} record.

Return ONLY a valid JSON object with these exact keys (use null when a value is not present in the document):
{schema_json}

Document text:
---
{doc.raw_text[:8000]}
---

Return only the JSON object, no explanation, no markdown."""

    settings = frappe.get_single("Doc Intelligence Settings")
    result = llm_call(
        prompt,
        f"You are a precise {entity_type} data extractor. Return only valid JSON.",
        settings.max_tokens_per_request or 2000,
    )

    text = result.get("text", "")
    text = re.sub(r"```json\s*|\s*```", "", text).strip()
    try:
        extracted = json.loads(text)
    except Exception:
        frappe.throw(f"AI could not parse {entity_type} data. Raw response: {text[:500]}")

    # Fuzzy-match against existing records so the user is warned about duplicates
    matched = None
    match_confidence = 0
    match_multiple = False
    if entity_type in _ENTITY_MATCH:
        from doc_intelligence.doc_intelligence.validation import intelligent_entity_match
        target_dt, match_field = _ENTITY_MATCH[entity_type]
        val = (extracted.get(match_field) or "").strip()
        if val:
            match_result = intelligent_entity_match(target_dt, match_field, val)
            matched = match_result["match"]
            match_confidence = match_result["confidence"]
            match_multiple = match_result["multiple_matches"]

    return {
        "entity_type": entity_type,
        "extracted": extracted,
        "matched": matched,
        "match_confidence": match_confidence,
        "match_multiple": match_multiple,
        "doc_name": doc_name,
        "ai_provider": result.get("provider", ""),
    }


@frappe.whitelist()
def create_entity_doc(entity_type, values):
    """Insert the target ERPNext doctype from the confirmed dialog values."""
    if isinstance(values, str):
        values = json.loads(values)

    if entity_type not in _ENTITY_SCHEMAS:
        frappe.throw(f"Unsupported entity type: {entity_type}")

    def g(k, default=None):
        v = values.get(k)
        return v if v not in (None, "", "null") else default

    if entity_type == "Item":
        doc = frappe.get_doc({
            "doctype": "Item",
            "item_code": g("item_code") or g("item_name"),
            "item_name": g("item_name"),
            "description": g("description") or g("item_name"),
            "item_group": g("item_group") or _default_item_group(),
            "stock_uom": g("stock_uom", "Nos"),
            "standard_rate": flt(g("standard_rate", 0)),
            "gst_hsn_code": g("hsn_code"),
            "brand": g("brand"),
        })

    elif entity_type == "Supplier":
        doc = frappe.get_doc({
            "doctype": "Supplier",
            "supplier_name": g("supplier_name"),
            "supplier_group": g("supplier_group") or _default_group("Supplier Group", "All Supplier Groups"),
            "supplier_type": g("supplier_type", "Company"),
            "tax_id": g("tax_id"),
        })

    elif entity_type == "Customer":
        doc = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": g("customer_name"),
            "customer_group": g("customer_group") or _default_group("Customer Group", "All Customer Groups"),
            "customer_type": g("customer_type", "Company"),
            "territory": g("territory") or _default_group("Territory", "All Territories"),
            "tax_id": g("tax_id"),
        })

    elif entity_type == "Employee":
        doc = frappe.get_doc({
            "doctype": "Employee",
            "employee_name": g("employee_name"),
            "first_name": g("first_name") or g("employee_name"),
            "last_name": g("last_name"),
            "designation": g("designation"),
            "department": g("department"),
            "gender": g("gender"),
            "date_of_birth": g("date_of_birth"),
            "date_of_joining": g("date_of_joining") or nowdate(),
            "cell_number": g("cell_number"),
            "personal_email": g("personal_email"),
            "company": g("company") or frappe.defaults.get_default("company"),
            "status": "Active",
        })

    elif entity_type == "Address":
        doc = frappe.get_doc({
            "doctype": "Address",
            "address_title": g("address_title") or "New Address",
            "address_type": g("address_type", "Billing"),
            "address_line1": g("address_line1") or "N/A",
            "address_line2": g("address_line2"),
            "city": g("city") or "N/A",
            "state": g("state"),
            "pincode": g("pincode"),
            "country": g("country", "India"),
            "email_id": g("email_id"),
            "phone": g("phone"),
        })
        _attach_dynamic_link(doc, values)

    elif entity_type == "Contact":
        doc = frappe.get_doc({
            "doctype": "Contact",
            "first_name": g("first_name") or "New",
            "last_name": g("last_name"),
            "designation": g("designation"),
            "company_name": g("company_name"),
            "department": g("department"),
        })
        if g("email_id"):
            doc.append("email_ids", {"email_id": g("email_id"), "is_primary": 1})
        if g("mobile_no"):
            doc.append("phone_nos", {"phone": g("mobile_no"), "is_primary_mobile_no": 1})
        _attach_dynamic_link(doc, values)

    elif entity_type == "Warehouse":
        doc = frappe.get_doc({
            "doctype": "Warehouse",
            "warehouse_name": g("warehouse_name"),
            "warehouse_type": g("warehouse_type"),
            "address_line_1": g("address_line1"),
            "city": g("city"),
            "state": g("state"),
            "pin": g("pincode"),
            "phone_no": g("phone_no"),
            "company": g("company") or frappe.defaults.get_default("company"),
        })

    else:
        frappe.throw(f"Unsupported entity type: {entity_type}")

    doc.insert(ignore_mandatory=True)
    frappe.db.commit()
    return {"name": doc.name, "doctype": entity_type}


# ---- small helpers ----

def _attach_dynamic_link(doc, values):
    """Address/Contact link to a party (Supplier/Customer/etc) via Dynamic Link child."""
    link_dt = values.get("link_doctype")
    link_name = values.get("link_name")
    if link_dt and link_name:
        doc.append("links", {"link_doctype": link_dt, "link_name": link_name})


def _default_item_group():
    for g in ("Products", "All Item Groups", "Consumable"):
        if frappe.db.exists("Item Group", g):
            return g
    row = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
    return row or "All Item Groups"


def _default_group(doctype, preferred):
    if frappe.db.exists(doctype, preferred):
        return preferred
    return frappe.db.get_value(doctype, {}, "name")
# =====================================================================
# TRANSACTIONAL CREATE ACTIONS — Quotation, Sales Order,
# Purchase Order, Material Request
#
# Append to:
#   apps/doc_intelligence/doc_intelligence/doc_intelligence/api/__init__.py
#
# Requirements honoured:
#   - AI extracts party + items, returns for a prefilled dialog
#   - Documents are created as DRAFT (docstatus 0, no submit)
#   - Every line item is resolved to a REAL Item (match existing,
#     else auto-create) so ERPNext validation passes
# =====================================================================

import json
import re


# Which party each transaction needs, and how to match it.
#   party_type:  Customer / Supplier / None
#   party_field: fieldname on the target doctype
_TXN_CONFIG = {
    "Quotation": {
        "party_type": "Customer",
        "party_field": "party_name",     # Quotation uses quotation_to + party_name
        "match_dt": "Customer",
        "match_field": "customer_name",
    },
    "Sales Order": {
        "party_type": "Customer",
        "party_field": "customer",
        "match_dt": "Customer",
        "match_field": "customer_name",
    },
    "Purchase Order": {
        "party_type": "Supplier",
        "party_field": "supplier",
        "match_dt": "Supplier",
        "match_field": "supplier_name",
    },
    "Material Request": {
        "party_type": None,              # no party
        "party_field": None,
        "match_dt": None,
        "match_field": None,
    },
}


def _txn_prompt(txn_type, raw_text):
    party_line = ""
    if txn_type in ("Quotation", "Sales Order"):
        party_line = '"party_name": "customer / buyer name",'
    elif txn_type == "Purchase Order":
        party_line = '"party_name": "supplier / vendor name",'

    return f"""You are an ERPNext expert. From the document text below, extract the fields needed to create a {txn_type}.

Return ONLY a valid JSON object with these exact keys (use null when a value is absent):
{{
  {party_line}
  "transaction_date": "document date in YYYY-MM-DD, else null",
  "valid_till": "validity / delivery / required-by date in YYYY-MM-DD, else null",
  "currency": "currency code like INR/USD, default INR",
  "items": [
    {{
      "item_name": "name/description of the item or service",
      "qty": numeric_quantity,
      "rate": numeric_unit_rate,
      "uom": "unit like Nos, Kg, Meter (default Nos)"
    }}
  ],
  "grand_total": numeric_total_if_present,
  "remarks": "any notes / terms, else null"
}}

Document text:
---
{raw_text[:8000]}
---

Return only the JSON object, no explanation, no markdown."""


@frappe.whitelist()
def extract_transaction(doc_name, txn_type):
    """AI-extract party + items for a transactional doctype."""
    from doc_intelligence.doc_intelligence.llm_engine import llm_call

    if txn_type not in _TXN_CONFIG:
        frappe.throw(f"Unsupported transaction type: {txn_type}")

    doc = frappe.get_doc("AI Document", doc_name)
    if doc.status != "Ready":
        frappe.throw("Document must be in Ready status before creating a transaction.")
    if not doc.raw_text:
        frappe.throw("No raw text found. Please re-process the document first.")

    cfg = _TXN_CONFIG[txn_type]
    settings = frappe.get_single("Doc Intelligence Settings")
    result = llm_call(
        _txn_prompt(txn_type, doc.raw_text),
        f"You are a precise {txn_type} data extractor. Return only valid JSON.",
        settings.max_tokens_per_request or 2000,
    )

    text = re.sub(r"```json\s*|\s*```", "", result.get("text", "")).strip()
    try:
        extracted = json.loads(text)
    except Exception:
        frappe.throw(f"AI could not parse {txn_type} data. Raw response: {text[:500]}")

    # Match party (if this txn has one) using exact-then-fuzzy matching
    # with ambiguity detection, instead of a crude LIKE query.
    from doc_intelligence.doc_intelligence.validation import intelligent_entity_match, validate_financials

    matched_party = None
    party_match_confidence = 0
    party_multiple_matches = False
    party_name = (extracted.get("party_name") or "").strip()
    if cfg["match_dt"] and party_name:
        match_result = intelligent_entity_match(cfg["match_dt"], cfg["match_field"], party_name)
        matched_party = match_result["match"]
        party_match_confidence = match_result["confidence"]
        party_multiple_matches = match_result["multiple_matches"]

    # Resolve each line to a preview (matched item_code or "will create")
    item_preview = []
    for it in (extracted.get("items") or []):
        name = (it.get("item_name") or "").strip() or "Item"
        code = _find_item(name)
        item_preview.append({
            "item_name": name,
            "qty": float(it.get("qty") or 1),
            "rate": float(it.get("rate") or 0),
            "uom": it.get("uom") or "Nos",
            "item_code": code,                 # None => will be created
            "status": "matched" if code else "new",
        })

    # Independently recompute totals from the extracted items and flag any
    # disagreement with the AI-reported grand_total. No separate tax figure
    # is extracted for transactions (unlike Purchase Invoice), so tax=0.
    validation = validate_financials(item_preview, tax_amount=0, grand_total=extracted.get("grand_total") or 0)

    # Soft duplicate check — only meaningful once a party actually matched
    # an existing record (a brand-new party can't have a prior transaction).
    duplicate_of = None
    txn_date = extracted.get("transaction_date")
    if matched_party and cfg["party_field"] and txn_date:
        existing = frappe.db.get_value(
            txn_type,
            {cfg["party_field"]: matched_party, "transaction_date": txn_date, "docstatus": ["!=", 2]},
            ["name", cfg["party_field"], "grand_total"],
            as_dict=True,
        )
        if existing:
            duplicate_of = existing

    return {
        "txn_type": txn_type,
        "party_type": cfg["party_type"],
        "extracted": extracted,
        "matched_party": matched_party,
        "party_match_confidence": party_match_confidence,
        "party_multiple_matches": party_multiple_matches,
        "party_name": party_name,
        "items": item_preview,
        "doc_name": doc_name,
        "ai_provider": result.get("provider", ""),
        "validation": validation,
        "duplicate_of": duplicate_of,
    }


@frappe.whitelist()
def create_transaction_doc(txn_type, header, items, confirm_duplicate=0):
    """Create a DRAFT transactional document with real Item links."""
    if txn_type not in _TXN_CONFIG:
        frappe.throw(f"Unsupported transaction type: {txn_type}")
    if isinstance(header, str):
        header = json.loads(header)
    if isinstance(items, str):
        items = json.loads(items)

    cfg = _TXN_CONFIG[txn_type]
    company = header.get("company") or frappe.defaults.get_default("company")

    # Hard safety net: block an exact-duplicate party+date combination unless
    # explicitly confirmed. Only checked when the party is an existing
    # record — a brand-new party can't have a prior transaction.
    party_value = header.get("party")
    txn_date = header.get("transaction_date")
    if cfg["party_field"] and party_value and txn_date and not cint(confirm_duplicate):
        if frappe.db.exists(cfg["match_dt"], party_value):
            existing = frappe.db.get_value(
                txn_type,
                {cfg["party_field"]: party_value, "transaction_date": txn_date, "docstatus": ["!=", 2]},
                "name",
            )
            if existing:
                frappe.throw(
                    f"A {txn_type} already exists for this party on {txn_date} ({existing}). "
                    f"Pass confirm_duplicate=1 to create it anyway."
                )

    # Resolve/create every line item so ERPNext validation passes
    resolved = []
    for it in items:
        code = it.get("item_code") or _find_item(it.get("item_name"))
        if not code:
            code = _create_item(it.get("item_name"), it.get("uom") or "Nos", flt(it.get("rate")))
        row = {
            "item_code": code,
            "qty": flt(it.get("qty") or 1),
            "uom": it.get("uom") or "Nos",
        }
        # rate applies to buying/selling txns; Material Request has no rate
        if txn_type != "Material Request":
            row["rate"] = flt(it.get("rate") or 0)
        # Material Request rows need a schedule/required date + warehouse-less is ok as draft
        if txn_type == "Material Request":
            row["schedule_date"] = header.get("required_by") or nowdate()
        resolved.append(row)

    base = {
        "doctype": txn_type,
        "company": company,
        "currency": header.get("currency") or "INR",
        "items": resolved,
    }

    if txn_type == "Quotation":
        base.update({
            "quotation_to": "Customer",
            "party_name": header.get("party"),
            "transaction_date": header.get("transaction_date") or nowdate(),
            "valid_till": header.get("valid_till"),
            "order_type": "Sales",
        })
    elif txn_type == "Sales Order":
        base.update({
            "customer": header.get("party"),
            "transaction_date": header.get("transaction_date") or nowdate(),
            "delivery_date": header.get("valid_till") or nowdate(),
        })
    elif txn_type == "Purchase Order":
        base.update({
            "supplier": header.get("party"),
            "transaction_date": header.get("transaction_date") or nowdate(),
            "schedule_date": header.get("valid_till") or nowdate(),
        })
    elif txn_type == "Material Request":
        base.update({
            "material_request_type": header.get("mr_type") or "Purchase",
            "transaction_date": header.get("transaction_date") or nowdate(),
            "schedule_date": header.get("required_by") or nowdate(),
        })

    doc = frappe.get_doc(base)
    doc.insert(ignore_mandatory=True)   # DRAFT — no submit
    frappe.db.commit()
    return {"name": doc.name, "doctype": txn_type}


# ---- Item resolution helpers ----

def _find_item(name):
    """Return an existing item_code matching the given name, else None."""
    if not name:
        return None
    name = name.strip()
    # exact code
    if frappe.db.exists("Item", name):
        return name
    # by item_name (exact, then fuzzy)
    row = frappe.db.get_value("Item", {"item_name": name}, "name")
    if row:
        return row
    rows = frappe.db.sql(
        "SELECT name FROM `tabItem` WHERE item_name LIKE %s LIMIT 1",
        f"%{name[:40]}%", as_dict=True,
    )
    return rows[0].name if rows else None


def _create_item(name, uom="Nos", rate=0):
    """Create a minimal non-stock Item so it can be used on a transaction line."""
    name = (name or "Item").strip()
    doc = frappe.get_doc({
        "doctype": "Item",
        "item_code": name[:140],
        "item_name": name[:140],
        "description": name,
        "item_group": _default_item_group(),
        "stock_uom": uom or "Nos",
        "is_stock_item": 0,             # service/non-stock so no warehouse needed as draft
        "standard_rate": flt(rate),
    })
    doc.insert(ignore_mandatory=True, ignore_permissions=True)
    return doc.name


# =====================================================================
# SPA SESSION HELPERS
#   Added for the decoupled Vue 3 frontend (frontend/) served via
#   www/doc-intelligence.html — mirrors the pattern used by the
#   pranera_knit app's own SPA (knit_get_csrf).
# =====================================================================

@frappe.whitelist(allow_guest=True)
def get_csrf_token():
    """Used by the SPA's dev-server proxy to fetch a CSRF token when it
    isn't already injected via Jinja (production) or a csrftoken cookie."""
    if frappe.session.user == "Guest":
        return {"csrf_token": None}
    return {"csrf_token": frappe.sessions.get_csrf_token()}


@frappe.whitelist()
def get_session_info():
    """Single call the SPA makes on boot to know who's logged in and whether
    they're a System Manager (Provider Settings access)."""
    settings = frappe.get_single("Doc Intelligence Settings")
    roles = frappe.get_roles(frappe.session.user)
    return {
        "user": frappe.session.user,
        "full_name": frappe.utils.get_fullname(frappe.session.user),
        "roles": roles,
        "is_system_manager": "System Manager" in roles,
        "platform_name": settings.platform_name or "Doc Intelligence",
        "support_email": settings.support_email,
    }
