<template>
  <div class="di-modal-backdrop" @click.self="close">
    <div class="di-modal di-card di-modal-wide">
      <h2>Create ERPNext Record</h2>
      <div v-if="error" class="di-error">{{ error }}</div>

      <!-- Step 1: choose target -->
      <template v-if="step === 1">
        <label class="di-label">What do you want to create from this document?</label>
        <select v-model="target" class="di-select">
          <optgroup label="Entities">
            <option v-for="t in entityTypes" :key="t" :value="t">{{ t }}</option>
          </optgroup>
          <optgroup label="Transactions">
            <option value="Purchase Invoice">Purchase Invoice</option>
            <option v-for="t in txnTypes" :key="t" :value="t">{{ t }}</option>
          </optgroup>
        </select>
        <div class="di-modal-actions">
          <button class="di-btn secondary" @click="close">Cancel</button>
          <button class="di-btn primary" :disabled="extracting" @click="extract">
            {{ extracting ? 'Asking AI…' : 'Extract with AI' }}
          </button>
        </div>
      </template>

      <!-- Step 2: review + confirm -->
      <template v-else-if="step === 2">
        <div v-if="matchedNotice" class="di-notice">{{ matchedNotice }}</div>

        <!-- Purchase Invoice: financial validation + supplier ambiguity + duplicate warnings -->
        <template v-if="mode === 'pi'">
          <div v-if="piValidation" class="di-risk-banner" :class="piValidation.risk_level === 'HIGH' ? 'risk-high' : 'risk-low'">
            <strong>{{ piValidation.risk_level === 'HIGH' ? '⚠ Totals don\'t match' : '✓ Totals check out' }}</strong>
            <div class="di-risk-detail">
              AI-reported total: {{ header.currency }} {{ piValidation.detected_grand_total }} ·
              Recalculated from line items: {{ header.currency }} {{ piValidation.calculated_grand_total }}
              <span v-if="piValidation.risk_level === 'HIGH'"> · Mismatch: {{ header.currency }} {{ piValidation.mismatch_amount }}</span>
            </div>
            <div v-if="piValidation.risk_level === 'HIGH'" class="di-risk-detail">
              Double-check the line items and tax amount below before creating this invoice.
            </div>
          </div>

          <div v-if="supplierMultipleMatches" class="di-risk-banner risk-high">
            <strong>⚠ Multiple similar suppliers found</strong>
            <div class="di-risk-detail">
              Couldn't confidently auto-match "{{ header.supplier_name }}" to one existing supplier —
              please pick the correct one below or confirm a new supplier should be created.
            </div>
          </div>
          <div v-else-if="supplierMatchConfidence && supplierMatchConfidence < 100 && header.matched_supplier" class="di-risk-banner risk-low">
            <div class="di-risk-detail">Matched by similarity ({{ supplierMatchConfidence }}% confidence) — verify this is correct.</div>
          </div>

          <div v-if="piDuplicate" class="di-risk-banner risk-high">
            <strong>⚠ Possible duplicate invoice</strong>
            <div class="di-risk-detail">
              Bill No "{{ header.bill_no }}" already exists as <strong>{{ piDuplicate.name }}</strong>
              (Supplier: {{ piDuplicate.supplier }}, Total: {{ piDuplicate.grand_total }}).
            </div>
            <label class="di-checkbox-row" style="margin-top:8px">
              <input type="checkbox" v-model="confirmDuplicate" />
              Create anyway — I've verified this is not a duplicate
            </label>
          </div>
        </template>

        <!-- Transaction: financial validation + party ambiguity + duplicate warnings -->
        <template v-if="mode === 'txn'">
          <div v-if="txnValidation" class="di-risk-banner" :class="txnValidation.risk_level === 'HIGH' ? 'risk-high' : 'risk-low'">
            <strong>{{ txnValidation.risk_level === 'HIGH' ? '⚠ Totals don\'t match' : '✓ Totals check out' }}</strong>
            <div class="di-risk-detail">
              AI-reported total: {{ header.currency }} {{ txnValidation.detected_grand_total }} ·
              Recalculated from line items: {{ header.currency }} {{ txnValidation.calculated_grand_total }}
              <span v-if="txnValidation.risk_level === 'HIGH'"> · Mismatch: {{ header.currency }} {{ txnValidation.mismatch_amount }}</span>
            </div>
            <div v-if="txnValidation.risk_level === 'HIGH'" class="di-risk-detail">
              Double-check the line items below before creating this {{ target }}.
            </div>
          </div>

          <div v-if="partyMultipleMatches" class="di-risk-banner risk-high">
            <strong>⚠ Multiple similar {{ header.party_type }}s found</strong>
            <div class="di-risk-detail">
              Couldn't confidently auto-match "{{ header.party_name }}" to one existing {{ header.party_type }} —
              please pick the correct one below or confirm a new one should be created.
            </div>
          </div>
          <div v-else-if="partyMatchConfidence && partyMatchConfidence < 100 && header.matched_party" class="di-risk-banner risk-low">
            <div class="di-risk-detail">Matched by similarity ({{ partyMatchConfidence }}% confidence) — verify this is correct.</div>
          </div>

          <div v-if="txnDuplicate" class="di-risk-banner risk-high">
            <strong>⚠ Possible duplicate {{ target }}</strong>
            <div class="di-risk-detail">
              A {{ target }} for this {{ header.party_type }} on this date already exists as <strong>{{ txnDuplicate.name }}</strong>.
            </div>
            <label class="di-checkbox-row" style="margin-top:8px">
              <input type="checkbox" v-model="confirmDuplicate" />
              Create anyway — I've verified this is not a duplicate
            </label>
          </div>
        </template>

        <!-- Entity, many records found: review table -->
        <template v-if="mode === 'entity-bulk'">
          <div class="di-notice">
            Found {{ bulkRows.length }} {{ target }} records in this document. Untick any you don't want, then create them together.
          </div>
          <div v-if="bulkExistingCount" class="di-risk-banner risk-high">
            <div class="di-risk-detail">
              {{ bulkExistingCount }} look like they already exist in ERPNext and have been unticked — tick them again if they're really new.
            </div>
          </div>

          <div v-if="bulkLinkColumns.length" class="di-bulk-fill">
            <div v-for="col in bulkLinkColumns" :key="col" class="di-bulk-fill-row">
              <label class="di-label">{{ prettyLabel(col) }} for all ticked rows</label>
              <div class="di-bulk-fill-ctrl">
                <LinkField v-model="bulkFill[col]" :doctype="linkDoctypeFor(col)" :placeholder="`Search ${linkDoctypeFor(col)}`" />
                <button class="di-btn secondary" :disabled="!bulkFill[col]" @click="applyBulkFill(col)">Apply</button>
              </div>
            </div>
          </div>

          <div class="di-bulk-wrap">
            <table class="di-item-table">
              <thead>
                <tr>
                  <th><input type="checkbox" :checked="allSelected" @change="toggleAll($event.target.checked)" /></th>
                  <th v-for="col in bulkColumns" :key="col">{{ prettyLabel(col) }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in bulkRows" :key="i" :class="{ 'di-row-off': !row.selected }">
                  <td><input type="checkbox" v-model="row.selected" /></td>
                  <td v-for="col in bulkColumns" :key="col"><input v-model="row.values[col]" class="di-input" /></td>
                  <td class="di-row-flag">
                    <span v-if="row.matched" class="di-flag" :title="`Similar to existing ${row.matched}`">exists</span>
                    <span v-else-if="row.match_multiple" class="di-flag" title="Several similar records exist">similar</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="di-hint">Other fields the AI found (description, HSN, etc.) are created too — open each record afterwards to fine-tune.</p>
        </template>

        <!-- Entity: generic key/value form -->
        <template v-else-if="mode === 'entity'">
          <div v-if="entityMultipleMatches" class="di-risk-banner risk-high">
            <strong>⚠ Multiple similar {{ target }} records found</strong>
            <div class="di-risk-detail">
              Couldn't confidently tell which existing {{ target }} this might be — check the search field below before creating a new one.
            </div>
          </div>
          <div v-else-if="entityMatchConfidence && entityMatchConfidence < 100 && entityMatched" class="di-risk-banner risk-low">
            <div class="di-risk-detail">Similar existing {{ target }} found ({{ entityMatchConfidence }}% confidence) — verify this isn't a duplicate.</div>
          </div>

          <div class="di-form-grid">
            <div v-for="(val, key) in fields" :key="key">
              <label class="di-label">{{ prettyLabel(key) }}</label>
              <LinkField
                v-if="linkDoctypeFor(key)"
                v-model="fields[key]"
                :doctype="linkDoctypeFor(key)"
                :placeholder="`Search ${linkDoctypeFor(key)}`"
              />
              <input v-else v-model="fields[key]" class="di-input" />
            </div>
          </div>
          <p v-if="primaryFieldKey && fields[primaryFieldKey]" class="di-hint">
            Picking a search result above is just to help you spot a duplicate — Create will still make a new {{ target }} record. Adjust the name if you don't want one.
          </p>
        </template>

        <!-- Transaction / Purchase Invoice: header + items -->
        <template v-else-if="mode === 'pi' || mode === 'txn'">
          <div class="di-form-grid">
            <div v-if="mode === 'pi'">
              <label class="di-label">Supplier {{ header.matched_supplier ? '(matched)' : '(will create if new)' }}</label>
              <LinkField
                v-model="header.supplier_name"
                doctype="Supplier"
                placeholder="Search or type a new supplier name"
                @select="(r) => { header.matched_supplier = r.value }"
                @update:modelValue="() => { header.matched_supplier = null }"
              />
            </div>
            <div v-else-if="header.party_type">
              <label class="di-label">{{ header.party_type }} {{ header.matched_party ? '(matched)' : '(will create if new)' }}</label>
              <LinkField
                v-model="header.party_name"
                :doctype="header.party_type"
                :placeholder="`Search or type a new ${header.party_type || 'party'} name`"
                @select="(r) => { header.matched_party = r.value }"
                @update:modelValue="() => { header.matched_party = null }"
              />
            </div>
            <div>
              <label class="di-label">Company</label>
              <select v-model="header.company" class="di-select">
                <option v-for="c in companies" :key="c.name" :value="c.name">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="di-label">{{ mode === 'pi' ? 'Bill No' : 'Transaction Date' }}</label>
              <input v-if="mode === 'pi'" v-model="header.bill_no" class="di-input" />
              <input v-else v-model="header.transaction_date" type="date" class="di-input" />
            </div>
            <div>
              <label class="di-label">{{ mode === 'pi' ? 'Bill Date' : 'Valid Till / Required By' }}</label>
              <input v-if="mode === 'pi'" v-model="header.bill_date" type="date" class="di-input" />
              <input v-else v-model="header.valid_till" type="date" class="di-input" />
            </div>
            <div>
              <label class="di-label">Currency</label>
              <input v-model="header.currency" class="di-input" />
            </div>
          </div>

          <label class="di-label" style="margin-top:14px">Line items</label>
          <table class="di-item-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>UOM</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(it, i) in items" :key="i">
                <td><input v-model="it.item_name" class="di-input" /></td>
                <td><input v-model.number="it.qty" type="number" class="di-input" /></td>
                <td><input v-model.number="it.rate" type="number" class="di-input" /></td>
                <td><input v-model="it.uom" class="di-input" /></td>
                <td><button class="di-btn secondary" @click="items.splice(i,1)">✕</button></td>
              </tr>
            </tbody>
          </table>
          <button class="di-btn secondary" style="margin-top:8px" @click="items.push({ item_name:'', qty:1, rate:0, uom:'Nos' })">+ Add line</button>
        </template>

        <div class="di-modal-actions">
          <button class="di-btn secondary" @click="step = 1">Back</button>
          <button v-if="mode === 'entity-bulk'" class="di-btn primary" :disabled="creating || !selectedCount" @click="createBulk">
            {{ creating ? 'Creating…' : `Create ${selectedCount} ${target}${selectedCount === 1 ? '' : 's'}` }}
          </button>
          <button v-else class="di-btn primary" :disabled="creating || ((mode === 'pi' || mode === 'txn') && ((mode === 'pi' ? piDuplicate : txnDuplicate) && !confirmDuplicate))" @click="createRecord">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </template>

      <!-- Step 3: done (bulk) -->
      <template v-else-if="bulkResult">
        <div class="di-success">
          <div class="di-success-icon">✓</div>
          <div>Created <strong>{{ bulkResult.created.length }}</strong> {{ bulkResult.doctype }} record{{ bulkResult.created.length === 1 ? '' : 's' }}</div>
        </div>
        <div v-if="bulkResult.failed.length" class="di-risk-banner risk-high">
          <strong>{{ bulkResult.failed.length }} could not be created</strong>
          <ul class="di-fail-list">
            <li v-for="(f, i) in bulkResult.failed" :key="i"><strong>{{ f.label }}</strong> — {{ f.error }}</li>
          </ul>
        </div>
        <div class="di-modal-actions">
          <button v-if="bulkResult.failed.length" class="di-btn secondary" @click="step = 2">Back to list</button>
          <button class="di-btn secondary" @click="close">Close</button>
        </div>
      </template>

      <!-- Step 3: done -->
      <template v-else>
        <div class="di-success">
          <div class="di-success-icon">✓</div>
          <div>Created <strong>{{ created.name }}</strong> ({{ created.doctype }})</div>
        </div>
        <div class="di-modal-actions">
          <button class="di-btn secondary" @click="close">Close</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as api from '@/api/frappe'
import { getList } from '@/api/frappe'
import LinkField from '@/components/LinkField.vue'

const props = defineProps({ docName: { type: String, required: true } })
const emit = defineEmits(['close', 'created'])

const entityTypes = ['Item', 'Supplier', 'Customer', 'Employee', 'Address', 'Contact', 'Warehouse']
const txnTypes = ['Quotation', 'Sales Order', 'Purchase Order', 'Material Request']

const LINK_FIELD_MAP = {
  Item: { item_group: 'Item Group', stock_uom: 'UOM', brand: 'Brand', hsn_code: 'GST HSN Code' },
  Supplier: { supplier_group: 'Supplier Group', country: 'Country' },
  Customer: { customer_group: 'Customer Group', territory: 'Territory', country: 'Country' },
  Employee: { department: 'Department', designation: 'Designation' },
  Address: { country: 'Country' },
  Contact: {},
  Warehouse: { warehouse_type: 'Warehouse Type' },
}

const PRIMARY_FIELD_KEY = {
  Item: 'item_name', Supplier: 'supplier_name', Customer: 'customer_name',
  Employee: 'employee_name', Warehouse: 'warehouse_name',
}

function linkDoctypeFor(key) {
  if (LINK_FIELD_MAP[target.value]?.[key]) return LINK_FIELD_MAP[target.value][key]
  if (key === PRIMARY_FIELD_KEY[target.value]) return target.value
  return null
}

const primaryFieldKey = computed(() => PRIMARY_FIELD_KEY[target.value] || null)

// Columns shown in the multi-record review table (all extracted fields are still sent on create)
const BULK_COLUMNS = {
  Item: ['item_name', 'item_group', 'stock_uom', 'standard_rate'],
  Supplier: ['supplier_name', 'supplier_group', 'tax_id'],
  Customer: ['customer_name', 'customer_group', 'tax_id'],
  Employee: ['employee_name', 'designation', 'department'],
  Address: ['address_title', 'address_line1', 'city'],
  Contact: ['first_name', 'last_name', 'email_id'],
  Warehouse: ['warehouse_name', 'city'],
}
const bulkRows = ref([])
const bulkFill = ref({})
const bulkResult = ref(null)
const bulkColumns = computed(() => BULK_COLUMNS[target.value] || [])
const bulkLinkColumns = computed(() =>
  bulkColumns.value.filter(c => c !== primaryFieldKey.value && LINK_FIELD_MAP[target.value]?.[c]))
const selectedCount = computed(() => bulkRows.value.filter(r => r.selected).length)
const allSelected = computed(() => bulkRows.value.length > 0 && selectedCount.value === bulkRows.value.length)
const bulkExistingCount = computed(() => bulkRows.value.filter(r => r.matched).length)

function toggleAll(on) { bulkRows.value.forEach(r => { r.selected = on }) }
function applyBulkFill(col) {
  bulkRows.value.forEach(r => { if (r.selected) r.values[col] = bulkFill.value[col] })
}

const step = ref(1)
const target = ref('Item')
const mode = ref('entity')
const extracting = ref(false)
const creating = ref(false)
const error = ref('')
const matchedNotice = ref('')

const fields = ref({})
const header = ref({})
const items = ref([])
const companies = ref([])
const created = ref(null)

const piValidation = ref(null)
const piDuplicate = ref(null)
const supplierMatchConfidence = ref(null)
const supplierMultipleMatches = ref(false)
const confirmDuplicate = ref(false)

const entityMatched = ref(null)
const entityMatchConfidence = ref(null)
const entityMultipleMatches = ref(false)

const txnValidation = ref(null)
const txnDuplicate = ref(null)
const partyMatchConfidence = ref(null)
const partyMultipleMatches = ref(false)

function close() { emit('close') }

function prettyLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function loadCompanies() {
  if (companies.value.length) return
  try {
    companies.value = await getList('Company', { fields: ['name'], limit: 50 })
  } catch { /* non-fatal — company select will just be empty */ }
}

async function extract() {
  extracting.value = true
  error.value = ''
  matchedNotice.value = ''
  try {
    if (target.value === 'Purchase Invoice') {
      mode.value = 'pi'
      await loadCompanies()
      const res = await api.createPurchaseInvoice(props.docName)
      header.value = {
        supplier_name: res.supplier_name,
        matched_supplier: res.matched_supplier,
        bill_no: res.extracted?.bill_no,
        bill_date: res.extracted?.bill_date,
        posting_date: res.extracted?.posting_date,
        due_date: res.extracted?.due_date,
        currency: res.extracted?.currency || 'INR',
        remarks: res.extracted?.remarks,
        company: companies.value[0]?.name || ''
      }
      items.value = res.items || []
      piValidation.value = res.validation || null
      piDuplicate.value = res.duplicate_of || null
      supplierMatchConfidence.value = res.supplier_match_confidence ?? null
      supplierMultipleMatches.value = !!res.supplier_multiple_matches
      confirmDuplicate.value = false
      if (res.matched_supplier) matchedNotice.value = `Matched existing supplier: ${res.matched_supplier}`
    } else if (entityTypes.includes(target.value)) {
      mode.value = 'entity'
      const res = await api.extractEntity(props.docName, target.value)
      bulkResult.value = null
      if ((res.records || []).length > 1) {
        mode.value = 'entity-bulk'
        bulkFill.value = {}
        bulkRows.value = res.records.map(r => ({
          values: { ...(r.values || {}) },
          matched: r.matched || null,
          match_multiple: !!r.match_multiple,
          // Pre-untick rows that already exist so re-running doesn't make duplicates
          selected: !r.matched,
        }))
        step.value = 2
        return
      }
      fields.value = res.extracted || {}
      entityMatched.value = res.matched || null
      entityMatchConfidence.value = res.match_confidence ?? null
      entityMultipleMatches.value = !!res.match_multiple
    } else {
      mode.value = 'txn'
      await loadCompanies()
      const res = await api.extractTransaction(props.docName, target.value)
      header.value = {
        party_type: res.party_type,
        party_name: res.party_name,
        matched_party: res.matched_party,
        transaction_date: res.extracted?.transaction_date,
        valid_till: res.extracted?.valid_till,
        currency: res.extracted?.currency || 'INR',
        remarks: res.extracted?.remarks,
        company: companies.value[0]?.name || ''
      }
      items.value = res.items || []
      txnValidation.value = res.validation || null
      txnDuplicate.value = res.duplicate_of || null
      partyMatchConfidence.value = res.party_match_confidence ?? null
      partyMultipleMatches.value = !!res.party_multiple_matches
      confirmDuplicate.value = false
    }
    step.value = 2
  } catch (err) {
    error.value = err.message
  } finally {
    extracting.value = false
  }
}

async function createBulk() {
  creating.value = true
  error.value = ''
  try {
    const picked = bulkRows.value.filter(r => r.selected)
    const res = await api.createEntitiesBulk(target.value, picked.map(r => r.values))
    // Drop the rows that were created so "Back to list" shows only what's left to fix
    const done = new Set(res.created.map(c => picked[c.index]))
    bulkRows.value = bulkRows.value.filter(r => !done.has(r))
    bulkResult.value = res
    step.value = 3
    if (res.created.length) emit('created', { doctype: res.doctype, name: res.created[0].name, bulk: res })
  } catch (err) {
    error.value = err.message
  } finally {
    creating.value = false
  }
}

async function createRecord() {
  creating.value = true
  error.value = ''
  try {
    let res
    if (mode.value === 'pi') {
      res = await api.createPurchaseInvoiceDoc({
        supplier: header.value.matched_supplier || header.value.supplier_name,
        bill_no: header.value.bill_no,
        bill_date: header.value.bill_date,
        posting_date: header.value.posting_date || header.value.bill_date,
        due_date: header.value.due_date,
        company: header.value.company,
        currency: header.value.currency,
        items: items.value,
        remarks: header.value.remarks,
        naming_series: 'PINV26/.#####',
        confirm_duplicate: confirmDuplicate.value ? 1 : 0
      })
    } else if (mode.value === 'entity') {
      res = await api.createEntityDoc(target.value, fields.value)
    } else {
      res = await api.createTransactionDoc(
        target.value,
        {
          party: header.value.matched_party || header.value.party_name,
          party_type: header.value.party_type,
          company: header.value.company,
          currency: header.value.currency,
          transaction_date: header.value.transaction_date,
          valid_till: header.value.valid_till,
          required_by: header.value.valid_till
        },
        items.value,
        confirmDuplicate.value ? 1 : 0
      )
    }
    created.value = res
    bulkResult.value = null
    step.value = 3
    emit('created', res)
  } catch (err) {
    error.value = err.message
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.di-modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.5);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; overflow-y: auto;
}
.di-modal-wide { width: 100%; max-width: 640px; }
.di-modal h2 { margin: 0 0 14px; font-size: 17px; color: var(--di-navy); }
.di-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.di-notice {
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
  border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-bottom: 14px;
}
.di-risk-banner {
  border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px;
}
.di-risk-banner.risk-low {
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
}
.di-risk-banner.risk-high {
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
}
.di-risk-detail { margin-top: 4px; font-weight: 400; }
.di-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.di-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.di-hint { font-size: 12px; color: var(--di-muted); margin-top: 10px; }
.di-item-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.di-item-table th { text-align: left; font-size: 11px; color: var(--di-muted); padding: 4px 6px; }
.di-item-table td { padding: 4px 6px; }
.di-bulk-wrap { max-height: 360px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.di-bulk-wrap thead th { position: sticky; top: 0; background: #fff; z-index: 1; }
.di-row-off td { opacity: .5; }
.di-row-flag { white-space: nowrap; }
.di-flag { font-size: 11px; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 2px 6px; }
.di-bulk-fill { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.di-bulk-fill-ctrl { display: flex; gap: 6px; align-items: flex-start; }
.di-bulk-fill-ctrl > :first-child { flex: 1; }
.di-fail-list { margin: 6px 0 0; padding-left: 18px; font-weight: 400; }
.di-modal-wide { max-width: 760px; }
.di-success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0; text-align: center; }
.di-success-icon {
  width: 40px; height: 40px; border-radius: 50%; background: #dcfce7; color: #166534;
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700;
}
</style>
