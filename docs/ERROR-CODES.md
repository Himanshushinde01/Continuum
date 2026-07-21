# Continuum — Error Codes Registry

Every error code used anywhere in the codebase is registered here with a one-line description.
No error code may be used without an entry in this table.

| Code | Class | Module | Description |
|------|-------|--------|-------------|
| `EXTRACTION_NO_TURNS_FOUND` | `ExtractionError` | `*-extractor` | Page DOM has no conversation turn elements — page may still be loading |
| `EXTRACTION_ALL_TURNS_UNPARSEABLE` | `ExtractionError` | `*-extractor` | Turn elements found but none parsed to valid Turn objects |
| `EXTRACTION_CONTAINER_NOT_FOUND` | `ExtractionError` | `*-extractor` | Conversation container element not found — platform DOM may have changed |
| `EXTRACTION_UNEXPECTED` | `ExtractionError` | `*-extractor` | Non-ExtractionError thrown during extraction — programmer error or unexpected DOM state |
| `COMPRESSION_STRATEGY_FAILED` | `CompressionError` | `compressor` | A compression strategy threw unexpectedly during `apply()` |
| `MARKDOWN_EMPTY_CONVERSATION` | `ValidationError` | `context-md-builder` | Attempted to build context.md from a conversation with zero turns |
| `MARKDOWN_PARSE_FAILED` | `ValidationError` | `context-md-builder` | Could not parse a context.md string back into a Capture |
| `STORAGE_GET_FAILED` | `StorageError` | `storage-service` | `chrome.storage.local.get()` threw — quota exceeded, corrupted storage, or API unavailable |
| `STORAGE_SET_FAILED` | `StorageError` | `storage-service` | `chrome.storage.local.set()` threw — usually quota exceeded |
| `STORAGE_REMOVE_FAILED` | `StorageError` | `storage-service` | `chrome.storage.local.remove()` threw |
| `STORAGE_BYTES_CHECK_FAILED` | `StorageError` | `storage-service` | `chrome.storage.local.getBytesInUse()` threw |
| `STORAGE_CAPTURE_NOT_FOUND` | `StorageError` | `capture-repository` | `get(id)` called with an id not present in storage |
| `INJECTION_INPUT_NOT_FOUND` | `InjectionError` | `*-injector` | Input box element not found — platform DOM may have changed |
| `INJECTION_UNEXPECTED` | `InjectionError` | `*-injector` | Non-InjectionError thrown during inject — programmer error |
| `MESSAGE_SEND_FAILED` | `MessageError` | `message-bus` | `chrome.runtime.sendMessage()` threw — extension context invalidated or background not running |
| `MESSAGE_SEND_TO_TAB_FAILED` | `MessageError` | `message-bus` | `chrome.tabs.sendMessage()` threw — tab closed, content script not ready |
