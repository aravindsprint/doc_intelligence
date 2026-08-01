frappe.pages["di-provider-settings"].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "LLM Provider Settings",
        single_column: true,
    });

    frappe.dom.set_style(`
        .di-wrap { max-width: 860px; margin: 0 auto; padding: 24px 0; }
        .di-provider-row { border: 2px solid var(--border-color); border-radius: 10px; margin-bottom: 12px; overflow: hidden; background: var(--card-bg); transition: border-color .2s; }
        .di-provider-row.active { border-color: #2563eb; }
        .di-provider-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; user-select: none; }
        .di-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
        .di-provider-name { font-weight: 600; font-size: 15px; flex: 1; }
        .di-tier-badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #e0e7ff; color: #3730a3; font-weight: 600; }
        .di-tier-badge.paid { background: #fce7f3; color: #9d174d; }
        .di-status-dot { width: 9px; height: 9px; border-radius: 50%; background: #d1d5db; }
        .di-status-dot.ready { background: #22c55e; }
        .di-status-dot.warn { background: #f59e0b; }
        .di-toggle { position: relative; width: 42px; height: 24px; }
        .di-toggle input { opacity: 0; width: 0; height: 0; }
        .di-toggle-slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 24px; transition: .3s; cursor: pointer; }
        .di-toggle-slider:before { content: ""; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; background: white; border-radius: 50%; transition: .3s; }
        .di-toggle input:checked + .di-toggle-slider { background: #2563eb; }
        .di-toggle input:checked + .di-toggle-slider:before { transform: translateX(18px); }
        .di-chevron { font-size: 18px; color: var(--text-muted); transition: transform .2s; }
        .di-provider-row.open .di-chevron { transform: rotate(90deg); }
        .di-provider-fields { display: none; padding: 0 18px 18px; border-top: 1px solid var(--border-color); }
        .di-provider-row.open .di-provider-fields { display: block; }
        .di-stat { font-size: 11px; color: var(--text-muted); }
        .di-priority-bar { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; }
        .di-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .di-chip { display: flex; align-items: center; gap: 6px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 20px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
        .di-chip-num { background: #2563eb; color: white; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .di-chip-arrow { cursor: pointer; color: #2563eb; padding: 0 2px; font-size: 14px; }
        .di-actions { display: flex; gap: 10px; margin-bottom: 18px; }
        .di-health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
        .di-health-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
        .di-health-bar { height: 6px; background: #e5e7eb; border-radius: 3px; margin: 6px 0; }
        .di-health-fill { height: 100%; border-radius: 3px; background: #22c55e; transition: width .4s; }
        .di-save-banner { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; display: none; }
    `);

    const root = $('<div class="di-wrap" id="di-root"></div>').appendTo($(wrapper).find(".layout-main-section"));
    di_ps.init(root[0]);
};

const di_ps = {
    P: [
        {id:"groq", name:"Groq", dot:"#7C3FE4", free:true, stat:"30 RPM · 14,400 req/day · 131K ctx", hint:"gsk_...", docs:"https://console.groq.com", kf:"groq_api_key", mf:"groq_model", models:["llama-3.3-70b-versatile","llama-3.1-8b-instant","mixtral-8x7b-32768"]},
        {id:"gemini", name:"Google Gemini", dot:"#1D9E75", free:true, stat:"1,500 req/day · 1M token context", hint:"AIza...", docs:"https://aistudio.google.com", kf:"gemini_api_key", mf:"gemini_model", models:["gemini-2.5-flash","gemini-2.0-flash","gemini-1.5-flash"]},
        {id:"cerebras", name:"Cerebras", dot:"#EF9F27", free:true, stat:"1M tokens/day · no credit card", hint:"csk-...", docs:"https://cloud.cerebras.ai", kf:"cerebras_api_key", mf:"cerebras_model", models:["llama3.1-70b","llama3.1-8b"]},
        {id:"openrouter", name:"OpenRouter", dot:"#D85A30", free:true, stat:"20+ free models · single key", hint:"sk-or-...", docs:"https://openrouter.ai", kf:"openrouter_api_key", mf:"openrouter_model", models:[]},
        {id:"mistral", name:"Mistral", dot:"#378ADD", free:true, stat:"No credit card · 256K context", hint:"...", docs:"https://console.mistral.ai", kf:"mistral_api_key", mf:"mistral_model", models:["mistral-small-latest","mistral-medium-latest","codestral-latest"]},
        {id:"claude", name:"Anthropic Claude", dot:"#D4537E", free:false, stat:"Paid · 200K ctx · final fallback", hint:"sk-ant-...", docs:"https://console.anthropic.com", kf:"claude_api_key", mf:"claude_model", models:["claude-haiku-4-5-20251001","claude-sonnet-4-6"]},
    ],
    st: {active: new Set(), open: new Set(), keys: {}, models: {}, order: []},

    init(root) {
        this.root = root;
        this.loadSettings();
    },

    loadSettings() {
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.get_provider_settings",
            callback: (r) => {
                if (!r.message) return;
                const s = r.message;
                const enabled = (s.enabled_providers || "").split(",").map(x => x.trim()).filter(Boolean);
                this.st.order = [...enabled];
                enabled.forEach(id => this.st.active.add(id));
                this.P.forEach(p => {
                    this.st.keys[p.id] = s[p.kf] || "";
                    this.st.models[p.id] = s[p.mf] || p.models[0] || "";
                });
                this.render();
                this.loadHealth();
            }
        });
    },

    loadHealth() {
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.get_provider_health_stats",
            callback: (r) => { if (r.message) this.renderHealth(r.message); }
        });
    },

    render() {
        $(this.root).html(`
            <div class="di-save-banner" id="di-banner"></div>
            <div class="di-actions">
                <button class="btn btn-primary btn-sm" onclick="di_ps.save()">Save settings</button>
                <button class="btn btn-default btn-sm" onclick="di_ps.testAll()">Test connections</button>
            </div>
            <div class="di-priority-bar">
                <strong>Fallback Priority</strong> — providers are tried in this order
                <div class="di-chips" id="di-chips"></div>
            </div>
            <div id="di-list"></div>
            <div style="margin-top:24px"><strong>Provider Health (24h)</strong><div class="di-health-grid" id="di-health"></div></div>
        `);
        this.renderList();
        this.renderPriority();
    },

    renderList() {
        const list = document.getElementById("di-list");
        if (!list) return;
        list.innerHTML = this.P.map(p => this._rowHtml(p)).join("");
    },

    _rowHtml(p) {
        const active = this.st.active.has(p.id);
        const hasKey = !!(this.st.keys[p.id] && this.st.keys[p.id] !== "xxxxxx");
        const dotCls = hasKey ? "ready" : (active ? "warn" : "");
        const modelOpts = p.models.length ? p.models.map(m => `<option value="${m}" ${this.st.models[p.id]===m?"selected":""}>${m}</option>`).join("") : `<option value="${this.st.models[p.id]||""}">${this.st.models[p.id]||"Custom"}</option>`;
        return `
        <div class="di-provider-row ${active?"active":""} ${this.st.open.has(p.id)?"open":""}" id="di-row-${p.id}">
            <div class="di-provider-header" onclick="di_ps.toggleOpen('${p.id}', event)">
                <span class="di-dot" style="background:${p.dot}"></span>
                <span class="di-provider-name">${p.name}</span>
                <span class="di-stat">${p.stat}</span>
                <span class="di-tier-badge ${p.free?"":"paid"}">${p.free?"Free":"Paid"}</span>
                <span class="di-status-dot ${dotCls}" id="di-sdot-${p.id}"></span>
                <label class="di-toggle" onclick="event.stopPropagation()">
                    <input type="checkbox" ${active?"checked":""} onchange="di_ps.toggleActive('${p.id}', event)">
                    <span class="di-toggle-slider"></span>
                </label>
                <span class="di-chevron">›</span>
            </div>
            <div class="di-provider-fields">
                <div style="margin-bottom:10px">
                    <label style="font-size:12px;font-weight:600;color:var(--text-muted)">API Key <a href="${p.docs}" target="_blank" style="font-size:11px">get key ↗</a></label><br>
                    <input type="password" class="form-control form-control-sm" placeholder="${p.hint}" value="${this.st.keys[p.id]||""}"
                        oninput="di_ps.st.keys['${p.id}']=this.value; di_ps.refreshDot('${p.id}')"
                        style="margin-top:4px;max-width:400px">
                </div>
                <div>
                    <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Model</label><br>
                    <select class="form-control form-control-sm" onchange="di_ps.st.models['${p.id}']=this.value" style="margin-top:4px;max-width:340px">
                        ${modelOpts}
                        ${!p.models.length?`<option value="${this.st.models[p.id]||""}">${this.st.models[p.id]||""}</option>`:""}
                    </select>
                </div>
            </div>
        </div>`;
    },

    toggleActive(id, event) {
        event.stopPropagation();
        if (this.st.active.has(id)) {
            this.st.active.delete(id);
            this.st.order = this.st.order.filter(x => x !== id);
        } else {
            this.st.active.add(id);
            this.st.order.push(id);
        }
        document.getElementById(`di-row-${id}`)?.classList.toggle("active", this.st.active.has(id));
        document.querySelector(`#di-row-${id} input[type=checkbox]`).checked = this.st.active.has(id);
        this.renderPriority();
    },

    toggleOpen(id, event) {
        if (this.st.open.has(id)) this.st.open.delete(id);
        else this.st.open.add(id);
        document.getElementById(`di-row-${id}`)?.classList.toggle("open", this.st.open.has(id));
    },

    renderPriority() {
        const chips = document.getElementById("di-chips");
        if (!chips) return;
        chips.innerHTML = this.st.order.map((id, i) => {
            const p = this.P.find(x => x.id === id);
            if (!p) return "";
            return `<span class="di-chip">
                <span class="di-chip-num">${i+1}</span>
                <span class="di-dot" style="background:${p.dot};width:8px;height:8px"></span>
                ${p.name}
                <span class="di-chip-arrow" onclick="di_ps.move('${id}',-1)">‹</span>
                <span class="di-chip-arrow" onclick="di_ps.move('${id}',1)">›</span>
            </span>`;
        }).join("");
    },

    move(id, dir) {
        const arr = this.st.order;
        const i = arr.indexOf(id);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        this.renderPriority();
    },

    refreshDot(id) {
        const dot = document.getElementById(`di-sdot-${id}`);
        if (!dot) return;
        const key = this.st.keys[id];
        dot.className = `di-status-dot ${key && key !== "xxxxxx" ? "ready" : (this.st.active.has(id) ? "warn" : "")}`;
    },

    save() {
        const activeWithoutKey = [...this.st.active].filter(id => {
            const k = this.st.keys[id];
            return !k || k === "xxxxxx";
        });
        if (activeWithoutKey.length) {
            frappe.msgprint({title:"Missing Keys", message:`These active providers have no API key: ${activeWithoutKey.join(", ")}`, indicator:"orange"});
        }
        const settings = {enabled_providers: this.st.order.join(",")};
        this.P.forEach(p => {
            settings[p.kf] = this.st.keys[p.id] || "";
            settings[p.mf] = this.st.models[p.id] || "";
        });
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.save_provider_settings",
            args: {settings: JSON.stringify(settings)},
            callback: (r) => {
                const banner = document.getElementById("di-banner");
                if (banner) {
                    banner.style.display = "block";
                    banner.textContent = "Settings saved. Fallback chain: " + this.st.order.join(" → ");
                    setTimeout(() => banner.style.display = "none", 5000);
                }
            }
        });
    },

    testAll() {
        frappe.call({
            method: "doc_intelligence.doc_intelligence.api.test_providers",
            callback: (r) => {
                if (!r.message) return;
                const rows = r.message.map(x => `<tr><td>${x.provider}</td><td><span class="indicator ${x.status==="pass"?"green":x.status==="skipped"?"gray":"red"}">${x.status.toUpperCase()}</span></td><td>${x.message||x.response||""}</td></tr>`).join("");
                frappe.msgprint({title:"Provider Test Results", message:`<table class="table table-sm"><thead><tr><th>Provider</th><th>Status</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>`, indicator:"blue"});
            }
        });
    },

    renderHealth(data) {
        const grid = document.getElementById("di-health");
        if (!grid || !data.length) return;
        grid.innerHTML = data.map(row => `
            <div class="di-health-card">
                <strong>${row.provider}</strong>
                <div class="di-health-bar"><div class="di-health-fill" style="width:${row.success_rate||0}%"></div></div>
                <div style="font-size:11px;color:var(--text-muted)">${row.success_rate}% success · ${(row.total_tokens||0).toLocaleString()} tokens</div>
            </div>
        `).join("");
    }
};
