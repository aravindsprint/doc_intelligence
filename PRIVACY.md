# Privacy Policy

**Doc Intelligence** is free, open-source, self-hosted software. This policy explains what
happens to your data when you use it.

Throughout this document, "we," "us," and "our" refer to Aravind Govindaraj, the author and
maintainer of this project.

## 1. We don't collect anything

We do not operate a hosted version of this app, do not have a server that your installation
talks to, and do not receive, store, or have access to any of your documents, extracted data,
API keys, or usage information.

Everything — your uploaded documents, the text and data extracted from them, your LLM provider
API keys, and your ERPNext records — stays on **your own Frappe site**, in **your own database**,
under **your own control**.

## 2. What the app does with your data

When you upload a document:

1. It's stored as a file on your own Frappe site (private by default).
2. The extracted text is sent to whichever LLM provider(s) you've configured with your own API
   key(s) — for example Groq, Gemini, Cerebras, OpenRouter, Mistral, DeepSeek, OpenAI, or Claude —
   in order to generate the summary, extracted entities, tables, and answers to your questions.
3. The provider's response is saved back into your own Frappe database.

Because this happens using **your own API keys**, that document content is subject to the privacy
policy and data handling practices of whichever LLM provider(s) you've chosen to enable — not
ours. Review those providers' own privacy policies before enabling them, especially if you plan
to process sensitive or regulated documents.

## 3. Third-party network requests

The Desk-side multi-photo capture feature loads a small PDF-generation library (jsPDF) from a
public CDN (cdnjs.cloudflare.com) the first time it's used in a session. This is a one-time
script download — no document content or personal data is sent to that CDN.

No other third-party network calls are made by the app itself, beyond the LLM provider(s) you
explicitly configure.

## 4. No tracking or analytics

The app does not include any analytics, telemetry, or tracking code that reports usage back to
us or any third party. Session cookies are the standard Frappe authentication cookies needed to
keep you logged in — nothing beyond that.

## 5. Your responsibility as the site operator

Since you control the server this app runs on, you (or your organization) are the data
controller for any documents processed through it. This policy describes what the app itself
does; it doesn't replace your own organization's privacy policy or data handling obligations to
your users.

## 6. Changes to this policy

This policy may be updated by updating this file in the repository. Check the file's history on
GitHub for changes over time.

---

Questions? Open an issue on [GitHub](https://github.com/aravindsprint/doc_intelligence/issues).
