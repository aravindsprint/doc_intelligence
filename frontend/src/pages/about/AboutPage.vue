<template>
  <div>
    <h1>About Doc Intelligence</h1>
    <p class="di-sub">Free and open source, forever — no plans, no limits.</p>

    <div class="di-card">
      <p>
        Doc Intelligence is a free, open-source Frappe app for AI-powered document analysis and
        ERPNext automation — upload a PDF, DOCX, or photo and get an instant summary, key entities,
        extracted tables, and the ability to ask questions or compare documents.
      </p>
      <p>
        It can also create draft ERPNext records directly from a document — Item, Supplier,
        Customer, Employee, Address, Quotation, Sales Order, Purchase Order, Material Request,
        and Purchase Invoice — with independent financial validation, fuzzy party matching, and
        duplicate detection built in.
      </p>
      <p>
        It routes every request through multiple LLM providers with automatic fallback, so you
        can bring your own free-tier API keys (Groq, Gemini, Cerebras, OpenRouter, Mistral,
        DeepSeek) — or a paid key (OpenAI, Claude) — and it's entirely self-hosted: your documents
        and your API keys never leave your own server.
      </p>
      <p v-if="auth.supportEmail">
        Questions or feedback? Reach out at
        <a :href="`mailto:${auth.supportEmail}`">{{ auth.supportEmail }}</a>.
      </p>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<style scoped>
h1 { font-size: 22px; margin: 0 0 4px; color: var(--di-navy); }
.di-sub { color: var(--di-muted); font-size: 13px; margin: 0 0 22px; }
.di-card p { margin: 0 0 12px; line-height: 1.6; }
.di-card p:last-child { margin-bottom: 0; }
.di-card a { color: var(--di-blue); }
</style>
