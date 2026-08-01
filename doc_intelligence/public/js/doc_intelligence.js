// Doc Intelligence — Global JS
window.doc_intelligence = window.doc_intelligence || {};

doc_intelligence.load_workspace_stats = function(wrapper) {
    frappe.call({
        method: "doc_intelligence.doc_intelligence.doc_intelligence.api.get_document_stats",
        callback: function(r) {
            if (!r.message) return;
            var s = r.message;
            var stats = [
                {label: "Total", val: s.total, color: "#2563eb"},
                {label: "Ready", val: s.ready, color: "#22c55e"},
                {label: "Processing", val: s.processing, color: "#3b82f6"},
                {label: "Failed", val: s.failed, color: "#ef4444"},
                {label: "Tokens", val: (s.total_tokens || 0).toLocaleString(), color: "#f97316"},
            ];
            var html = stats.map(function(k) {
                return '<div style="display:inline-block;margin:6px 10px;padding:12px 20px;border-top:3px solid ' + k.color + ';background:white;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)">' +
                    '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">' + k.label + '</div>' +
                    '<div style="font-size:24px;font-weight:700;color:' + k.color + '">' + k.val + '</div>' +
                    '</div>';
            }).join("");
            $(wrapper).html('<div style="display:flex;flex-wrap:wrap;gap:4px">' + html + '</div>');
        }
    });
};
