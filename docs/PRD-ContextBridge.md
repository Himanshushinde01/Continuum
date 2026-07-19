# PRD: Continuum — Platform-Agnostic AI Chat Memory

**Author:** Himanshu
**Status:** Draft v1 — living document
**Last updated:** July 18, 2026

---

## 1. Problem Statement

Students who can't afford paid AI subscriptions rely on free tiers of Claude, ChatGPT, Gemini, and similar tools. Free tiers cap message/token usage per session or per day. When a student hits the cap mid-task, they're forced to switch platforms or start a new chat — and lose all accumulated context. They then have to manually re-explain their problem, re-paste code, re-describe what's already been tried. This wastes time, wastes tokens re-explaining, and makes free-tier AI meaningfully worse than it needs to be for exactly the users who can least afford the inefficiency.

**Core insight:** the conversation itself is a reusable asset. If it's captured once, compressed intelligently, and portable, a student can resume the same task on a different platform without paying the "re-explanation tax."

## 2. Goals

- Let a user capture the state of an AI conversation (any supported platform) into a portable, human-readable file.
- Let a user inject that captured context into a *new* conversation on a *different* platform, with minimal token overhead.
- Do this without a backend, without accounts, and without cost — the target user cannot pay for API keys or subscriptions either.
- Ship something real: a working Chrome extension, published, with a GitHub repo — usable as a portfolio/resume artifact.

## 3. Non-Goals (for v1)

- Not building a universal AI memory/personalization layer (that's a much bigger, VC-funded category — see competitive landscape below).
- Not proxying or automating actual message-sending via APIs (no API keys from the user, no ToS-violating automation of accounts).
- Not doing real-time bidirectional sync across open tabs.
- Not building a mobile app.

## 4. Target Users

Primary: students and self-learners (India-first, but not India-only) doing coursework, projects, or interview prep on free-tier AI chat, who routinely hit usage caps and juggle 2+ AI tools.

Secondary (useful for framing, not primary focus): anyone who wants a lightweight, local-first way to carry context between AI tools without paying for a "memory" SaaS product.

## 5. Competitive Landscape (reality check)

This space is **not empty** — worth knowing before you build, so your differentiation is deliberate rather than accidental.

- **ContextSwitchAI**, **Context Bridge**, **AI Chat Exporter**, and several similar Chrome extensions already do "export conversation → inject into a new platform," some with claimed token-compression ("up to 70% smaller") and auto-injection into the new chat's input box.
- A larger tier of **export-only** tools (Claude Exporter, Gemini Chat Exporter, "AI Exporter") just save chats to PDF/Markdown/Notion — no cross-platform injection, no compression.
- A separate, more ambitious tier of **"AI memory" extensions** tries to extract durable facts/preferences and auto-inject them into every new chat, positioning against ChatGPT Memory/Claude Memory natively.

**What this means for you:** the "capture + carry context across platforms" idea is validated (people are already paying $5–9/month for versions of it), but the free, transparent, student-first, locally-processed angle is underserved — most existing tools are freemium with paywalled limits (3 exports/day, 10–12 exports before upsell, etc.), which is exactly the pain your target user already has with the AI tools themselves. That's your wedge, not a redesign of the whole concept.

**Recommended differentiation for ContextBridge:**
1. **Free tier that's actually usable**, not a 3-exports-a-day teaser — because your users are already free-tier-squeezed.
2. **100% local processing, no account, no cloud** — a real, verifiable privacy story (open-source, auditable), not a policy-page claim.
3. **Compression tuned for token cost, not just file size** — explicitly optimizing "how few tokens does this cost to re-establish context," shown to the user as a number before they paste it in.
4. **Built and framed for students** — onboarding, examples, and docs speak to "you're out of free messages," not "enterprise professionals switching between specialized models."
5. Ship it as **open source** — this matters more for your resume goal than for the product; it's also a credible trust signal for a privacy-sensitive tool with no company behind it.

## 6. Core User Flow (MVP)

1. User is mid-conversation on claude.ai (or ChatGPT/Gemini) and hits a rate limit, or just wants to switch tools.
2. Clicks the ContextBridge extension icon → "Capture this chat."
3. Extension reads the conversation from the page DOM, structures it, and generates a compressed `context.md` (or `.json`) — shown in a preview panel with an estimated token count.
4. User reviews/edits the summary if they want, then clicks "Save" (stored locally in `chrome.storage` / IndexedDB) or "Copy."
5. User opens a new chat on a different platform (say ChatGPT).
6. Clicks the extension icon → "Inject context" → picks the saved capture → the extension pastes a formatted context block into the input box (auto-fills, user hits send — **no auto-submit on the user's behalf**, to respect ToS/automation boundaries and keep the user in control).
7. New AI reads the context block as the first message and picks up where the last one left off.

## 7. Feature Set

### MVP (v1) — the resume-worthy, shippable core
- Content scripts for **Claude.ai, ChatGPT, and Gemini** (3 platforms only — resist scope creep) that extract conversation turns from the DOM.
- A **rule-based compression pipeline** (no LLM call required, so it's free and works offline):
  - Strip boilerplate/UI chrome, retry/error turns, duplicate content.
  - Collapse long code blocks to file/function-level summaries with an option to keep full code verbatim if the user flags it as important.
  - Keep the *last N turns* verbatim (recent context matters most) and summarize earlier turns extractively (keep key sentences, not compress with an LLM).
  - Output a structured Markdown file: `## Goal`, `## Key Decisions`, `## Current State`, `## Code/Artifacts`, `## Recent Turns`.
- Local storage of captures (chrome.storage.local / IndexedDB), a simple popup UI to list/rename/delete captures.
- One-click "inject into current page" that fills the active platform's input box.
- Token-count estimate shown pre- and post-compression, so the value is visible.
- No accounts, no network calls, no telemetry by default.

### v2 — differentiation layer
- Optional **local LLM summarization** using a small in-browser model (e.g., via `transformers.js` / WebGPU) for users who want smarter compression than rule-based extraction — still free, still local, no API key needed. This is the feature that would most impress a technical reviewer, and it directly avoids the chicken-and-egg problem of "using AI tokens to compress AI tokens."
- Support for Perplexity, DeepSeek, and other free-tier tools.
- A simple "usage tracker" — warn the user before they hit a platform's free-tier cap (heuristic-based, since caps aren't exposed via API).
- Cross-device sync via an optional, user-provided storage backend (e.g., their own Google Drive) — still no ContextBridge-owned server.

### Explicitly out of scope (v1 and v2)
- Auto-sending messages on the user's behalf.
- Reading/scraping data the user hasn't actively asked to capture.
- Any server that stores user conversations.

## 8. System Architecture

```
┌─────────────────────────────┐
│   Content Scripts (x3)      │  ← platform-specific DOM extractors
│   claude.js / chatgpt.js /  │     (each returns a normalized
│   gemini.js                 │      internal conversation object)
└──────────────┬───────────────┘
               │ normalized JSON
┌──────────────▼───────────────┐
│   Compression Engine          │  ← pure JS, rule-based (v1)
│   (shared, platform-agnostic) │     or WebLLM-based (v2)
└──────────────┬───────────────┘
               │ context.md + token estimate
┌──────────────▼───────────────┐
│   Storage Layer               │  ← chrome.storage.local / IndexedDB
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│   Popup UI (React)            │  ← list captures, preview, edit, inject
└──────────────┬───────────────┘
               │ injection command
┌──────────────▼───────────────┐
│   Injector content script     │  ← fills target platform's input box
└───────────────────────────────┘
```

Key architectural decision: **the extractor and injector are platform-specific and swappable; everything else is platform-agnostic.** This is the part of the system worth designing carefully — it's also the part that best demonstrates "architecture, modularity, systems thinking" for your resume positioning, since each new platform is a new adapter implementing a shared interface (`extract() -> NormalizedConversation`, `inject(text) -> void`), not a rewrite.

## 9. Data Model — `context.md`

```markdown
---
source_platform: claude
captured_at: 2026-07-18T10:32:00Z
turn_count: 24
original_tokens_est: 8400
compressed_tokens_est: 1150
---

## Goal
[1-2 sentence extracted/user-edited summary of what the user is trying to do]

## Key Decisions
- [bullet per significant decision/constraint established in the chat]

## Current State
[what's been tried, what's working, what's not — extractive summary]

## Code / Artifacts
```lang
[verbatim code blocks the user flagged as important, or the most recent version of each file discussed]
```

## Recent Turns (verbatim)
**User:** ...
**Assistant:** ...
[last N turns, full fidelity]
```

This format is deliberately human-readable (not just JSON) — a student should be able to open it and understand it, and it's also naturally close to how you'd want it to read when pasted as a first message to a new AI.

## 10. Platform Extraction Notes

- DOM structure on each platform will change without notice — this is the single biggest maintenance risk. Mitigate with: extraction logic isolated per platform (per architecture above), a small test suite that runs extraction against saved HTML fixtures so breakage is caught in CI rather than by users, and a fallback path (manual "select the conversation text" mode) if DOM extraction fails.
- Each platform's ToS should be checked before relying on DOM scraping; this is read-only extraction of the user's *own* conversation, not automation of the platform's write actions, which is a materially different (and generally more defensible) category, but you should still link each platform's relevant terms in your README and let users judge for themselves. Don't present this as legally guaranteed-safe.

## 11. Privacy & Security

- No conversation content ever leaves the user's browser in v1 — no server, so no data-breach surface at all. This is a genuine differentiator versus tools that store exports "for your convenience."
- All storage is local (`chrome.storage.local`); clearing extension data or uninstalling removes everything.
- Minimal permissions — request DOM access only for the specific supported domains, not `<all_urls>`.
- If v2 adds optional cloud sync, make it explicitly opt-in with the data going to *the user's own* storage (their Drive), not yours.

## 12. Success Metrics

Since this is a portfolio project first and a product second, define success accordingly:
- **Shipped:** live on the Chrome Web Store, public GitHub repo with README, architecture diagram, and tests.
- **Working:** demonstrable end-to-end flow (capture on Claude → inject into ChatGPT) in a recorded demo video for your resume/portfolio link.
- **Adopted (stretch):** organic installs/stars — nice signal, not required for the resume story.
- **Technical depth demonstrated:** the extractor/compressor/injector separation, a test suite, and (if you build it) the v2 local-LLM compression are the pieces that read as "systems engineering" rather than "script that scrapes a page."

## 13. Roadmap

| Phase | Scope | Target |
|---|---|---|
| 0 | Repo scaffold, manifest v3 setup, one working extractor (Claude only), manual copy-paste flow | Week 1 |
| 1 (MVP) | 3 platforms, compression engine, popup UI, local storage, one-click inject | Weeks 2–4 |
| 2 | Test suite against DOM fixtures, polish UI, write README + demo video, publish to Chrome Web Store | Week 5 |
| 3 (stretch) | Local LLM compression (v2), usage-cap warnings, 1–2 more platforms | Ongoing |

## 14. Tech Stack Recommendation

- **Manifest V3** Chrome extension, TypeScript throughout (stronger resume signal than plain JS, and this codebase benefits from typed interfaces at the extractor/injector boundary).
- **React** for the popup UI (small, no need for anything heavier).
- **Vitest/Jest** for the compression engine and extractor unit tests (fixture-based, as noted above).
- No backend, no database beyond browser storage, no external API dependency for v1 — this is a feature, not a limitation: it's what makes the tool free and privacy-safe, and it's a decision worth explaining explicitly in the README/resume bullet ("designed as fully local/offline by constraint, not by accident").

## 15. Open Questions

- Exact list of "3 platforms" for MVP — confirm Claude + ChatGPT + Gemini, or swap one for Perplexity/DeepSeek based on what your target users actually use most.
- How much manual editing to expose in the capture-preview step vs. keeping it one-click — more control is more useful but adds UI surface area.
- Whether to open-source from day one (recommended) or keep private until MVP is polished.
