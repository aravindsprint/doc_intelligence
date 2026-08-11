<template>
  <div>
    <h1>Ask ERPNext</h1>
    <p class="di-ask-intro">
      Ask a plain-English question about your ERPNext data. Every question runs through a
      validated query — no raw SQL, nothing is ever changed without your explicit approval.
    </p>

    <div class="di-card">
      <div class="di-ask-row">
        <input
          v-model="question"
          class="di-input"
          placeholder="e.g. Show unpaid invoices older than 30 days"
          :disabled="asking"
          @keyup.enter="ask()"
        />
        <button class="di-btn primary" :disabled="asking || !question" @click="ask()">
          {{ asking ? 'Thinking…' : 'Ask' }}
        </button>
      </div>

      <div v-if="demoPrompts.length" class="di-demo-row">
        <button
          v-for="p in demoPrompts" :key="p"
          class="di-demo-chip" :disabled="asking"
          @click="ask(p)"
        >{{ p }}</button>
      </div>

      <div v-if="askError" class="di-error" style="margin-top:14px">{{ askError }}</div>
    </div>

    <!-- Result -->
    <div v-if="result" class="di-card" style="margin-top:14px">
      <div v-if="result.note" class="di-ask-note">{{ result.note }}</div>

      <!-- unsupported -->
      <div v-if="result.action === 'unsupported'" class="di-empty">
        I can't answer that with the data available here.
      </div>

      <!-- count -->
      <div v-else-if="result.action === 'count'" class="di-count-box">
        <div class="di-count-num">{{ result.total }}</div>
        <div class="di-count-label">{{ result.doctype }}</div>
      </div>

      <!-- create_draft -->
      <div v-else-if="result.action === 'create_draft'">
        <h3>Proposed new {{ result.doctype }} — nothing has been created yet</h3>
        <table class="di-item-table" v-if="Object.keys(result.values || {}).length">
          <tbody>
            <tr v-for="(v, k) in result.values" :key="k">
              <td style="font-weight:600;width:35%">{{ k }}</td>
              <td>{{ v }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="di-ask-note">No fields were filled in — you'll be able to complete the form after creating.</p>
        <div v-if="createError" class="di-error" style="margin-top:10px">{{ createError }}</div>
        <div class="di-ask-row" style="margin-top:10px">
          <button class="di-btn primary" :disabled="creating" @click="approveCreate">
            {{ creating ? 'Creating…' : 'Approve & Create' }}
          </button>
          <button class="di-btn secondary" :disabled="creating" @click="result = null">Cancel</button>
        </div>
      </div>

      <!-- list / get -->
      <div v-else>
        <div v-if="!result.rows || !result.rows.length" class="di-empty">
          No matching {{ result.doctype }} records.
        </div>
        <template v-else>
          <div class="di-ask-note">{{ result.count }} result{{ result.count === 1 ? '' : 's' }}</div>
          <div class="di-table-wrap">
            <table class="di-item-table">
              <thead>
                <tr><th v-for="f in result.fields" :key="f">{{ f }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in result.rows" :key="i">
                  <td v-for="f in result.fields" :key="f">
                    <a v-if="f === 'name'" :href="`/app/${slug(result.doctype)}/${encodeURIComponent(row[f])}`" target="_blank">{{ row[f] }}</a>
                    <template v-else>{{ row[f] ?? '' }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '@/api/frappe'

const question = ref('')
const demoPrompts = ref([])
const asking = ref(false)
const askError = ref('')
const result = ref(null)

const creating = ref(false)
const createError = ref('')

function slug(doctype) {
  return doctype.toLowerCase().replace(/ /g, '-')
}

onMounted(async () => {
  try {
    demoPrompts.value = await api.copilotDemoPrompts() || []
  } catch { /* non-critical — just skip the demo chips */ }
})

async function ask(text) {
  const q = (text ?? question.value).trim()
  if (!q || asking.value) return
  question.value = q
  asking.value = true
  askError.value = ''
  createError.value = ''
  result.value = null
  try {
    result.value = await api.copilotAsk(q)
  } catch (err) {
    askError.value = err.message
  } finally {
    asking.value = false
  }
}

async function approveCreate() {
  if (!result.value || result.value.action !== 'create_draft') return
  creating.value = true
  createError.value = ''
  try {
    const created = await api.copilotConfirmCreate(result.value.doctype, result.value.values)
    window.open(`/app/${slug(created.doctype)}/${encodeURIComponent(created.name)}`, '_blank')
    result.value = null
    question.value = ''
  } catch (err) {
    createError.value = err.message
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
h1 { font-size: 22px; margin: 0 0 6px; color: var(--di-navy); }
.di-ask-intro { color: var(--di-muted); font-size: 13px; margin: 0 0 16px; max-width: 640px; }
.di-ask-row { display: flex; gap: 8px; }
.di-demo-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.di-demo-chip {
  border: 1px solid var(--di-border); background: #fff; color: var(--di-text);
  border-radius: 14px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
.di-demo-chip:hover:not(:disabled) { border-color: var(--di-blue); color: var(--di-blue); }
.di-demo-chip:disabled { opacity: .5; cursor: not-allowed; }
.di-ask-note { color: var(--di-muted); font-size: 12px; margin-bottom: 10px; }
h3 { font-size: 14px; margin: 0 0 12px; color: var(--di-navy); }

.di-count-box { text-align: center; padding: 24px; }
.di-count-num { font-size: 40px; font-weight: 700; color: var(--di-blue); }
.di-count-label { color: var(--di-muted); }

.di-table-wrap { overflow-x: auto; }
.di-item-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.di-item-table th, .di-item-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--di-border); white-space: nowrap; }
</style>
