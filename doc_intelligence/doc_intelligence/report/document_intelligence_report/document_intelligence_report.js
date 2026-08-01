frappe.query_reports["Document Intelligence Report"] = {
    filters: [
        {fieldname:"from_date", label:"From Date", fieldtype:"Date"},
        {fieldname:"to_date",   label:"To Date",   fieldtype:"Date"},
        {
            fieldname:"document_type", label:"Document Type", fieldtype:"Select",
            options: ["","Entities","Transactions"].join("\n")
        },
        {
            fieldname:"status", label:"Status", fieldtype:"Select",
            options: ["","Pending","Processing","Ready","Failed"].join("\n")
        },
    ],
    formatter(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (column.fieldname === "status") {
            const map = {Ready:"green", Failed:"red", Processing:"blue", Pending:"orange"};
            const color = map[data.status] || "gray";
            value = `<span class="indicator ${color}">${data.status}</span>`;
        }
        if (column.fieldname === "token_count" && data.token_count) {
            value = `<span style="color:#2563eb;font-weight:600;font-variant-numeric:tabular-nums">${data.token_count.toLocaleString()}</span>`;
        }
        return value;
    }
};
