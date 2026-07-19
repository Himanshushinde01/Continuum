# ContextBridge 🌉

**Carry your AI conversation context across Claude, ChatGPT, and Gemini — free, local, no account.**

> Built for students on free-tier AI tools who hit daily message limits mid-task. One click captures your conversation, compresses it intelligently, and injects it into a new chat on a different platform. No tokens wasted re-explaining context.

---

## ✨ Features

- **📸 One-click capture** — extracts your conversation from Claude, ChatGPT, or Gemini
- **⚡ Smart compression** — rule-based pipeline removes boilerplate, collapses old code blocks, preserves recent turns verbatim
- **📊 Token savings** — shows original vs. compressed token count before you inject
- **🚀 One-click inject** — fills the input box on any supported platform (you press Send)
- **🔒 100% local** — no servers, no accounts, no data ever leaves your browser
- **🆓 Completely free** — no subscriptions, no paywalls, no limits

### Supported Platforms
| Platform | Capture | Inject |
|----------|---------|--------|
| Claude (claude.ai) | ✅ | ✅ |
| ChatGPT (chatgpt.com) | ✅ | ✅ |
| Gemini (gemini.google.com) | ✅ | ✅ |

---

## 🚀 Installation

### Method 1 — Chrome / Brave / Arc (Developer Mode, Free)

> **No store required.** Takes 30 seconds.

1. **[Download the latest release ZIP](https://github.com/Himanshushinde01/Continuum/releases/latest)**
   - Download `contextbridge-extension.zip`

2. **Extract the ZIP**
   - Right-click → Extract All → remember the folder location

3. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`

4. **Enable Developer Mode**
   - Toggle **"Developer mode"** in the top-right corner → ON

5. **Load the Extension**
   - Click **"Load unpacked"**
   - Select the **extracted folder** (not the ZIP)

6. **Pin it** 🌉
   - Click the puzzle piece icon in Chrome toolbar → Pin ContextBridge

> **Note:** Chrome may show a "Disable developer mode extensions" notification when it starts. Click "Cancel" to keep the extension running. This is normal for extensions not on the Chrome Web Store.

---

### Method 2 — Microsoft Edge (Edge Add-ons Store)

Install directly from the Edge Add-ons store — no developer mode needed:

👉 **[Install from Edge Add-ons Store](https://microsoftedge.microsoft.com/addons/)** *(link updated once published)*

---

## 🎯 How to Use

### Capture a conversation
1. Open **Claude, ChatGPT, or Gemini** and have a conversation
2. Click the **🌉 ContextBridge** icon in your toolbar
3. Click **"📸 Capture This Chat"**
4. Wait for the ✓ confirmation — your conversation is saved locally

### Inject context into a new chat
1. Open a **new chat** on Claude, ChatGPT, or Gemini (any platform)
2. Click the **🌉 ContextBridge** icon
3. Select your saved capture from the list
4. Review the compressed preview + token savings
5. Click **"🚀 Inject into Current Chat"**
6. The context fills the input box — **you press Send**

---

## 🔧 Build from Source

```bash
# Clone the repo
git clone https://github.com/Himanshushinde01/Continuum.git
cd Continuum

# Install dependencies
npm install

# Generate icons
npm run generate-icons

# Build the extension
npm run build

# Run tests
npm test

# Package as ZIP for store upload
npm run package
```

The built extension is in `dist/`. Load it as unpacked from that folder.

---

## 🏗️ Architecture

```
Content Scripts (claude.ai / chatgpt.com / gemini.google.com)
    ↓ extracted conversation (NormalizedConversation)
Compression Engine (rule-based, no LLM)
    ↓ boilerplate strip → code collapse → extractive summarize → keep recent
Markdown Builder
    ↓ context.md with frontmatter (source, tokens, turns)
chrome.storage.local
    ↓
Popup UI (React)
    ↓ inject command
Injector (fills input box, dispatches React-compatible events)
```

**Adding a 4th platform** = 1 new extractor file + 1 new injector file. Nothing else changes.

### Key design decisions
- **No backend** — all processing happens in your browser. Privacy by architecture.
- **Result\<T, E\>** type for all I/O — no silent failures, every error has a code, module, and human-readable message
- **Typed message bus** — no raw `chrome.runtime.sendMessage` calls; all cross-context communication goes through a typed wrapper
- **Base extractor pattern** — shared DOM-wait/retry logic in one place; each platform only implements its specific selectors

---

## 📁 Project Structure

```
src/
├── background/service-worker.ts     # message routing only, no business logic
├── content-scripts/
│   ├── content-entry.ts             # detects platform, wires extractor + injector
│   ├── platform-detector.ts         # URL → platform
│   ├── extractors/                  # base + claude + chatgpt + gemini
│   └── injectors/                   # base + claude + chatgpt + gemini
├── core/
│   ├── models/                      # NormalizedConversation, Capture types
│   ├── compression/                 # 4-strategy pipeline + token estimator
│   └── markdown/context-md-builder  # Capture → context.md
├── storage/                         # chrome.storage.local wrapper + CRUD
├── popup/                           # React popup UI
└── shared/                          # errors, logger, message-bus, constants
tests/
├── fixtures/                        # saved HTML from each platform for tests
└── unit/                            # extractor, compression, storage tests
```

---

## 🔒 Privacy

- **Zero network requests** — no data ever leaves your device
- **No accounts** — no sign-in, no email, nothing
- **No telemetry** — no analytics, no crash reporting, no usage tracking
- **Local storage only** — `chrome.storage.local`; uninstalling removes everything
- **Read-only on AI sites** — only reads DOM when you explicitly click Capture; never passively monitors

[Full Privacy Policy](docs/privacy-policy.html)

---

## 🗺️ Roadmap

| Version | Features |
|---------|----------|
| v1 (current) | Claude + ChatGPT + Gemini, rule-based compression, local storage, inject |
| v2 | Local LLM compression (WebGPU, no API key), Perplexity/DeepSeek support |
| v3 | Optional cross-device sync via user's own Google Drive |

---

## 🤝 Contributing

Issues and PRs welcome. If a platform's DOM changed and extraction broke, open an issue with the platform name and what changed — fixing it is usually just updating selectors in one file.

---

## 📄 License

MIT — free to use, modify, and distribute.
