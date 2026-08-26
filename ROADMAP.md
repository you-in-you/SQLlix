# SQLi Workbench — Project Roadmap & Map

> **Convention for agents / future edits**
> 1. Read this file **first** before any feature work.
> 2. After shipping a feature or refactor, **update this file** in the same change.
> 3. Styles live in `css/styles.css`. Markup + JS still in `index.html` until JS is split.
> 4. Prefer search (`grep`) by section markers / function names listed below.

Last updated: 2026-08-25 (CSS extracted)

---

## 1. Stack & layout

| Layer | Tech | Notes |
|--------|------|--------|
| Frontend | Vanilla HTML / CSS / JS | Dark hacker theme; CSS external |
| Backend proxy | **Flask** + `requests` + BeautifulSoup | CORS proxy, timing, `<base>` injection |
| Persistence | `localStorage` | Headers, filter rules, cookie meta, Night Protect |

### Current files

```
artifacts/
├── index.html          # Markup + JS (inline <script>) — styles linked out
├── css/
│   └── styles.css      # All workbench styles (~3.3k lines)
├── app.py              # Flask CORS proxy `/api/send-payload`
├── requirements.txt    # flask, flask-cors, requests, beautifulsoup4
├── ROADMAP.md          # This map (keep in sync)
└── static/             # Mirror for static serve — keep in sync
    ├── index.html
    └── css/styles.css
```

**Split progress**

| Piece | Status | Path |
|-------|--------|------|
| CSS | **Done** | `css/styles.css` |
| JS | Todo | planned `js/app.js` (later submodules) |
| HTML only | Partial | `index.html` still holds JS |

**Planned next:**

```
index.html
css/styles.css
js/app.js
app.py
requirements.txt
ROADMAP.md
```

---

## 2. UI regions (frontend)

All in **`index.html`** today.

### 2.1 Top bar — target & send
- Method select (`GET` / `POST` / …)
- URL input + hover preview (`$1` resolution)
- **Send Request** (loading state)
- Nav tools: History, Payload, Cheat, Settings, Night Protect, Record, …

### 2.2 Payload Workbench (`#payloadWorkbench`)
- Payload textarea (lines → `$1`, `$2`, …; `{1..N}` batch)
- Attack config: threads, delay, timeout, stop-on
- URL Encode / Decode / Clear / Inject into Target
- **Headers** shortcut → Settings → Headers tab
- **Request Body** (POST/PUT/PATCH):
  - Auto **Content-Type detection** (JSON / form / XML / text / multipart)
  - Selector: Auto | manual types | Custom
  - Badge shows detected type; conflict badge if Settings CT differs
  - Insert `$1`, inject payload into body, clear body

### 2.3 Request History (`#historyPanel`)
- Search, sort (time / order / status / size / RTT / redirect)
- Filter chips: All, Starred, Attacks, Single, 2xx–5xx, ERR + **saved advanced rules**
- **Advanced filter** modal: status, body size (bytes), RTT (ms), URL/body/req regex, method, note, star, saved rules, match preview overlay
- Attacks flow: multi-select attack picker → grouped collapsible history by batch
- Per item: method, name, status, RTT, size, pin, delete, note, redirect badge
- **Neon Set-Cookie badge** → closes history, opens Headers & Metadata + import panel
- Restore Attack Source bar when filtering a batch

### 2.4 Response inspector
- Tabs: **Rendered** (iframe + `<base>` / fixed_html), **Raw**, **Headers & Metadata**
- Metadata table with categorized headers
- **Set-Cookie import panel** (default **closed**):
  - Open by clicking Set-Cookie row or history neon badge
  - Multi-select cookies → merge into request `Cookie` header → open Settings Headers
  - Close (×)

### 2.5 Settings (`#settingsPanel`)
- **Headers**: add/edit/remove, suggest list, **Pin** (survive refresh via `localStorage`)
- **Cookie header → Manage**: virtual overlay — per-cookie active / pin / note / save
- Appearance, Night Protect (off / soft / strict), Shortcuts, General

### 2.6 Other panels
- SQLi Cheat Sheet (drawer)
- Endpoint discovery / Record navigation
- Expand modal for rendered view
- Attack meta prompt (name + note)

---

## 3. Backend (`app.py`)

| Endpoint | Role |
|----------|------|
| `POST /api/send-payload` | Proxy request; `response_time_ms`; `verify=False`; return `status_code`, `headers`, `raw_body`, `fixed_html` (BeautifulSoup + `<base href>`) |

CORS via `flask-cors`. Frontend calls `http://127.0.0.1:5000` when not already on port 5000.

---

## 4. Important JS concepts (search keys)

| Concern | Search / symbols |
|---------|------------------|
| Global state | `const state = {` |
| History render | `function renderHistory` |
| Advanced filters | `matchesAdvancedRule`, `renderHfChips`, `openAdvFilter` |
| Attack batch | `runAttack`, `attackSources`, `openAttackPicker` |
| Headers UI | `renderHeaders`, `savePersistedHeaders`, `HEADERS_LS_KEY` |
| Cookie import | `getSetCookiesFromHeaders`, `splitJoinedSetCookies`, `openCookieImportPanel` |
| Cookie manager | `openCookieManager`, `COOKIE_META_KEY` |
| Body Content-Type | `detectBodyContentType`, `buildRequestHeaders`, `updateBodyCtUI` |
| Send | `sendRequest`, `executeOneRequest` |
| Night Protect | `setNightProtectMode`, `applyNightProtect` |
| Panels | `openVPanel`, `closeVPanel`, `VPANEL_MAP` |

---

## 5. localStorage keys

| Key | Data |
|-----|------|
| `sqli-workbench-headers` | Pinned request headers |
| `sqli-workbench-cookie-meta` | Per-cookie active / persist / note |
| `sqli-workbench-nightprotect` | NP mode + dim settings |
| (hf rules) | Advanced filter rules — see `saveHfRules` / load in JS |

---

## 6. Feature status (high level)

| Area | Status |
|------|--------|
| Manual request + proxy | Done |
| History + sort/filter chips | Done |
| Advanced multi-rule filters | Done |
| Batch attack mode | Done |
| Attack multi-select + grouping | Done |
| Rendered view + base href | Done |
| Header pin + Cookie manager | Done |
| Set-Cookie parse (multi) + import UI | Done |
| Body CT auto-detect | Done |
| Night Protect | Done |
| Cheat sheet | Done |
| Split CSS out of index | **Done** (`css/styles.css`) |
| Split JS out of index | **Todo** |
| Real E2E tests | Todo |
| Export/import session | Todo (nice-to-have) |

---

## 7. Known constraints / tips

- Do **not** put `position: relative` on `#historyPanel` itself — it must stay `position: fixed` (drawer). Relative only on inner `.vpanel-body` for overlays.
- Set-Cookie values may arrive **comma-joined**; always use `splitJoinedSetCookies` before parse.
- Body size filters use **bytes**; RTT uses **ms**.
- After UI changes, sync `static/index.html` if that copy is used for serving.
- Prefer small, section-scoped edits; update this ROADMAP when behavior or file layout changes.

---

## 8. Changelog (recent)

- **2026-08-25** — Extracted all UI CSS from `index.html` → `css/styles.css` (link in `<head>`). Static mirror updated.
- **2026-08-25** — Cookie neon badge; Set-Cookie import (closed by default); Cookie manager in Settings; fixed multi Set-Cookie split; body Content-Type auto-detect UI; history closes on cookie-badge click.
- **2026-08-25** — Header pin; payload Headers button; advanced filter UX; attack picker + grouped history.
- **Earlier** — Flask proxy, history, attack mode, Night Protect, advanced filters core.

---

*When splitting the project, move section ownership into this table’s “File” column and keep features listed under the same headings.*
