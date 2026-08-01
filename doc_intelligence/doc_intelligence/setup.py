"""
Setup / bootstrap helpers that run on install and migrate.

Unlike a fixture file (which re-syncs its exact field values onto matching
records on every `bench migrate`, silently overwriting any manual edits),
the functions here only ever CREATE a record if it doesn't already exist.
Once a site has its own "Free"/"Starter"/"Pro"/"Business" plan, this leaves
it alone forever — including if you customise the price, limits, or add
entirely new plans on your own deployment. That's what makes it safe to
run the same open-source app across multiple independent sites (e.g. a
public demo site and a private production site) without a code update or
`bench migrate` on one ever clobbering pricing customisations on the other.
"""

import frappe

DEFAULT_BILLING_PLANS = [
    {
        "name": "Free",
        "plan_name": "Free",
        "monthly_price": 0,
        "token_limit": 0,
        "document_limit": 0,
        "daily_document_limit": 5,
        "overage_rate": 0,
        "allow_compare": 0,
        "allow_record_creation": 0,
        "allow_purchase_invoice_automation": 0,
        "allow_api_access": 0,
        "is_active": 1,
        "description": "Get started for free. 5 documents per day — AI summary, key entities, tables, and Ask a Question. No record creation, no Compare.",
    },
    {
        "name": "Starter",
        "plan_name": "Starter",
        "monthly_price": 499,
        "token_limit": 150000,
        "document_limit": 150,
        "daily_document_limit": 0,
        "overage_rate": 0.6,
        "allow_compare": 0,
        "allow_record_creation": 1,
        "allow_purchase_invoice_automation": 0,
        "allow_api_access": 0,
        "is_active": 1,
        "description": "For individuals and small teams. ~150 documents/month. Unlocks Item/Supplier/Customer/Employee/Address and Quotation/Sales Order/Purchase Order/Material Request creation. Purchase Invoice automation not included.",
    },
    {
        "name": "Pro",
        "plan_name": "Pro",
        "monthly_price": 1499,
        "token_limit": 500000,
        "document_limit": 500,
        "daily_document_limit": 0,
        "overage_rate": 0.4,
        "allow_compare": 1,
        "allow_record_creation": 1,
        "allow_purchase_invoice_automation": 1,
        "allow_api_access": 0,
        "is_active": 1,
        "description": "For active accounting/procurement teams. ~500 documents/month. Full Purchase Invoice automation with financial validation and duplicate detection, plus Document Compare.",
    },
    {
        "name": "Business",
        "plan_name": "Business",
        "monthly_price": 3999,
        "token_limit": 2000000,
        "document_limit": 0,
        "daily_document_limit": 0,
        "overage_rate": 0.3,
        "allow_compare": 1,
        "allow_record_creation": 1,
        "allow_purchase_invoice_automation": 1,
        "allow_api_access": 1,
        "is_active": 1,
        "description": "For multi-user teams. Unlimited documents, multi-tenant workspace, API access, and priority support.",
    },
]


def create_default_billing_plans():
    """
    Runs on every migrate (see hooks.py's after_migrate). Safe to run
    repeatedly: only inserts a plan if a DI Billing Plan with that exact
    name doesn't already exist. Never updates or overwrites an existing one.
    """
    if not frappe.db.table_exists("DI Billing Plan"):
        # Doctype not migrated yet on this pass — nothing to seed.
        return

    for plan in DEFAULT_BILLING_PLANS:
        if frappe.db.exists("DI Billing Plan", plan["name"]):
            continue
        doc = frappe.get_doc({"doctype": "DI Billing Plan", **plan})
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
