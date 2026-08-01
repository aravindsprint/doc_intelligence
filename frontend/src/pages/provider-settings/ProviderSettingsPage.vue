<template>
  <div>
    <h1>LLM Provider Settings</h1>

    <div v-if="store.error" class="di-error">{{ store.error }}</div>
    <div v-if="!store.settings" class="di-empty">Loading…</div>

    <template v-else>
      <div class="di-card di-actions-row">
        <button class="di-btn secondary" :disabled="store.testing" @click="onTest">
          {{ store.testing ? 'Testing…' : 'Test All Providers' }}
        </button>
        <span class="di-label" style="margin:0">Max tokens per request</span>
        <input v-model.number="form.max_tokens_per_request" type="number" class="di-input" style="max-width:120px" />
      </div>

      <div v-if="store.testResults" class="di-card">
        <h3>Test Results</h3>
        <div class="di-test-grid">
          <div v-for="r in store.testResults" :key="r.provider" class="di-test-row">
            <span class="di-badge" :class="r.status">{{ r.status }}</span>
            <strong>{{ r.provider }}</strong>
            <span class="di-stat">{{ r.response || r.message }}</span>
          </div>
        </div>
      </div>

      <div v-for="p in providers" :key="p.id" class="di-card di-provider-row" :class="{ open: openProvider === p.id }">
        <div class="di-provider-header" @click="openProvider = openProvider === p.id ? null : p.id">
          <span class="di-dot" :style="{ background: form[p.keyField] ? '#22c55e' : '#d1d5db' }"></span>
          <span class="di-provider-name">{{ p.label }}</span>
          <span class="di-chevron">›</span>
        </div>
        <div v-if="openProvider === p.id" class="di-provider-fields">
          <label class="di-label">API Key</label>
          <input v-model="form[p.keyField]" class="di-input" type="password" placeholder="Enter to replace — leave as-is to keep current key" />
          <label class="di-label" style="margin-top:10px">Model</label>
          <input v-model="form[p.modelField]" class="di-input" :placeholder="p.defaultModel" />
        </div>
      </div>

      <div class="di-card">
        <h3>Enabled Providers (priority order, comma-separated)</h3>
        <input v-model="form.enabled_providers" class="di-input" placeholder="groq,gemini,cerebras,openrouter,mistral,claude" />
      </div>

      <div class="di-modal-actions">
        <button class="di-btn primary" :disabled="store.saving" @click="onSave">
          {{ store.saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()
const openProvider = ref(null)
const form = ref({})

const providers = [
  { id: 'groq', label: 'Groq', keyField: 'groq_api_key', modelField: 'groq_model', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'gemini', label: 'Gemini', keyField: 'gemini_api_key', modelField: 'gemini_model', defaultModel: 'gemini-2.5-flash' },
  { id: 'cerebras', label: 'Cerebras', keyField: 'cerebras_api_key', modelField: 'cerebras_model', defaultModel: 'llama3.1-70b' },
  { id: 'openrouter', label: 'OpenRouter', keyField: 'openrouter_api_key', modelField: 'openrouter_model', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free' },
  { id: 'mistral', label: 'Mistral', keyField: 'mistral_api_key', modelField: 'mistral_model', defaultModel: 'mistral-small-latest' },
  { id: 'claude', label: 'Claude', keyField: 'claude_api_key', modelField: 'claude_model', defaultModel: 'claude-haiku-4-5-20251001' },
  { id: 'openai', label: 'OpenAI (ChatGPT)', keyField: 'openai_api_key', modelField: 'openai_model', defaultModel: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', keyField: 'deepseek_api_key', modelField: 'deepseek_model', defaultModel: 'deepseek-chat' },
]

async function load() {
  await store.fetchSettings()
  form.value = { ...store.settings }
}

async function onSave() {
  await store.save(form.value)
  form.value = { ...store.settings }
}

async function onTest() {
  await store.testAll()
}

onMounted(load)
</script>

<style scoped>
h1 { font-size: 22px; margin: 0 0 16px; color: var(--di-navy); }
.di-card { margin-bottom: 14px; }
h3 { font-size: 14px; margin: 0 0 10px; color: var(--di-navy); }
.di-actions-row { display: flex; align-items: center; gap: 12px; }
.di-provider-row { cursor: default; }
.di-provider-header { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.di-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.di-provider-name { font-weight: 600; flex: 1; }
.di-chevron { color: var(--di-muted); transition: transform .15s; }
.di-provider-row.open .di-chevron { transform: rotate(90deg); }
.di-provider-fields { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--di-border); }
.di-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.di-test-grid { display: flex; flex-direction: column; gap: 8px; }
.di-test-row { display: flex; align-items: center; gap: 10px; font-size: 13px; text-transform: capitalize; }
.di-modal-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
</style>
