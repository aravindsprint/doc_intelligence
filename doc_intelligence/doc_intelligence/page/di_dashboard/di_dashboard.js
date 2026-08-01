frappe.pages["di-dashboard"].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Doc Intelligence Dashboard",
        single_column: true,
    });
    page.add_action_item("+ New Document", () => frappe.new_doc("AI Document"));
    page.add_action_item("↻ Refresh", () => di_dashboard.load_all());
    page.add_action_item("All Documents", () => frappe.set_route("List", "AI Document"));

    const root = $('<div id="di-db-root" style="max-width:1100px;margin:0 auto;padding:24px 0"></div>').appendTo($(wrapper).find(".layout-main-section"));
    di_dashboard.init(root[0]);
};

const di_dashboard = {
    root: null,
    init(root) {
        this.root = root;
        this.render_skeleton();
        this.load_all();
    },
    render_skeleton() {
        $(this.root).html(`
            <div class="di-db-kpi-row" id="di-kpi-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px">
                <div class="di-db-card" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:18px">
                    <div style="font-weight:600;margin-bottom:12px;border-bottom:2px solid #2563eb;padding-bottom:6px">Documents by Type</div>
                    <canvas id="di-chart-type" height="200"></canvas>
                </div>
                <div class="di-db-card" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:18px">
                    <div style="font-weight:600;margin-bottom:12px;border-bottom:2px solid #2563eb;padding-bottom:6px">Documents by Status</div>
                    <canvas id="di-chart-status" height="200"></canvas>
                </div>
            </div>
            <div class="di-db-card" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:18px">
                <div style="font-weight:600;margin-bottom:12px;border-bottom:2px solid #2563eb;padding-bottom:6px">Provider Health (24h)</div>
                <div id="di-health-section" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:10px"></div>
            </div>
        `);
        this._load_chartjs();
    },
    _load_chartjs() {
        if (window.Chart) { this._charts_ready = true; return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
        s.onload = () => { this._charts_ready = true; this._render_pending && this._render_pending(); };
        document.head.appendChild(s);
    },
    load_all() {
        this.load_stats();
        this.load_provider_health();
    },
    load_stats() {
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.get_document_stats",
            callback: (r) => { if (r.message) { this.render_kpis(r.message); this.render_charts(r.message); } }
        });
    },
    load_provider_health() {
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.get_provider_health_stats",
            callback: (r) => { if (r.message) this.render_health(r.message); }
        });
    },
    render_kpis(stats) {
        const kpis = [
            {label:"Total", val: stats.total, color:"#2563eb"},
            {label:"Ready", val: stats.ready, color:"#22c55e"},
            {label:"Processing", val: stats.processing, color:"#3b82f6"},
            {label:"Failed", val: stats.failed, color:"#ef4444"},
            {label:"Tokens Used", val: (stats.total_tokens||0).toLocaleString(), color:"#f97316"},
        ];
        document.getElementById("di-kpi-row").innerHTML = kpis.map(k => `
            <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:16px;border-top:3px solid ${k.color}">
                <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">${k.label}</div>
                <div style="font-size:28px;font-weight:700;color:${k.color};margin-top:4px">${k.val}</div>
            </div>
        `).join("");
    },
    render_charts(stats) {
        const doRender = () => {
            const palette = ["#1a2744","#2563eb","#22c55e","#f97316","#ef4444","#a855f7"];
            const byType = stats.by_type || [];
            const c1 = document.getElementById("di-chart-type");
            const c2 = document.getElementById("di-chart-status");
            if (c1 && byType.length) {
                if (c1._chart) c1._chart.destroy();
                c1._chart = new Chart(c1, {type:"doughnut", data:{labels:byType.map(x=>x.document_type||"Other"), datasets:[{data:byType.map(x=>x.cnt), backgroundColor:palette}]}, options:{plugins:{legend:{position:"bottom"}}}});
            }
            if (c2) {
                if (c2._chart) c2._chart.destroy();
                c2._chart = new Chart(c2, {type:"bar", data:{labels:["Ready","Processing","Pending","Failed"], datasets:[{data:[stats.ready,stats.processing,stats.pending,stats.failed], backgroundColor:["#22c55e","#3b82f6","#f59e0b","#ef4444"]}]}, options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}});
            }
        };
        if (this._charts_ready) doRender();
        else this._render_pending = doRender;
    },
    render_health(data) {
        const section = document.getElementById("di-health-section");
        if (!section) return;
        if (!data.length) { section.innerHTML = `<p style="color:var(--text-muted)">No provider activity in the last 24 hours.</p>`; return; }
        section.innerHTML = data.map(row => `
            <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:12px">
                <strong style="font-size:13px">${row.provider}</strong>
                <div style="background:#e5e7eb;border-radius:3px;height:6px;margin:6px 0"><div style="background:#22c55e;width:${row.success_rate||0}%;height:100%;border-radius:3px"></div></div>
                <div style="font-size:11px;color:var(--text-muted)">${row.success_rate}% success · ${(row.total_tokens||0).toLocaleString()} tokens · ${row.total} calls</div>
            </div>
        `).join("");
    }
};
