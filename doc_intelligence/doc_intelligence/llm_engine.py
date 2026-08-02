import frappe
import time
import json
import re


def _strip_json_fences(text):
    """Many LLMs (especially smaller/free-tier fallback models) wrap JSON
    output in markdown code fences even when explicitly told not to.
    Strips those before json.loads(), same fix already applied to the
    entity/transaction/invoice extraction parsing in api/__init__.py."""
    return re.sub(r"```json\s*|\s*```", "", text or "").strip()

PROVIDERS = [
    {"id": "groq",       "base_url": "https://api.groq.com/openai/v1",                          "default_model": "llama-3.3-70b-versatile",                   "key_field": "groq_api_key",       "model_field": "groq_model",       "openai_compat": True},
    {"id": "gemini",     "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",  "default_model": "gemini-2.0-flash",                          "key_field": "gemini_api_key",     "model_field": "gemini_model",     "openai_compat": True},
    {"id": "cerebras",   "base_url": "https://api.cerebras.ai/v1",                               "default_model": "llama3.1-70b",                              "key_field": "cerebras_api_key",   "model_field": "cerebras_model",   "openai_compat": True},
    {"id": "openrouter", "base_url": "https://openrouter.ai/api/v1",                             "default_model": "meta-llama/llama-3.3-70b-instruct:free",    "key_field": "openrouter_api_key", "model_field": "openrouter_model", "openai_compat": True},
    {"id": "mistral",    "base_url": "https://api.mistral.ai/v1",                                "default_model": "mistral-small-latest",                      "key_field": "mistral_api_key",    "model_field": "mistral_model",    "openai_compat": True},
    {"id": "deepseek",   "base_url": "https://api.deepseek.com/v1",                          "default_model": "deepseek-chat",                             "key_field": "deepseek_api_key",   "model_field": "deepseek_model",   "openai_compat": True},
    {"id": "claude",     "base_url": None,                                                        "default_model": "claude-haiku-4-5-20251001",                 "key_field": "claude_api_key",     "model_field": "claude_model",     "openai_compat": False},
    {"id": "openai",     "base_url": "https://api.openai.com/v1",                                "default_model": "gpt-4o-mini",                               "key_field": "openai_api_key",     "model_field": "openai_model",     "openai_compat": True},
]


class _RateLimitError(Exception):
    pass


class _ProviderError(Exception):
    pass


def _get_settings():
    return frappe.get_single("Doc Intelligence Settings")


def _get_provider_config(settings, tenant_name=None):
    # NOTE: tenant_name is accepted for call-signature compatibility but
    # unused — multi-tenant BYO-key routing was removed along with the
    # billing/tenant system.
    enabled = [p.strip() for p in (settings.enabled_providers or "groq,gemini,cerebras,openrouter,mistral,claude").split(",")]
    ordered = []
    for pid in enabled:
        p = next((x for x in PROVIDERS if x["id"] == pid), None)
        if not p:
            continue
        key = settings.get_password(p["key_field"]) if getattr(settings, p["key_field"], None) else None
        if key:
            ordered.append({**p, "_key": key})
    return ordered


def _log_provider_call(provider_id, success, tokens, error=None):
    try:
        frappe.get_doc({
            "doctype": "DI Provider Log",
            "provider": provider_id,
            "timestamp": frappe.utils.now_datetime(),
            "success": 1 if success else 0,
            "tokens": tokens,
            "error": str(error)[:140] if error else "",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception:
        pass


def _call_openai_compat(provider, prompt, system, max_tokens, settings):
    from openai import OpenAI, RateLimitError, APIStatusError
    key = provider.get("_override_key") or provider.get("_key") or settings.get_password(provider["key_field"])
    model = getattr(settings, provider["model_field"], None) or provider["default_model"]
    extra_headers = {}
    if provider["id"] == "openrouter":
        extra_headers = {"HTTP-Referer": "https://github.com/aravindsprint/doc_intelligence", "X-Title": "Doc Intelligence"}
    try:
        client = OpenAI(api_key=key, base_url=provider["base_url"], default_headers=extra_headers, timeout=90.0, max_retries=1)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        text = resp.choices[0].message.content
        tokens_in = getattr(resp.usage, "prompt_tokens", 0)
        tokens_out = getattr(resp.usage, "completion_tokens", 0)
        return {"text": text, "provider": provider["id"], "model": model, "tokens_in": tokens_in, "tokens_out": tokens_out}
    except RateLimitError as e:
        raise _RateLimitError(str(e))
    except APIStatusError as e:
        if e.status_code in (429, 502, 503):
            raise _RateLimitError(str(e))
        raise _ProviderError(str(e))
    except Exception as e:
        raise _ProviderError(str(e))


def _call_claude(provider, prompt, system, max_tokens, settings):
    import anthropic
    key = provider.get("_override_key") or provider.get("_key") or settings.get_password(provider["key_field"])
    model = getattr(settings, provider["model_field"], None) or provider["default_model"]
    try:
        client = anthropic.Anthropic(api_key=key, timeout=90.0, max_retries=1)
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text
        tokens_in = resp.usage.input_tokens
        tokens_out = resp.usage.output_tokens
        return {"text": text, "provider": "claude", "model": model, "tokens_in": tokens_in, "tokens_out": tokens_out}
    except anthropic.RateLimitError as e:
        raise _RateLimitError(str(e))
    except Exception as e:
        raise _ProviderError(str(e))


def llm_call(prompt, system="You are a helpful AI assistant.", max_tokens=2000, tenant_name=None, json_mode=False):
    settings = _get_settings()
    providers = _get_provider_config(settings, tenant_name)
    if not providers:
        frappe.throw("No LLM providers configured. Go to LLM Provider Settings and add at least one API key.")
    if json_mode:
        system = system + "\n\nYou MUST respond with valid JSON only. No preamble, no markdown, no backticks."
    tried = []
    fallback_used = False
    for i, p in enumerate(providers):
        try:
            if p["openai_compat"]:
                result = _call_openai_compat(p, prompt, system, max_tokens, settings)
            else:
                result = _call_claude(p, prompt, system, max_tokens, settings)
            _log_provider_call(p["id"], True, result.get("tokens_out", 0))
            result["fallback_used"] = i > 0
            result["attempts"] = i + 1
            return result
        except (_RateLimitError, _ProviderError) as e:
            _log_provider_call(p["id"], False, 0, e)
            tried.append(f"{p['id']} ({type(e).__name__})")
            fallback_used = True
            if isinstance(e, _RateLimitError):
                time.sleep(0.3)
            continue
    frappe.throw(f"All LLM providers exhausted. Tried: {', '.join(tried)}")


def analyse_document(raw_text, document_type, tenant_name=None, max_tokens=2000):
    prompt = f"""Analyse this document (category: {document_type}) and return a JSON object with these exact keys:
- "summary": string, 3-5 sentence summary of purpose, parties, and key points
- "entities": string, bullet list of key names/orgs/dates/amounts/clauses found
- "tables": array of objects, each with "headers" (array of strings) and "rows" (array of arrays). Empty array if no tables found.

Document text:
---
{raw_text[:12000]}
---"""
    system = "You are an expert document analyst. Extract structured information accurately."
    result = llm_call(prompt, system, max_tokens, tenant_name, json_mode=True)
    try:
        parsed = json.loads(_strip_json_fences(result["text"]))
    except Exception:
        parsed = {"summary": result["text"], "entities": "", "tables": []}
    parsed["_meta"] = result
    return parsed


def ask_question(raw_text, title, document_type, question, tenant_name=None, max_tokens=2000):
    prompt = f"""Document: "{title}" ({document_type})
---
{raw_text[:12000]}
---
Question: {question}

Answer the question based solely on the document content. If the information is not present, say so explicitly."""
    system = "You are a precise document Q&A assistant. Only use information from the provided document."
    result = llm_call(prompt, system, max_tokens, tenant_name)
    return {"answer": result["text"], "_meta": result}


def compare_documents(text_a, title_a, text_b, title_b, aspect=None, tenant_name=None, max_tokens=2000):
    aspect_str = f" Focus specifically on: {aspect}." if aspect else ""
    prompt = f"""Compare these two documents and return a JSON object with keys:
- "summary": string, 2-3 sentence overall comparison
- "similarities": array of strings
- "differences": array of objects with keys "aspect", "doc_a", "doc_b"
- "recommendation": string

Document A: "{title_a}"
---
{text_a[:6000]}
---

Document B: "{title_b}"
---
{text_b[:6000]}
---
{aspect_str}"""
    system = "You are an expert document comparison analyst."
    result = llm_call(prompt, system, max_tokens, tenant_name, json_mode=True)
    try:
        parsed = json.loads(_strip_json_fences(result["text"]))
    except Exception:
        parsed = {"summary": result["text"], "similarities": [], "differences": [], "recommendation": ""}
    parsed["_meta"] = result
    return parsed


def get_provider_health():
    data = frappe.db.sql("""
        SELECT provider,
               COUNT(*) as total,
               SUM(success) as successes,
               SUM(tokens) as total_tokens,
               MAX(timestamp) as last_call
        FROM `tabDI Provider Log`
        WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY provider
    """, as_dict=True)
    for row in data:
        row["success_rate"] = round(row["successes"] / row["total"] * 100, 1) if row["total"] else 0
    return data
# =====================================================================
# VISION / IMAGE OCR  —  append to:
#   apps/doc_intelligence/doc_intelligence/doc_intelligence/llm_engine.py
#
# Adds vision_extract_text(image_path): sends an image to a
# vision-capable provider (Gemini via OpenAI-compat, or Claude) and
# returns the transcribed text. Reuses the same settings + provider
# ordering + fallback approach as llm_call.
# =====================================================================

import base64
import os

# Providers in PROVIDERS that can actually read images.
_VISION_PROVIDER_IDS = {"gemini", "claude", "openrouter"}

_VISION_SYSTEM = (
    "You are an OCR and document-transcription engine. Transcribe ALL text "
    "visible in the image faithfully. Preserve line items, tables (as rows of "
    "values), numbers, dates, names, and totals exactly as shown. Output only "
    "the transcribed text — no commentary."
)

_VISION_PROMPT = (
    "Transcribe every piece of text in this document image. "
    "Keep tables readable as rows. Do not summarise; output the raw text."
)


def _mime_for(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")


def _vision_call_openai_compat(provider, image_b64, mime, max_tokens, settings):
    """Gemini / OpenRouter vision via OpenAI-compatible image_url content."""
    from openai import OpenAI, RateLimitError, APIStatusError
    key = provider.get("_override_key") or provider.get("_key") or settings.get_password(provider["key_field"])
    model = getattr(settings, provider["model_field"], None) or provider["default_model"]
    extra_headers = {}
    if provider["id"] == "openrouter":
        extra_headers = {"HTTP-Referer": "https://github.com/aravindsprint/doc_intelligence", "X-Title": "Doc Intelligence"}
    try:
        client = OpenAI(api_key=key, base_url=provider["base_url"], default_headers=extra_headers, timeout=90.0, max_retries=1)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _VISION_SYSTEM},
                {"role": "user", "content": [
                    {"type": "text", "text": _VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                ]},
            ],
            max_tokens=max_tokens,
        )
        text = resp.choices[0].message.content
        return {"text": text, "provider": provider["id"], "model": model,
                "tokens_in": getattr(resp.usage, "prompt_tokens", 0),
                "tokens_out": getattr(resp.usage, "completion_tokens", 0)}
    except RateLimitError as e:
        raise _RateLimitError(str(e))
    except APIStatusError as e:
        if e.status_code in (429, 502, 503):
            raise _RateLimitError(str(e))
        raise _ProviderError(str(e))
    except Exception as e:
        raise _ProviderError(str(e))


def _vision_call_claude(provider, image_b64, mime, max_tokens, settings):
    import anthropic
    key = provider.get("_override_key") or provider.get("_key") or settings.get_password(provider["key_field"])
    model = getattr(settings, provider["model_field"], None) or provider["default_model"]
    try:
        client = anthropic.Anthropic(api_key=key, timeout=90.0, max_retries=1)
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=_VISION_SYSTEM,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": _VISION_PROMPT},
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": image_b64}},
            ]}],
        )
        text = resp.content[0].text
        return {"text": text, "provider": "claude", "model": model,
                "tokens_in": resp.usage.input_tokens, "tokens_out": resp.usage.output_tokens}
    except anthropic.RateLimitError as e:
        raise _RateLimitError(str(e))
    except Exception as e:
        raise _ProviderError(str(e))


def vision_extract_text(image_path, tenant_name=None, max_tokens=4000):
    """OCR an image to text using the first available vision-capable provider."""
    settings = _get_settings()
    all_providers = _get_provider_config(settings, tenant_name)
    providers = [p for p in all_providers if p["id"] in _VISION_PROVIDER_IDS]
    if not providers:
        frappe.throw(
            "No vision-capable LLM provider configured. Add a Gemini or Claude "
            "API key in Doc Intelligence Settings to process images."
        )

    # nosemgrep: frappe-security-file-traversal -- image_path is not raw
    # user input; it's constructed by extract_text() via os.path.basename()
    # joined against the site's own private/public files directory, which
    # already strips any path-traversal components before this is called.
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")
    mime = _mime_for(image_path)

    tried = []
    for i, p in enumerate(providers):
        # up to 3 attempts per provider on rate-limit, with backoff
        for attempt in range(3):
            try:
                if p["id"] == "gemini":
                    result = _vision_call_gemini_native(p, image_b64, mime, max_tokens, settings)
                elif p["openai_compat"]:
                    result = _vision_call_openai_compat(p, image_b64, mime, max_tokens, settings)
                else:
                    result = _vision_call_claude(p, image_b64, mime, max_tokens, settings)
                _log_provider_call(p["id"], True, result.get("tokens_out", 0))
                return result.get("text", "")
            except _RateLimitError as e:
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))  # 2s, then 4s
                    continue
                _log_provider_call(p["id"], False, 0, e)
                tried.append(f"{p['id']} (RateLimit after retries)")
                break
            except _ProviderError as e:
                _log_provider_call(p["id"], False, 0, e)
                tried.append(f"{p['id']} ({type(e).__name__})")
                break
    frappe.throw(f"All vision providers exhausted. Tried: {', '.join(tried)}. "
                 f"If this is a Gemini free-tier quota limit, wait a minute and retry, "
                 f"or add a Claude API key as a backup vision provider.")


def _vision_call_gemini_native(provider, image_b64, mime, max_tokens, settings):
    """Gemini vision via native generateContent endpoint (works with AQ.* keys)."""
    import requests
    key = provider.get("_override_key") or provider.get("_key") or settings.get_password(provider["key_field"])
    model = getattr(settings, provider["model_field"], None) or provider["default_model"]
    model = model.replace("models/", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{
            "parts": [
                {"text": _VISION_SYSTEM + "\n\n" + _VISION_PROMPT},
                {"inline_data": {"mime_type": mime, "data": image_b64}},
            ]
        }],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    try:
        r = requests.post(url, headers={"x-goog-api-key": key}, json=payload, timeout=120)
        if r.status_code in (429, 502, 503):
            raise _RateLimitError(r.text[:200])
        if r.status_code != 200:
            raise _ProviderError(f"{r.status_code}: {r.text[:200]}")
        data = r.json()
        cand = (data.get("candidates") or [{}])[0]
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata", {})
        return {"text": text, "provider": "gemini", "model": model,
                "tokens_in": usage.get("promptTokenCount", 0),
                "tokens_out": usage.get("candidatesTokenCount", 0)}
    except (_RateLimitError, _ProviderError):
        raise
    except Exception as e:
        raise _ProviderError(str(e))

