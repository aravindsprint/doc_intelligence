import frappe

no_cache = 1
no_breadcrumbs = 1
no_sitemap = 1


def get_context(context):
    # Deliberately no Guest redirect here — the SPA's own Vue Router guard
    # (router/index.js) handles the logged-out state by rendering the
    # app's own branded LoginPage.vue. Redirecting Guests away at this
    # server-side layer (to Frappe's generic /login) would make that page
    # unreachable, which is exactly the bug this replaced.
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.no_cache = 1
