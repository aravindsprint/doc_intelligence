import frappe
from frappe.utils import flt


def execute(filters=None):
    filters = filters or {}
    conditions, values = [], []

    if filters.get("from_date"):
        conditions.append("creation >= %(from_date)s")
        values.append(filters["from_date"])
    if filters.get("to_date"):
        conditions.append("creation <= %(to_date)s")
        values.append(filters["to_date"])
    if filters.get("document_type"):
        conditions.append("document_type = %(document_type)s")
    if filters.get("status"):
        conditions.append("status = %(status)s")

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    data = frappe.db.sql(
        "SELECT name, title, document_type, status, processed_on, "
        "token_count, owner, creation "
        "FROM `tabAI Document` " + where + " "
        "ORDER BY creation DESC",
        filters, as_dict=True
    )

    agg = frappe.db.sql(
        "SELECT COUNT(*) as total, "
        "SUM(CASE WHEN status='Ready' THEN 1 ELSE 0 END) as ready_count, "
        "SUM(CASE WHEN status='Failed' THEN 1 ELSE 0 END) as failed_count, "
        "SUM(token_count) as total_tokens "
        "FROM `tabAI Document` " + where,
        filters, as_dict=True
    )[0]

    columns = [
        {"label":"Document","fieldname":"name","fieldtype":"Link","options":"AI Document","width":160},
        {"label":"Title","fieldname":"title","fieldtype":"Data","width":220},
        {"label":"Type","fieldname":"document_type","fieldtype":"Data","width":120},
        {"label":"Status","fieldname":"status","fieldtype":"Data","width":100},
        {"label":"Processed On","fieldname":"processed_on","fieldtype":"Datetime","width":150},
        {"label":"Tokens","fieldname":"token_count","fieldtype":"Int","width":90},
        {"label":"Uploaded By","fieldname":"owner","fieldtype":"Link","options":"User","width":160},
        {"label":"Created","fieldname":"creation","fieldtype":"Datetime","width":150},
    ]

    palette = ["#1a2744","#2563eb","#22c55e","#f97316","#ef4444","#a855f7"]
    type_counts = {}
    for row in data:
        type_counts[row.document_type or "Other"] = type_counts.get(row.document_type or "Other", 0) + 1
    labels = list(type_counts.keys())
    chart = {
        "data": {"labels": labels, "datasets": [{"name":"Documents","values":[type_counts[l] for l in labels]}]},
        "type": "donut",
        "colors": palette[:len(labels)],
    }

    summary = [
        {"label":"Total Documents","value":agg.total or 0,"indicator":"blue"},
        {"label":"Ready","value":agg.ready_count or 0,"indicator":"green"},
        {"label":"Failed","value":agg.failed_count or 0,"indicator":"red"},
        {"label":"Total Tokens","value":int(agg.total_tokens or 0),"indicator":"orange"},
    ]

    return columns, data, None, chart, summary
