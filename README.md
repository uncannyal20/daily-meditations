# Daily Devotion & Mental Prayer Web App

A lightweight, distraction-free Single-Page Web Application (SPA) designed for daily Catholic mental prayer and spiritual reading (15–20 minutes).

The application structures prayer into the traditional three phases (Preparation, Mental Prayer / Contemplation, and Concluding Prayers / Resolution) using readings from three spiritual classics.

---

## 📖 Spiritual Classics Library

1. **My Daily Bread** — *Fr. Anthony J. Paone, S.J.*
   - 196 structured daily meditations (*Book One: Purification*, *Book Two: Imitation*, *Book Three: Union*).
   - Structured into **Christ Speaks**, **Think/Reflect**, and **Colloquy/Prayer**.
2. **The Imitation of Christ** — *Thomas à Kempis*
   - 114 chapters across 4 books on humility, detachment, inner consolation, and Holy Communion (Modern Translation).
3. **The Joy of Knowing Christ** — *Pope Benedict XVI*
   - 55 contemplative meditations on Gospel passages.

Total: **365 daily meditation units** parsed and indexed.

---

## ✠ Core Features

- **Daily Devotional Flow**:
  - **Phase 1 (Preparation)**: Act of Faith in God's presence, *Veni Sancte Spiritus*, and St. Ignatius / St. Alphonsus oblation with a silent centering pause.
  - **Phase 2 (Meditation)**: Liturgical parchment reading view, scripture references, customizable countdown timer (5–30 min), +5m extension, Zen mode (distraction-free fullscreen), font size controls, and bookmarking.
  - **Phase 3 (Thanksgiving & Resolution)**: Act of Thanksgiving, daily practical resolution journal (saved locally), *Anima Christi*, and traditional concluding prayers.
  - **Phase 4 (Session Summary)**: "Deo Gratias" completion screen with minutes prayed, saved resolution, and streak tracking.
- **Audio Chimes**: Multi-harmonic monastery bell chime synthesized with the Web Audio API and audio fallback (`assets/audio/bell.mp3` / `bell.wav`).
- **Liturgical Aesthetic**:
  - Warm Parchment (default), Monastic Dark Cloister, and Sepia Vellum themes.
  - Serif typography (`Cinzel`, `Playfair Display`, `EB Garamond`) with drop caps and ornamental dividers.
- **Spiritual Library & Search**: Full-text chapter browser with instant search and book filtering.
- **Spiritual Journal**: Resolution history, meditation logs, and daily streak tracking, saved to your account (Google sign-in) and synced across devices, with an offline copy on each device.

---

## 🚀 Getting Started

### 1. Run the Web Application
The app is served by [PocketBase](https://pocketbase.io), which hosts the static files and provides Google sign-in and journal storage (`/api`). Run it locally with Docker:

```bash
docker compose up --build
```
Then open `http://localhost:8090` (admin dashboard at `/_/`). For Google sign-in locally, set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and add `http://localhost:8090/` as an authorized redirect URI on the OAuth client.

### Deployment (Coolify)
Built from the `Dockerfile` (port 80). Required configuration:

| Setting | Value |
|---|---|
| Persistent storage | volume mounted at `/pb/pb_data` (database lives here) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth "Web application" client |
| `APP_URL` | `https://ddcatholic.uncannylabs.xyz` |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | admin account for `/_/` |

The Google OAuth client must list `https://ddcatholic.uncannylabs.xyz/` as an authorized redirect URI. Database schema lives in `server/pb_migrations` and is applied automatically on startup; Google settings are applied from env vars by `server/pb_hooks/main.pb.js`.

### 2. Regenerate / Ingest EPUBs (Optional)
To re-extract and rebuild `data/meditations.json` from the source EPUBs:

```bash
pip install -r scripts/requirements.txt
python3 scripts/extract_epubs.py
python3 scripts/verify_data.py
```

---

## 📁 Repository Structure

```text
daily-meditations/
├── data/
│   └── meditations.json           # 365 parsed meditation entries
├── epubs/                         # Source spiritual classics in EPUB format
│   ├── My_Daily_Bread.epub
│   ├── The_Imitation_of_Christ.epub
│   └── The_Joy_of_Knowing_Christ.epub
├── scripts/
│   ├── extract_epubs.py           # EPUB extraction pipeline
│   ├── requirements.txt           # Python dependencies
│   └── verify_data.py             # Dataset verification script
├── assets/
│   ├── audio/
│   │   ├── bell.mp3               # Audio chime
│   │   └── bell.wav
│   └── icons/
├── server/
│   ├── pb_migrations/             # PocketBase schema (journal_entries, users.profile)
│   ├── pb_hooks/                  # Startup config (Google OAuth from env vars)
│   └── entrypoint.sh              # Creates admin account, starts PocketBase
├── Dockerfile                     # PocketBase + static app, single container
├── index.html                     # SPA layout and prayer views
├── styles.css                     # Monastic parchment design system
├── app.js                         # Application state engine, timer, audio, sign-in & sync
└── README.md
```

---

## 🔮 Roadmap & Future Enhancements
- [x] **Cloud Sync**: Google sign-in via self-hosted PocketBase for multi-device syncing and backup.
- [ ] **Data Export / Backup**: Single-click export/import of spiritual resolutions and session history.
- [ ] **Audio Recitation**: Optional audio playback of preparatory and concluding prayers.
