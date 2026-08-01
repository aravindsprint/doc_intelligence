<template>
  <div class="di-noaccess">
    <div class="di-noaccess-icon">⛔</div>
    <h1>Access Restricted</h1>
    <p>You don't have permission to view this page.</p>
    <router-link to="/doc-intelligence/home" class="di-btn primary">Back to Documents</router-link>
  </div>
</template>

<style scoped>
.di-noaccess { text-align: center; padding: 80px 16px; }
.di-noaccess-icon { font-size: 40px; margin-bottom: 12px; }
h1 { font-size: 20px; color: var(--di-navy); margin: 0 0 8px; }
p { color: var(--di-muted); margin: 0 0 20px; }
</style>
