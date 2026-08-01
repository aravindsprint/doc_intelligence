frappe.ui.form.on("AI Document", {
    refresh(frm) {
        const colors = { Ready: "green", Processing: "blue", Pending: "orange", Failed: "red" };
        const color = colors[frm.doc.status] || "gray";
        frm.set_intro(`<span class="indicator ${color}">${frm.doc.status}</span>`, color);

        add_camera_capture_button(frm);

        if (frm.doc.extracted_table) {
            try {
                const tables = JSON.parse(frm.doc.extracted_table);
                if (tables && tables.length) {
                    let html = "";
                    tables.forEach(t => {
                        html += `<table class="di-extracted-table"><thead><tr>${(t.headers||[]).map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
                        (t.rows||[]).forEach((row, i) => {
                            html += `<tr class="${i%2===0?"":"alt"}">${row.map(c => `<td>${c}</td>`).join("")}</tr>`;
                        });
                        html += "</tbody></table><br>";
                    });
                    frm.fields_dict.extracted_table.$wrapper.find(".control-value").html(html);
                }
            } catch(e) {}
        }

        if (frm.doc.status === "Processing") {
            setTimeout(() => frm.reload_doc(), 4000);
        }

        if (frm.doc.status === "Ready") {
            frm.add_custom_button("Ask a Question", () => {
                const d = new frappe.ui.Dialog({
                    title: "Ask a Question",
                    fields: [{fieldtype: "Small Text", fieldname: "question", label: "Your Question", reqd: 1}],
                    primary_action_label: "Get Answer",
                    primary_action(values) {
                        d.hide();
                        frappe.show_progress("Getting answer...", 0, 100);
                        frappe.call({
                            method: "doc_intelligence.doc_intelligence.api.ask_document",
                            args: {doc_name: frm.doc.name, question: values.question},
                            callback(r) {
                                frappe.hide_progress();
                                if (r.message) {
                                    frm.reload_doc();
                                    frappe.msgprint({title: "AI Answer", message: r.message.answer, indicator: "green"});
                                }
                            }
                        });
                    }
                });
                d.show();
            });

            frm.add_custom_button("Create Purchase Invoice", () => {
                frappe.show_progress("Extracting invoice data with AI...", 0, 100, "Please wait...");
                frappe.call({
                    method: "doc_intelligence.doc_intelligence.api.create_purchase_invoice",
                    args: {doc_name: frm.doc.name},
                    callback(r) {
                        frappe.hide_progress();
                        if (!r.message) return;
                        const data = r.message;
                        const ext = data.extracted || {};

                        const items_html = (() => {
                            let rows = (data.items || []).map((item, i) =>
                                `<tr>
                                    <td>${i+1}</td>
                                    <td>${item.item_name || ""}</td>
                                    <td>${item.qty || 1}</td>
                                    <td>${item.rate || 0}</td>
                                    <td>${((item.qty||1) * (item.rate||0)).toFixed(2)}</td>
                                    <td>${item.uom || "Nos"}</td>
                                </tr>`
                            ).join("");
                            return `<table class="table table-bordered table-sm" style="font-size:12px">
                                <thead style="background:#1a2744;color:white">
                                    <tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th><th>UOM</th></tr>
                                </thead>
                                <tbody>${rows}</tbody>
                                <tfoot>
                                    <tr><td colspan="4" style="text-align:right"><b>Grand Total</b></td>
                                    <td><b>&#8377;${ext.grand_total || 0}</b></td><td></td></tr>
                                </tfoot>
                            </table>`;
                        })();

                        const supplier_note = data.matched_supplier
                            ? `<span style="color:green">&#10003; Matched: ${data.matched_supplier}${data.supplier_match_confidence < 100 ? ` (${data.supplier_match_confidence}% confidence)` : ""}</span>`
                            : data.supplier_multiple_matches
                                ? `<span style="color:#b91c1c">&#9888; Multiple similar suppliers found — please select manually below.</span>`
                                : `<span style="color:orange">&#9888; Not found in ERPNext. Select manually.</span>`;

                        const validation = data.validation || {};
                        const risk_banner = validation.risk_level === "HIGH"
                            ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
                                <strong>&#9888; Totals don't match</strong><br>
                                AI-reported total: &#8377;${validation.detected_grand_total} ·
                                Recalculated from line items: &#8377;${validation.calculated_grand_total} ·
                                Mismatch: &#8377;${validation.mismatch_amount}<br>
                                Double-check the line items and tax amount before creating this invoice.
                               </div>`
                            : validation.risk_level === "LOW"
                                ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px">
                                    &#10003; Totals check out (recalculated: &#8377;${validation.calculated_grand_total})
                                   </div>`
                                : "";

                        const dup = data.duplicate_of;
                        const duplicate_banner = dup
                            ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
                                <strong>&#9888; Possible duplicate invoice</strong><br>
                                Bill No "${ext.bill_no || ""}" already exists as <b>${dup.name}</b>
                                (Supplier: ${dup.supplier}, Total: &#8377;${dup.grand_total}).
                               </div>`
                            : "";

                        const dialog_fields = [
                            {
                                fieldtype: "HTML",
                                fieldname: "preview_html",
                                options: `${risk_banner}${duplicate_banner}<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px">
                                    <strong>AI Extracted</strong> (${data.ai_provider || "groq"})<br>
                                    Supplier: <b>${ext.supplier_name || "N/A"}</b> |
                                    Invoice: <b>${ext.bill_no || "N/A"}</b> |
                                    Date: <b>${ext.bill_date || "N/A"}</b> |
                                    Total: <b>&#8377;${ext.grand_total || 0}</b><br>
                                    ${supplier_note}
                                </div>`
                            },
                            {fieldtype: "Link", fieldname: "supplier", label: "Supplier", options: "Supplier", reqd: 1, default: data.matched_supplier || ""},
                            {fieldtype: "Data", fieldname: "bill_no", label: "Supplier Invoice No", reqd: 1, default: ext.bill_no || ""},
                            {fieldtype: "Date", fieldname: "bill_date", label: "Supplier Invoice Date", reqd: 1, default: ext.bill_date || frappe.datetime.get_today()},
                            {fieldtype: "Date", fieldname: "posting_date", label: "Posting Date", reqd: 1, default: frappe.datetime.get_today()},
                            {fieldtype: "Column Break"},
                            {fieldtype: "Date", fieldname: "due_date", label: "Due Date", default: ext.due_date || ""},
                            {fieldtype: "Link", fieldname: "company", label: "Company", options: "Company", reqd: 1, default: frappe.defaults.get_default("company")},
                            {fieldtype: "Select", fieldname: "naming_series", label: "Series", options: "\nPINV26/.#####\nEXPINV26/.#####", default: "PINV26/.#####"},
                            {fieldtype: "Section Break", label: "Items"},
                            {fieldtype: "HTML", fieldname: "items_html", options: items_html},
                            {fieldtype: "Section Break", label: "Remarks"},
                            {fieldtype: "Small Text", fieldname: "remarks", label: "Remarks", default: ext.remarks || `Created from AI Document: ${frm.doc.name}`},
                        ];

                        if (dup) {
                            dialog_fields.push({fieldtype: "Section Break"});
                            dialog_fields.push({
                                fieldtype: "Check",
                                fieldname: "confirm_duplicate",
                                label: "Create anyway — I've verified this is not a duplicate",
                            });
                        }

                        const d = new frappe.ui.Dialog({
                            title: "Create Purchase Invoice",
                            size: "large",
                            fields: dialog_fields,
                            primary_action_label: "Create Draft Purchase Invoice",
                            primary_action(values) {
                                if (!values.supplier) {
                                    frappe.msgprint("Please select a Supplier.");
                                    return;
                                }
                                if (dup && !values.confirm_duplicate) {
                                    frappe.msgprint("Please confirm this is not a duplicate invoice before creating it.");
                                    return;
                                }
                                d.hide();
                                frappe.show_progress("Creating Purchase Invoice...", 0, 100);
                                frappe.call({
                                    method: "doc_intelligence.doc_intelligence.api.create_purchase_invoice_doc",
                                    args: {
                                        supplier: values.supplier,
                                        bill_no: values.bill_no,
                                        bill_date: values.bill_date,
                                        posting_date: values.posting_date,
                                        due_date: values.due_date || values.posting_date,
                                        company: values.company,
                                        currency: ext.currency || "INR",
                                        items: JSON.stringify(data.items || []),
                                        remarks: values.remarks,
                                        naming_series: values.naming_series || "PINV26/.#####",
                                        confirm_duplicate: values.confirm_duplicate ? 1 : 0
                                    },
                                    callback(r) {
                                        frappe.hide_progress();
                                        if (r.message && r.message.name) {
                                            frappe.show_alert({message: `Purchase Invoice ${r.message.name} created!`, indicator: "green"}, 5);
                                            frappe.set_route("Form", "Purchase Invoice", r.message.name);
                                        }
                                    },
                                    error(r) {
                                        frappe.hide_progress();
                                    }
                                });
                            }
                        });
                        d.show();
                    }
                });
            }, "Create");

            add_entity_create_buttons(frm);
            add_txn_create_buttons(frm);
        }

        frm.add_custom_button("Re-process Document", () => {
            frappe.confirm("Re-process this document? Existing analysis will be overwritten.", () => {
                frm.set_value("status", "Pending");
                frm.save();
            });
        }, "Actions");

        if (frm.doc.status === "Ready") {
            frm.add_custom_button("Export Summary", () => {
                const md = [
                    `# ${frm.doc.title}`,
                    `**Type:** ${frm.doc.document_type || ""}  |  **Processed:** ${frm.doc.processed_on || ""}`,
                    "", "## AI Summary", frm.doc.summary || "",
                    "", "## Key Entities", frm.doc.key_entities || "",
                    "", frm.doc.user_question ? `## Q&A\n**Q:** ${frm.doc.user_question}\n\n**A:** ${frm.doc.ai_answer || ""}` : "",
                ].join("\n");
                const blob = new Blob([md], {type: "text/markdown"});
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${frm.doc.title || frm.doc.name}_summary.md`;
                a.click();
            }, "Actions");
        }
    }
});


// === Doc Intelligence: entity Create buttons (auto-added) ===
const DI_ENTITY_CONFIG = {
    "Item": {
        label: "Create Item",
        fields: [
            {fieldtype: "Data", fieldname: "item_name", label: "Item Name", reqd: 1},
            {fieldtype: "Data", fieldname: "item_code", label: "Item Code"},
            {fieldtype: "Small Text", fieldname: "description", label: "Description"},
            {fieldtype: "Link", fieldname: "item_group", label: "Item Group", options: "Item Group"},
            {fieldtype: "Column Break"},
            {fieldtype: "Link", fieldname: "stock_uom", label: "Default UOM", options: "UOM", default: "Nos"},
            {fieldtype: "Currency", fieldname: "standard_rate", label: "Standard Rate"},
            {fieldtype: "Data", fieldname: "hsn_code", label: "HSN/SAC Code"},
            {fieldtype: "Data", fieldname: "brand", label: "Brand"},
        ],
    },
    "Supplier": {
        label: "Create Supplier",
        fields: [
            {fieldtype: "Data", fieldname: "supplier_name", label: "Supplier Name", reqd: 1},
            {fieldtype: "Link", fieldname: "supplier_group", label: "Supplier Group", options: "Supplier Group"},
            {fieldtype: "Select", fieldname: "supplier_type", label: "Supplier Type", options: "Company\nIndividual", default: "Company"},
            {fieldtype: "Data", fieldname: "tax_id", label: "Tax ID / GSTIN"},
            {fieldtype: "Column Break"},
            {fieldtype: "Data", fieldname: "email_id", label: "Email"},
            {fieldtype: "Data", fieldname: "mobile_no", label: "Mobile"},
            {fieldtype: "Data", fieldname: "city", label: "City"},
            {fieldtype: "Data", fieldname: "country", label: "Country", default: "India"},
        ],
    },
    "Customer": {
        label: "Create Customer",
        fields: [
            {fieldtype: "Data", fieldname: "customer_name", label: "Customer Name", reqd: 1},
            {fieldtype: "Link", fieldname: "customer_group", label: "Customer Group", options: "Customer Group"},
            {fieldtype: "Select", fieldname: "customer_type", label: "Customer Type", options: "Company\nIndividual", default: "Company"},
            {fieldtype: "Data", fieldname: "tax_id", label: "Tax ID / GSTIN"},
            {fieldtype: "Column Break"},
            {fieldtype: "Link", fieldname: "territory", label: "Territory", options: "Territory"},
            {fieldtype: "Data", fieldname: "email_id", label: "Email"},
            {fieldtype: "Data", fieldname: "mobile_no", label: "Mobile"},
            {fieldtype: "Data", fieldname: "city", label: "City"},
        ],
    },
    "Employee": {
        label: "Create Employee",
        fields: [
            {fieldtype: "Data", fieldname: "employee_name", label: "Full Name", reqd: 1},
            {fieldtype: "Data", fieldname: "first_name", label: "First Name"},
            {fieldtype: "Data", fieldname: "last_name", label: "Last Name"},
            {fieldtype: "Data", fieldname: "designation", label: "Designation"},
            {fieldtype: "Link", fieldname: "department", label: "Department", options: "Department"},
            {fieldtype: "Column Break"},
            {fieldtype: "Select", fieldname: "gender", label: "Gender", options: "\nMale\nFemale\nOther"},
            {fieldtype: "Date", fieldname: "date_of_birth", label: "Date of Birth"},
            {fieldtype: "Date", fieldname: "date_of_joining", label: "Date of Joining"},
            {fieldtype: "Link", fieldname: "company", label: "Company", options: "Company", reqd: 1},
            {fieldtype: "Data", fieldname: "cell_number", label: "Mobile"},
        ],
    },
    "Address": {
        label: "Create Address",
        link_party: true,
        fields: [
            {fieldtype: "Data", fieldname: "address_title", label: "Address Title", reqd: 1},
            {fieldtype: "Select", fieldname: "address_type", label: "Address Type", options: "Billing\nShipping\nOffice\nPersonal", default: "Billing"},
            {fieldtype: "Data", fieldname: "address_line1", label: "Address Line 1", reqd: 1},
            {fieldtype: "Data", fieldname: "address_line2", label: "Address Line 2"},
            {fieldtype: "Column Break"},
            {fieldtype: "Data", fieldname: "city", label: "City", reqd: 1},
            {fieldtype: "Data", fieldname: "state", label: "State"},
            {fieldtype: "Data", fieldname: "pincode", label: "Pincode"},
            {fieldtype: "Data", fieldname: "country", label: "Country", default: "India"},
        ],
    },
    "Contact": {
        label: "Create Contact",
        link_party: true,
        fields: [
            {fieldtype: "Data", fieldname: "first_name", label: "First Name", reqd: 1},
            {fieldtype: "Data", fieldname: "last_name", label: "Last Name"},
            {fieldtype: "Data", fieldname: "designation", label: "Designation"},
            {fieldtype: "Data", fieldname: "company_name", label: "Company Name"},
            {fieldtype: "Column Break"},
            {fieldtype: "Data", fieldname: "email_id", label: "Email"},
            {fieldtype: "Data", fieldname: "mobile_no", label: "Mobile"},
            {fieldtype: "Data", fieldname: "department", label: "Department"},
        ],
    },
    "Warehouse": {
        label: "Create Warehouse",
        fields: [
            {fieldtype: "Data", fieldname: "warehouse_name", label: "Warehouse Name", reqd: 1},
            {fieldtype: "Link", fieldname: "warehouse_type", label: "Warehouse Type", options: "Warehouse Type"},
            {fieldtype: "Link", fieldname: "company", label: "Company", options: "Company"},
            {fieldtype: "Column Break"},
            {fieldtype: "Data", fieldname: "address_line1", label: "Address Line 1"},
            {fieldtype: "Data", fieldname: "city", label: "City"},
            {fieldtype: "Data", fieldname: "phone_no", label: "Phone"},
        ],
    },
};

const DI_ENTITY_ORDER = ["Item", "Supplier", "Customer", "Employee", "Address", "Contact", "Warehouse"];

function add_entity_create_buttons(frm) {
    DI_ENTITY_ORDER.forEach((entity_type) => {
        const cfg = DI_ENTITY_CONFIG[entity_type];
        frm.add_custom_button(cfg.label, () => {
            open_entity_extract_dialog(frm, entity_type);
        }, "Create");
    });
}

function open_entity_extract_dialog(frm, entity_type) {
    const cfg = DI_ENTITY_CONFIG[entity_type];
    frappe.show_progress(`Extracting ${entity_type} data with AI...`, 0, 100, "Please wait...");

    frappe.call({
        method: "doc_intelligence.doc_intelligence.api.extract_entity",
        args: {doc_name: frm.doc.name, entity_type: entity_type},
        callback(r) {
            frappe.hide_progress();
            if (!r.message) return;

            const ext = r.message.extracted || {};
            const matched = r.message.matched;
            const match_confidence = r.message.match_confidence || 0;
            const match_multiple = r.message.match_multiple;
            const dialog_fields = [];

            const match_note = match_multiple
                ? `<span style="color:#b91c1c">&#9888; Multiple similar ${entity_type} records found — check carefully before creating a new one.</span>`
                : matched
                    ? `<span style="color:#d97706">&#9888; Similar ${entity_type} exists: <b>${matched}</b> (${match_confidence}% match). Creating will make a new one.</span>`
                    : `<span style="color:green">&#10003; No existing ${entity_type} matched — safe to create.</span>`;

            dialog_fields.push({
                fieldtype: "HTML",
                fieldname: "banner",
                options: `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px">
                    <strong>AI Extracted</strong> (${r.message.ai_provider || "ai"})<br>${match_note}
                </div>`,
            });

            if (cfg.link_party) {
                dialog_fields.push({
                    fieldtype: "Select", fieldname: "link_doctype", label: "Link To (party type)",
                    options: "\nSupplier\nCustomer\nEmployee\nContact\nCompany",
                    description: "Optional: attach this record to an existing party",
                });
                dialog_fields.push({
                    fieldtype: "Dynamic Link", fieldname: "link_name", label: "Party",
                    options: "link_doctype",
                });
                dialog_fields.push({fieldtype: "Section Break"});
            }

            cfg.fields.forEach((f) => {
                const df = Object.assign({}, f);
                if (ext[f.fieldname] !== undefined && ext[f.fieldname] !== null && ext[f.fieldname] !== "") {
                    df.default = ext[f.fieldname];
                }
                dialog_fields.push(df);
            });

            const d = new frappe.ui.Dialog({
                title: cfg.label,
                size: "large",
                fields: dialog_fields,
                primary_action_label: `Create ${entity_type}`,
                primary_action(values) {
                    d.hide();
                    frappe.show_progress(`Creating ${entity_type}...`, 0, 100);
                    frappe.call({
                        method: "doc_intelligence.doc_intelligence.api.create_entity_doc",
                        args: {entity_type: entity_type, values: JSON.stringify(values)},
                        callback(res) {
                            frappe.hide_progress();
                            if (res.message && res.message.name) {
                                frappe.show_alert({message: `${entity_type} ${res.message.name} created!`, indicator: "green"}, 5);
                                frappe.set_route("Form", entity_type, res.message.name);
                            }
                        },
                        error() { frappe.hide_progress(); },
                    });
                },
            });
            d.show();
        },
        error() { frappe.hide_progress(); },
    });
}
// === end entity Create buttons ===


// === Doc Intelligence: transactional Create buttons (auto-added) ===
const DI_TXN_ORDER = ["Quotation", "Sales Order", "Purchase Order", "Material Request"];

function add_txn_create_buttons(frm) {
    DI_TXN_ORDER.forEach((txn_type) => {
        frm.add_custom_button(`Create ${txn_type}`, () => {
            open_txn_dialog(frm, txn_type);
        }, "Create");
    });
}

function open_txn_dialog(frm, txn_type) {
    frappe.show_progress(`Extracting ${txn_type} data with AI...`, 0, 100, "Please wait...");
    frappe.call({
        method: "doc_intelligence.doc_intelligence.api.extract_transaction",
        args: {doc_name: frm.doc.name, txn_type: txn_type},
        callback(r) {
            frappe.hide_progress();
            if (!r.message) return;
            const data = r.message;
            const ext = data.extracted || {};
            const has_party = !!data.party_type;

            // Items preview table
            const items_html = (() => {
                const rows = (data.items || []).map((it, i) => {
                    const badge = it.status === "matched"
                        ? `<span style="color:green">&#10003; ${it.item_code}</span>`
                        : `<span style="color:#d97706">&#9888; will create</span>`;
                    return `<tr>
                        <td>${i+1}</td><td>${it.item_name}</td>
                        <td>${it.qty}</td><td>${it.rate}</td><td>${it.uom}</td><td>${badge}</td>
                    </tr>`;
                }).join("");
                return `<table class="table table-bordered table-sm" style="font-size:12px">
                    <thead style="background:#1a2744;color:white">
                        <tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>UOM</th><th>Item Link</th></tr>
                    </thead><tbody>${rows}</tbody></table>`;
            })();

            const party_note = !has_party ? "" : (data.matched_party
                ? `<span style="color:green">&#10003; Matched ${data.party_type}: ${data.matched_party}${data.party_match_confidence < 100 ? ` (${data.party_match_confidence}% confidence)` : ""}</span>`
                : data.party_multiple_matches
                    ? `<span style="color:#b91c1c">&#9888; Multiple similar ${data.party_type}s found — please select manually below.</span>`
                    : `<span style="color:#d97706">&#9888; ${data.party_type} not found — select manually.</span>`);

            const validation = data.validation || {};
            const risk_banner = validation.risk_level === "HIGH"
                ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
                    <strong>&#9888; Totals don't match</strong><br>
                    AI-reported total: &#8377;${validation.detected_grand_total} ·
                    Recalculated from line items: &#8377;${validation.calculated_grand_total} ·
                    Mismatch: &#8377;${validation.mismatch_amount}<br>
                    Double-check the line items below before creating this ${txn_type}.
                   </div>`
                : validation.risk_level === "LOW"
                    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px">
                        &#10003; Totals check out (recalculated: &#8377;${validation.calculated_grand_total})
                       </div>`
                    : "";

            const dup = data.duplicate_of;
            const duplicate_banner = dup
                ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
                    <strong>&#9888; Possible duplicate ${txn_type}</strong><br>
                    A ${txn_type} for this ${data.party_type || "party"} on this date already exists as <b>${dup.name}</b>.
                   </div>`
                : "";

            const fields = [{
                fieldtype: "HTML", fieldname: "banner",
                options: `${risk_banner}${duplicate_banner}<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px">
                    <strong>AI Extracted</strong> (${data.ai_provider || "ai"})${has_party ? "<br>" + party_note : ""}
                </div>`,
            }];

            if (has_party) {
                fields.push({
                    fieldtype: "Link", fieldname: "party", label: data.party_type,
                    options: data.party_type, reqd: 1, default: data.matched_party || "",
                });
            }

            fields.push({fieldtype: "Link", fieldname: "company", label: "Company", options: "Company", reqd: 1, default: frappe.defaults.get_default("company")});
            fields.push({fieldtype: "Date", fieldname: "transaction_date", label: "Date", default: ext.transaction_date || frappe.datetime.get_today()});

            if (txn_type === "Material Request") {
                fields.push({fieldtype: "Select", fieldname: "mr_type", label: "Purpose",
                    options: "Purchase\nMaterial Transfer\nMaterial Issue\nManufacture\nCustomer Provided",
                    default: "Purchase"});
                fields.push({fieldtype: "Date", fieldname: "required_by", label: "Required By", default: ext.valid_till || frappe.datetime.get_today()});
            } else {
                const dlabel = (txn_type === "Quotation") ? "Valid Till"
                    : (txn_type === "Sales Order") ? "Delivery Date" : "Required By";
                fields.push({fieldtype: "Date", fieldname: "valid_till", label: dlabel, default: ext.valid_till || ""});
                fields.push({fieldtype: "Data", fieldname: "currency", label: "Currency", default: ext.currency || "INR"});
            }

            fields.push({fieldtype: "Section Break", label: "Items"});
            fields.push({fieldtype: "HTML", fieldname: "items_html", options: items_html});

            if (dup) {
                fields.push({fieldtype: "Section Break"});
                fields.push({
                    fieldtype: "Check",
                    fieldname: "confirm_duplicate",
                    label: "Create anyway — I've verified this is not a duplicate",
                });
            }

            const d = new frappe.ui.Dialog({
                title: `Create ${txn_type}`,
                size: "large",
                fields: fields,
                primary_action_label: `Create Draft ${txn_type}`,
                primary_action(values) {
                    if (has_party && !values.party) {
                        frappe.msgprint(`Please select a ${data.party_type}.`);
                        return;
                    }
                    if (dup && !values.confirm_duplicate) {
                        frappe.msgprint("Please confirm this is not a duplicate before creating it.");
                        return;
                    }
                    d.hide();
                    frappe.show_progress(`Creating ${txn_type}...`, 0, 100);
                    frappe.call({
                        method: "doc_intelligence.doc_intelligence.api.create_transaction_doc",
                        args: {
                            txn_type: txn_type,
                            header: JSON.stringify(values),
                            items: JSON.stringify(data.items || []),
                            confirm_duplicate: values.confirm_duplicate ? 1 : 0
                        },
                        callback(res) {
                            frappe.hide_progress();
                            if (res.message && res.message.name) {
                                frappe.show_alert({message: `${txn_type} ${res.message.name} created (draft)!`, indicator: "green"}, 5);
                                frappe.set_route("Form", txn_type, res.message.name);
                            }
                        },
                        error() { frappe.hide_progress(); },
                    });
                },
            });
            d.show();
        },
        error() { frappe.hide_progress(); },
    });
}
// === end transactional Create buttons ===


// === Doc Intelligence: Capture Photo (camera) button ===
function add_camera_capture_button(frm) {
    frm.add_custom_button('<i class="fa fa-camera"></i> Capture Photo', () => {
        open_multi_capture_dialog(frm);
    });
}

let _jspdf_loading_promise = null;
function ensure_jspdf_loaded(callback) {
    if (window.jspdf && window.jspdf.jsPDF) {
        callback();
        return;
    }
    if (!_jspdf_loading_promise) {
        _jspdf_loading_promise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    _jspdf_loading_promise
        .then(() => callback())
        .catch(() => frappe.msgprint({ title: "Could not load PDF library", message: "Check your internet connection and try again.", indicator: "red" }));
}

function open_multi_capture_dialog(frm) {
    const photos = []; // { blob, url }

    const d = new frappe.ui.Dialog({
        title: "Capture Photo(s)",
        size: "large",
        fields: [
            {
                fieldtype: "HTML",
                fieldname: "capture_html",
                options: `
                    <div class="di-capture-wrap">
                        <p class="text-muted di-capture-hint">No photos captured yet. Click "Add Photo" to start — you can add multiple pages and combine them into one document.</p>
                        <div class="di-photo-strip" style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;"></div>
                    </div>
                `
            }
        ],
        primary_action_label: "Add Photo",
        primary_action() {
            capture_one_photo();
        },
        secondary_action_label: "Use Photos as Document",
        secondary_action() {
            if (!photos.length) {
                frappe.msgprint("Capture at least one photo first.");
                return;
            }
            combine_and_upload();
        }
    });

    d.show();

    const wrap = d.$wrapper.find(".di-capture-wrap");
    const strip = d.$wrapper.find(".di-photo-strip");
    const hint = d.$wrapper.find(".di-capture-hint");

    function render_strip() {
        strip.empty();
        photos.forEach((p, i) => {
            const thumb = $(`
                <div style="position:relative;">
                    <img src="${p.url}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />
                    <span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,.65);color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;">${i + 1}</span>
                    <button style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;font-size:11px;cursor:pointer;">✕</button>
                </div>
            `);
            thumb.find("button").on("click", () => {
                URL.revokeObjectURL(p.url);
                photos.splice(i, 1);
                render_strip();
            });
            strip.append(thumb);
        });
        hint.text(photos.length ? `${photos.length} photo(s) captured.` : "No photos captured yet. Click \"Add Photo\" to start.");
    }

    function capture_one_photo() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.capture = "environment";
        input.style.display = "none";
        input.addEventListener("change", () => {
            const f = input.files && input.files[0];
            if (f) {
                photos.push({ blob: f, url: URL.createObjectURL(f) });
                render_strip();
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    }

    function blob_to_data_url(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function load_image(data_url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = data_url;
        });
    }

    function combine_and_upload() {
        ensure_jspdf_loaded(async () => {
            frappe.show_progress("Combining photos...", 0, 100);
            try {
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ unit: "pt", format: "a4" });
                const page_w = pdf.internal.pageSize.getWidth();
                const page_h = pdf.internal.pageSize.getHeight();

                for (let i = 0; i < photos.length; i++) {
                    const data_url = await blob_to_data_url(photos[i].blob);
                    const img = await load_image(data_url);
                    const scale = Math.min(page_w / img.width, page_h / img.height);
                    const w = img.width * scale;
                    const h = img.height * scale;
                    const x = (page_w - w) / 2;
                    const y = (page_h - h) / 2;
                    if (i > 0) pdf.addPage();
                    pdf.addImage(data_url, "JPEG", x, y, w, h);
                }

                const pdf_blob = pdf.output("blob");
                frappe.hide_progress();
                d.hide();
                upload_captured_photo(frm, new File([pdf_blob], `capture-${Date.now()}.pdf`, { type: "application/pdf" }));
            } catch (e) {
                frappe.hide_progress();
                frappe.msgprint({ title: "Failed to combine photos", message: e.message, indicator: "red" });
            }
        });
    }
}

function upload_captured_photo(frm, file_obj) {
    const form_data = new FormData();
    form_data.append("file", file_obj, file_obj.name || `capture-${Date.now()}.jpg`);
    form_data.append("is_private", "1");
    if (!frm.is_new()) {
        form_data.append("doctype", frm.doctype);
        form_data.append("docname", frm.docname);
        form_data.append("fieldname", "file_attachment");
    }

    frappe.show_progress("Uploading...", 0, 100);
    fetch("/api/method/upload_file", {
        method: "POST",
        headers: { "X-Frappe-CSRF-Token": frappe.csrf_token },
        body: form_data
    })
        .then(r => r.json())
        .then(data => {
            frappe.hide_progress();
            if (data && data.message && data.message.file_url) {
                frm.set_value("file_attachment", data.message.file_url);
                frappe.show_alert({ message: "Photo(s) attached", indicator: "green" }, 4);
                if (!frm.is_new()) frm.save();
            } else {
                frappe.msgprint({ title: "Upload failed", message: "Could not upload the captured photo.", indicator: "red" });
            }
        })
        .catch(() => {
            frappe.hide_progress();
            frappe.msgprint({ title: "Upload failed", message: "Could not upload the captured photo.", indicator: "red" });
        });
}
// === end Capture Photo (camera) button ===

