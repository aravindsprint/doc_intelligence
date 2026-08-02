from . import __version__ as app_version

app_name        = "doc_intelligence"
app_title       = "Doc Intelligence"
app_publisher   = "Aravind Govindaraj"
app_description = "AI-powered document analysis for Frappe/ERPNext"
app_email       = "aravindsprint@gmail.com"
app_license     = "MIT"
app_version     = "1.0.0"

add_to_apps_screen = [
    {
        "name": "doc_intelligence",
        "logo": "/assets/doc_intelligence/images/logo.svg",
        "title": "Doc Intelligence",
        "route": "/doc-intelligence",
    }
]

website_route_rules = [
    {"from_route": "/doc-intelligence/<path:app_path>", "to_route": "doc-intelligence"},
]

fixtures = [
    {"doctype": "Workspace", "filters": [["module", "=", "Doc Intelligence"]]},
    {"doctype": "Report",    "filters": [["module", "=", "Doc Intelligence"]]},
    {"doctype": "Page",      "filters": [["module", "=", "Doc Intelligence"]]},
    {"doctype": "Role",      "filters": [["name", "=", "Doc Intelligence User"]]},
]

app_include_css = "/assets/doc_intelligence/css/doc_intelligence.css"
app_include_js  = "/assets/doc_intelligence/js/doc_intelligence.js"

scheduler_events = {
    "cron": {
        # Every 15 minutes: catch any AI Document stuck in "Processing"
        # (e.g. a worker died mid-job) and mark it Failed so it doesn't
        # sit stranded indefinitely.
        "*/15 * * * *": [
            "doc_intelligence.doc_intelligence.doctype.ai_document.ai_document.fail_stuck_processing_documents",
        ],
    }
}
