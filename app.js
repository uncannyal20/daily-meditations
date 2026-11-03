/**
 * Daily Devotion & Meditation Application
 * Distraction-Free Mental Prayer Single-Page App
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const state = {
    dataset: null,
    meditations: [],
    books: [],
    activeMeditation: null,
    currentScreen: 'welcome',
    timer: {
      totalSeconds: 15 * 60,
      remainingSeconds: 15 * 60,
      isRunning: false,
      intervalId: null,
      elapsedSeconds: 0
    },
    user: {
      settings: {
        durationMinutes: 15,
        sound: 'monastery',
        theme: 'parchment',
        fontSize: 'medium'
      },
      history: [],
      bookmarks: [],
      streak: 0,
      lastActiveDate: null
    }
  };

  // --- AUDIO SYNTHESIS & PLAYBACK ---
  class ChimeAudio {
    constructor() {
      this.audioCtx = null;
    }

    getAudioContext() {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    }

    play(soundType = 'monastery') {
      if (soundType === 'mute') return;

      // Try playing assets/audio/bell.wav first if standard bell
      if (soundType === 'monastery') {
        try {
          const audio = new Audio('assets/audio/bell.wav');
          audio.volume = 0.75;
          const playPromise = audio.play();
          if (playPromise) {
            playPromise.catch(() => this.synthesize(soundType));
            return;
          }
        } catch (e) {
          // fallback to Web Audio API synthesis
        }
      }

      this.synthesize(soundType);
    }

    synthesize(type) {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGain.gain.setValueAtTime(0.4, now);

      let frequencies = [];
      let duration = 3.5;

      if (type === 'singing_bowl') {
        // Warm resonant singing bowl (Tibetan harmonic ratios)
        frequencies = [
          { f: 261.63, a: 0.6, d: 4.5 }, // C4
          { f: 523.25, a: 0.35, d: 4.0 }, // C5
          { f: 784.88, a: 0.2, d: 3.0 }, // G5
          { f: 1046.50, a: 0.1, d: 2.2 } // C6
        ];
        duration = 4.8;
      } else if (type === 'soft') {
        // High soft chime
        frequencies = [
          { f: 659.25, a: 0.5, d: 2.5 }, // E5
          { f: 1318.51, a: 0.3, d: 2.0 }, // E6
          { f: 1975.53, a: 0.15, d: 1.5 } // B6
        ];
        duration = 2.8;
      } else {
        // Monastery bronze bell (A4 fundamental with sacred overtones)
        frequencies = [
          { f: 440.0, a: 0.7, d: 3.8 },
          { f: 880.0, a: 0.4, d: 3.0 },
          { f: 1318.5, a: 0.25, d: 2.2 },
          { f: 1760.0, a: 0.15, d: 1.6 }
        ];
        duration = 4.0;
      }

      frequencies.forEach(({ f, a, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(a, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + d);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + d + 0.1);
      });
    }
  }

  const chime = new ChimeAudio();

  // --- ACCOUNT, LOCAL CACHE & SERVER SYNC (PocketBase + Google) ---
  // The server (PocketBase, same origin) is the source of truth for signed-in
  // users. localStorage is a per-user offline cache so the app opens instantly
  // and keeps working without a connection; changes sync when back online.
  const LEGACY_STORAGE_KEY = 'daily_meditations_app_state_v1';
  const OAUTH_PENDING_KEY = 'ddc_oauth_pending';
  const OAUTH_REDIRECT_URL = `${window.location.origin}/`;

  const pb = window.PocketBase ? new window.PocketBase(window.location.origin) : null;
  if (pb) pb.autoCancellation(false);

  const sync = {
    pendingDeletes: [],   // server record ids removed locally, not yet deleted remotely
    profileDirty: false,  // local profile changes not yet pushed
    running: false,
    queued: false,
    timer: null
  };

  function currentUser() {
    return pb && pb.authStore.isValid ? pb.authStore.record : null;
  }

  function storageKey() {
    const u = currentUser();
    return u ? `${LEGACY_STORAGE_KEY}:${u.id}` : null;
  }

  function applySavedState(saved) {
    if (!saved) return;
    if (saved.settings) state.user.settings = { ...state.user.settings, ...saved.settings };
    if (Array.isArray(saved.history)) state.user.history = saved.history;
    if (Array.isArray(saved.bookmarks)) state.user.bookmarks = saved.bookmarks;
    if (typeof saved.streak === 'number') state.user.streak = saved.streak;
    if (saved.lastActiveDate !== undefined) state.user.lastActiveDate = saved.lastActiveDate;
  }

  function loadPersistedState() {
    try {
      const key = storageKey();
      const raw = key && localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        applySavedState(saved);
        sync.pendingDeletes = Array.isArray(saved._pendingDeletes) ? saved._pendingDeletes : [];
        sync.profileDirty = !!saved._profileDirty;
        return;
      }
      // First sign-in on this device: adopt any journal kept before accounts
      // existed, so it gets uploaded to the user's account.
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        applySavedState(JSON.parse(legacy));
        state.user.history.forEach(e => { delete e._rid; });
        state.importedLegacy = true;
      }
    } catch (e) {
      console.warn('Could not load saved state from localStorage:', e);
    }
  }

  function writeLocalCache() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        ...state.user,
        _pendingDeletes: sync.pendingDeletes,
        _profileDirty: sync.profileDirty
      }));
    } catch (e) {
      console.warn('Could not persist state to localStorage:', e);
    }
  }

  function savePersistedState() {
    sync.profileDirty = true;
    writeLocalCache();
    scheduleSync();
  }

  function profileSnapshot() {
    const u = state.user;
    return {
      v: 1,
      settings: u.settings,
      bookmarks: u.bookmarks,
      streak: u.streak,
      lastActiveDate: u.lastActiveDate
    };
  }

  function entryToRecord(entry, userId) {
    return {
      user: userId,
      client_id: String(entry.id).slice(0, 64),
      date: entry.date,
      meditation_id: entry.meditationId || '',
      book_title: (entry.bookTitle || '').slice(0, 300),
      chapter_title: (entry.chapterTitle || '').slice(0, 300),
      duration_minutes: Math.max(0, Math.min(1440, Math.round(entry.durationMinutes || 0))),
      resolution: (entry.resolution || '').slice(0, 5000)
    };
  }

  function recordToEntry(r) {
    return {
      id: r.client_id,
      date: r.date,
      meditationId: r.meditation_id,
      bookTitle: r.book_title,
      chapterTitle: r.chapter_title,
      durationMinutes: r.duration_minutes,
      resolution: r.resolution,
      _rid: r.id
    };
  }

  function sortHistory(list) {
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  }

  function setSyncStatus(text) {
    const el = document.getElementById('account-sync');
    if (el) el.textContent = text;
  }

  function scheduleSync(delay = 800) {
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncToServer, delay);
  }

  // Push local changes (new entries, deletions, profile) to the server.
  async function syncToServer() {
    const user = currentUser();
    if (!user) return;
    if (sync.running) { sync.queued = true; return; }
    sync.running = true;
    setSyncStatus('Syncing…');
    const entries = pb.collection('journal_entries');
    try {
      for (const rid of [...sync.pendingDeletes]) {
        try {
          await entries.delete(rid);
        } catch (e) {
          if (e.status !== 404) throw e;
        }
        sync.pendingDeletes = sync.pendingDeletes.filter(x => x !== rid);
      }

      for (const entry of state.user.history.filter(e => !e._rid)) {
        try {
          const rec = await entries.create(entryToRecord(entry, user.id));
          entry._rid = rec.id;
        } catch (e) {
          // Already uploaded (e.g. from another tab): adopt the existing record.
          if (e.status !== 400) throw e;
          const existing = await entries
            .getFirstListItem(pb.filter('client_id = {:cid}', { cid: String(entry.id) }))
            .catch(() => null);
          if (!existing) throw e;
          entry._rid = existing.id;
        }
      }

      if (sync.profileDirty) {
        sync.profileDirty = false;
        try {
          await pb.collection('users').update(user.id, { profile: profileSnapshot() });
        } catch (e) {
          sync.profileDirty = true;
          throw e;
        }
      }

      if (state.importedLegacy) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        state.importedLegacy = false;
      }
      setSyncStatus('✓ Journal saved to your account');
    } catch (e) {
      console.warn('Sync failed, will retry:', e);
      setSyncStatus(navigator.onLine ? '⚠ Could not sync — will retry' : 'Offline — changes saved on this device');
      if (e.status === 401) return handleAuthExpired();
      scheduleSync(30000);
    } finally {
      writeLocalCache();
      sync.running = false;
      if (sync.queued) { sync.queued = false; scheduleSync(0); }
    }
  }

  // Fetch the latest profile + journal from the server and merge into local state.
  async function pullFromServer() {
    const user = currentUser();
    if (!user) return false;
    try {
      const auth = await pb.collection('users').authRefresh();
      const records = await pb.collection('journal_entries').getFullList({ sort: '-date,-created', batch: 500 });

      // Journal: server records + any local entries not uploaded yet.
      // Local entries that have a server id but are gone remotely were
      // deleted on another device, so they are dropped.
      const serverEntries = records.map(recordToEntry);
      const serverIds = new Set(serverEntries.map(e => e.id));
      const unsynced = state.user.history.filter(e => !e._rid && !serverIds.has(e.id));
      state.user.history = sortHistory([...serverEntries, ...unsynced]);

      // Profile: server wins unless this device has unsynced changes.
      const remote = auth.record && auth.record.profile;
      const hasRemote = remote && typeof remote === 'object' && remote.v;
      if (hasRemote && state.importedLegacy) {
        // Merge pre-account data from this device into an existing account.
        const local = profileSnapshot();
        applySavedState(remote);
        state.user.bookmarks = Array.from(new Set([...(remote.bookmarks || []), ...(local.bookmarks || [])]));
        state.user.streak = Math.max(remote.streak || 0, local.streak || 0);
        if ((local.lastActiveDate || '') > (remote.lastActiveDate || '')) state.user.lastActiveDate = local.lastActiveDate;
        sync.profileDirty = true;
      } else if (hasRemote && !sync.profileDirty) {
        applySavedState(remote);
      } else if (!hasRemote) {
        sync.profileDirty = true;
      }

      writeLocalCache();
      return true;
    } catch (e) {
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        handleAuthExpired();
        return false;
      }
      console.warn('Could not reach server; using offline copy.', e);
      setSyncStatus('Offline — changes saved on this device');
      return false;
    }
  }

  function handleAuthExpired() {
    if (pb) pb.authStore.clear();
    document.body.classList.remove('authed');
    showAuthGate('Your session has expired. Please sign in again.');
  }

  // --- SIGN-IN GATE ---
  function showAuthGate(message, isError = false) {
    const btn = document.getElementById('btn-google-signin');
    const status = document.getElementById('auth-status');
    if (btn) { btn.hidden = false; btn.disabled = false; }
    if (status) {
      status.textContent = message || '';
      status.classList.toggle('error', !!isError);
    }
  }

  function setAuthBusy(message) {
    const btn = document.getElementById('btn-google-signin');
    const status = document.getElementById('auth-status');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = message; status.classList.remove('error'); }
  }

  async function startGoogleSignIn() {
    if (!pb) return showAuthGate('Sign-in is unavailable (library failed to load).', true);
    setAuthBusy('Opening Google…');
    try {
      const methods = await pb.collection('users').listAuthMethods();
      const google = (methods.oauth2 && methods.oauth2.providers || []).find(p => p.name === 'google');
      if (!google) return showAuthGate('Google sign-in is not configured on the server yet.', true);
      localStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({
        state: google.state,
        codeVerifier: google.codeVerifier
      }));
      window.location.assign(google.authURL + encodeURIComponent(OAUTH_REDIRECT_URL));
    } catch (e) {
      console.error(e);
      showAuthGate(navigator.onLine ? 'Could not reach the server. Please try again.' : 'You are offline. Connect to the internet to sign in.', true);
    }
  }

  // Completes the Google redirect (…/?code=…&state=…) if we're returning from it.
  async function completeOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') && !params.has('error')) return;

    const pending = JSON.parse(localStorage.getItem(OAUTH_PENDING_KEY) || 'null');
    localStorage.removeItem(OAUTH_PENDING_KEY);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    if (params.has('error')) {
      showAuthGate(params.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Google sign-in failed. Please try again.', true);
      return;
    }
    if (!pending || pending.state !== params.get('state')) {
      showAuthGate('Sign-in could not be verified. Please try again.', true);
      return;
    }
    setAuthBusy('Signing you in…');
    try {
      await pb.collection('users').authWithOAuth2Code(
        'google', params.get('code'), pending.codeVerifier, OAUTH_REDIRECT_URL
      );
    } catch (e) {
      console.error('OAuth exchange failed:', e);
      showAuthGate('Google sign-in failed. Please try again.', true);
    }
  }

  function renderAccount() {
    const u = currentUser();
    if (!u) return;
    const nameEl = document.getElementById('account-name');
    const emailEl = document.getElementById('account-email');
    const img = document.getElementById('account-avatar');
    const fallback = document.getElementById('account-avatar-fallback');
    if (nameEl) nameEl.textContent = u.name || u.email || 'Signed in';
    if (emailEl) emailEl.textContent = u.name ? u.email : '';
    if (img && u.avatar) {
      img.src = pb.files.getURL(u, u.avatar, { thumb: '100x100' });
      img.hidden = false;
      if (fallback) fallback.style.display = 'none';
    }
  }

  function signOut() {
    if (!window.confirm('Sign out of Daily Devotion on this device?')) return;
    const key = storageKey();
    if (sync.pendingDeletes.length || sync.profileDirty || state.user.history.some(e => !e._rid)) {
      if (!window.confirm('Some changes have not synced yet and will be lost if you sign out now. Sign out anyway?')) return;
    }
    if (key) localStorage.removeItem(key);
    pb.authStore.clear();
    window.location.replace('/');
  }

  window.addEventListener('online', () => scheduleSync(0));

  // --- DATE & LITURGICAL CALENDAR HELPERS ---
  function getFormattedCurrentDate() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return today.toLocaleDateString('en-US', options);
  }

  function getDayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  function updateStreakCheck() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!state.user.lastActiveDate) {
      state.user.streak = state.user.history.length > 0 ? 1 : 0;
      return;
    }

    const lastDate = new Date(state.user.lastActiveDate);
    const today = new Date(todayStr);
    const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      state.user.streak = 0;
    }
  }

  // --- UI NAVIGATION & SCREEN TRANSITIONS ---
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
      target.classList.add('active');
      state.currentScreen = screenId;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Toggle HUD visibility and stage badge based on prayer phase
    const hud = document.getElementById('meditation-hud');
    const hudStage = document.getElementById('hud-stage-badge');
    if (hud) {
      if (['preparation', 'reading', 'concluding'].includes(screenId)) {
        hud.style.display = 'block';
        if (hudStage) {
          if (screenId === 'preparation') hudStage.textContent = 'Phase 1: Preparation';
          else if (screenId === 'reading') hudStage.textContent = 'Phase 2: Meditation';
          else if (screenId === 'concluding') hudStage.textContent = 'Phase 3: Thanksgiving';
        }
      } else {
        hud.style.display = 'none';
      }
    }
  }

  // --- DATA LOADING & INITIALIZATION ---
  async function initApp() {
    document.getElementById('btn-google-signin')?.addEventListener('click', startGoogleSignIn);

    if (!pb) {
      showAuthGate('Sign-in is unavailable (library failed to load). Please reload.', true);
      return;
    }

    await completeOAuthRedirect();
    if (!currentUser()) {
      const status = document.getElementById('auth-status');
      if (!status || !status.classList.contains('error')) showAuthGate('');
      return;
    }

    document.body.classList.add('authed');
    trackHeaderHeight();
    renderAccount();
    loadPersistedState();
    updateStreakCheck();
    applySettingsToUI();

    // Refresh from the server in the background, then upload anything pending.
    pullFromServer().then((ok) => {
      if (!currentUser()) return;
      renderAccount();
      updateStreakCheck();
      applySettingsToUI();
      updateStatsDisplay();
      if (state.activeMeditation) updateBookmarkButton(state.activeMeditation.id);
      if (document.getElementById('modal-journal')?.classList.contains('active')) openJournalModal();
      if (ok || state.user.history.some(e => !e._rid)) syncToServer();
    });

    // Set Date Header
    const dateStr = getFormattedCurrentDate();
    const dateEl = document.getElementById('current-date-display');
    if (dateEl) dateEl.textContent = dateStr;
    const mobileDateEl = document.getElementById('mobile-date-display');
    if (mobileDateEl) mobileDateEl.textContent = dateStr;
    const badgeEl = document.getElementById('welcome-date-badge');
    if (badgeEl) badgeEl.textContent = dateStr;

    // Load Meditations Dataset
    try {
      const res = await fetch('data/meditations.json');
      state.dataset = await res.json();
      state.meditations = state.dataset.meditations || [];
      state.books = state.dataset.books || [];

      setupWelcomeHero();
      updateStatsDisplay();
      setupEventListeners();
    } catch (err) {
      console.error('Failed to load meditations dataset:', err);
    }
  }

  function setupWelcomeHero() {
    if (!state.meditations.length) return;

    // Pick meditation based on Day of Year
    const dayOfYear = getDayOfYear();
    const dailyIndex = (dayOfYear - 1) % state.meditations.length;
    const dailyMeditation = state.meditations[dailyIndex] || state.meditations[0];

    state.activeMeditation = dailyMeditation;

    const heroBookEl = document.getElementById('daily-hero-book-title');
    const heroTitleEl = document.getElementById('daily-hero-chapter-title');
    const heroMetaEl = document.getElementById('daily-hero-meta');
    const heroExcerptEl = document.getElementById('daily-hero-excerpt');

    if (heroBookEl) heroBookEl.textContent = dailyMeditation.bookTitle;
    if (heroTitleEl) heroTitleEl.textContent = dailyMeditation.title;
    if (heroMetaEl) heroMetaEl.textContent = dailyMeditation.subtitle || dailyMeditation.division || '';

    // Sample excerpt
    let excerpt = '';
    if (dailyMeditation.sections && dailyMeditation.sections.christ && dailyMeditation.sections.christ.length) {
      excerpt = `"${dailyMeditation.sections.christ[0].slice(0, 180)}..."`;
    } else if (dailyMeditation.paragraphs && dailyMeditation.paragraphs.length) {
      excerpt = `"${dailyMeditation.paragraphs[0].slice(0, 180)}..."`;
    }
    if (heroExcerptEl && excerpt) heroExcerptEl.textContent = excerpt;
  }

  function updateStatsDisplay() {
    const streakEl = document.getElementById('stat-streak');
    const completedEl = document.getElementById('stat-completed');
    const minutesEl = document.getElementById('stat-minutes');

    const totalMinutes = state.user.history.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);

    if (streakEl) streakEl.textContent = state.user.streak || 0;
    if (completedEl) completedEl.textContent = state.user.history.length || 0;
    if (minutesEl) minutesEl.textContent = `${totalMinutes}m`;
  }

  // --- MEDITATION SELECTION & PRAYER FLOW ---
  function updateHudBadges(m, stageText) {
    if (!m) return;
    const hudBook = document.getElementById('hud-book-badge');
    const hudChapter = document.getElementById('hud-chapter-badge');
    const hudStage = document.getElementById('hud-stage-badge');

    if (hudBook) hudBook.textContent = m.bookTitle;
    if (hudChapter) hudChapter.textContent = m.chapterLabel || `Chapter ${m.chapterNumber}`;
    if (hudStage && stageText) hudStage.textContent = stageText;
  }

  function selectMeditation(meditation) {
    if (!meditation) return;
    state.activeMeditation = meditation;

    // Pre-render the reading screen so all texts and badges are ready
    renderReadingScreen(meditation);

    // Update HUD information for Phase 1
    updateHudBadges(meditation, 'Phase 1: Preparation');

    // Show Preparation Screen
    showScreen('preparation');

    // Start timer immediately at the preparation stage!
    startMeditationTimer(state.user.settings.durationMinutes * 60);
  }

  function proceedToReading() {
    updateHudBadges(state.activeMeditation, 'Phase 2: Meditation');
    showScreen('reading');
    // Timer continues running without interruption from Phase 1
  }

  function formatDropCap(text) {
    if (!text) return '';
    const match = text.match(/^([“"']?)([A-Za-z0-9])(.*)$/s);
    if (match) {
      const quote = match[1];
      const char = match[2];
      const rest = match[3];
      if (quote) {
        return `<span class="drop-cap">${quote}${char}</span>${rest}`;
      }
      return `<span class="drop-cap">${char}</span>${rest}`;
    }
    return `<span class="drop-cap">${text.charAt(0)}</span>${text.slice(1)}`;
  }

  function renderReadingScreen(m) {
    if (!m) return;

    // HUD Header Info
    const hudBook = document.getElementById('hud-book-badge');
    const hudChapter = document.getElementById('hud-chapter-badge');
    if (hudBook) hudBook.textContent = m.bookTitle;
    if (hudChapter) hudChapter.textContent = m.chapterLabel || `Chapter ${m.chapterNumber}`;

    // Reading Sheet Header
    const divisionEl = document.getElementById('reading-division');
    const sectionEl = document.getElementById('reading-section');
    const labelEl = document.getElementById('reading-chapter-label');
    const titleEl = document.getElementById('reading-title');
    const scriptureEl = document.getElementById('reading-scripture');

    if (divisionEl) divisionEl.textContent = m.division || m.bookTitle;
    if (sectionEl) {
      sectionEl.textContent = m.part || m.section || '';
      sectionEl.style.display = (m.part || m.section) ? 'block' : 'none';
    }
    if (labelEl) labelEl.textContent = m.chapterLabel || `Chapter ${m.chapterNumber}`;
    if (titleEl) titleEl.textContent = m.title;

    if (scriptureEl) {
      if (m.scripture) {
        scriptureEl.textContent = m.scripture;
        scriptureEl.style.display = 'inline-block';
      } else {
        scriptureEl.style.display = 'none';
      }
    }

    // Reading Body Formatting
    const bodyEl = document.getElementById('reading-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    // Check if My Daily Bread structure (Christ, Think, Pray)
    if (m.bookId === 'my_daily_bread' && m.sections) {
      // 1. CHRIST SPEAKS
      if (m.sections.christ && m.sections.christ.length) {
        const cSection = document.createElement('div');
        cSection.className = 'mdb-section mdb-section-christ';
        cSection.innerHTML = `
          <div class="mdb-rubric-label">✠ Christ Speaks</div>
          ${m.sections.christ.map((p, idx) => `<p>${idx === 0 ? formatDropCap(p) : p}</p>`).join('')}
        `;
        bodyEl.appendChild(cSection);
      }

      // 2. THINK / REFLECT
      if (m.sections.think && m.sections.think.length) {
        const tSection = document.createElement('div');
        tSection.className = 'mdb-section mdb-section-think';
        tSection.innerHTML = `
          <div class="mdb-rubric-label">❧ Think & Reflect</div>
          ${m.sections.think.map(p => `<p>${p}</p>`).join('')}
        `;
        bodyEl.appendChild(tSection);
      }

      // 3. PRAY / COLLOQUY
      if (m.sections.pray && m.sections.pray.length) {
        const pSection = document.createElement('div');
        pSection.className = 'mdb-section mdb-section-pray';
        pSection.innerHTML = `
          <div class="mdb-rubric-label">† Colloquy / Prayer</div>
          ${m.sections.pray.map(p => `<p><em>${p}</em></p>`).join('')}
        `;
        bodyEl.appendChild(pSection);
      }
    } else {
      // Standard Chapters (Imitation of Christ / Joy of Knowing Christ)
      const paras = m.paragraphs || [];
      let isFirstBodyPara = true;
      paras.forEach((p) => {
        if (p.startsWith('†')) {
          const hTag = document.createElement('h4');
          hTag.className = 'reading-subheading';
          hTag.textContent = p;
          bodyEl.appendChild(hTag);
        } else {
          const pTag = document.createElement('p');
          if (isFirstBodyPara) {
            pTag.innerHTML = formatDropCap(p);
            isFirstBodyPara = false;
          } else {
            pTag.textContent = p;
          }
          bodyEl.appendChild(pTag);
        }
      });
    }

    // Update Bookmark status
    updateBookmarkButton(m.id);
  }

  // --- TIMER ENGINE ---
  function startMeditationTimer(durationSeconds) {
    clearInterval(state.timer.intervalId);
    state.timer.totalSeconds = durationSeconds;
    state.timer.remainingSeconds = durationSeconds;
    state.timer.elapsedSeconds = 0;
    state.timer.isRunning = true;

    updateTimerDisplay();

    const toggleBtnIcon = document.getElementById('timer-icon');
    if (toggleBtnIcon) toggleBtnIcon.textContent = '⏸';

    state.timer.intervalId = setInterval(() => {
      if (!state.timer.isRunning) return;

      state.timer.elapsedSeconds++;

      if (state.timer.remainingSeconds > 0) {
        state.timer.remainingSeconds--;
        updateTimerDisplay();

        if (state.timer.remainingSeconds === 0) {
          chime.play(state.user.settings.sound);
        }
      } else {
        updateTimerDisplay();
      }
    }, 1000);
  }

  function toggleTimer() {
    state.timer.isRunning = !state.timer.isRunning;
    const toggleBtnIcon = document.getElementById('timer-icon');
    if (toggleBtnIcon) {
      toggleBtnIcon.textContent = state.timer.isRunning ? '⏸' : '▶';
    }
  }

  function addMinutesToTimer(mins = 5) {
    state.timer.totalSeconds += mins * 60;
    state.timer.remainingSeconds += mins * 60;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const mins = Math.floor(state.timer.remainingSeconds / 60);
    const secs = state.timer.remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const countdownEl = document.getElementById('timer-countdown');
    if (countdownEl) countdownEl.textContent = formatted;

    const fillEl = document.getElementById('timer-progress-fill');
    if (fillEl && state.timer.totalSeconds > 0) {
      const pct = (state.timer.remainingSeconds / state.timer.totalSeconds) * 100;
      fillEl.style.width = `${pct}%`;
    }
  }

  // --- BOOKMARKS & RESOLUTIONS ---
  function toggleBookmark(meditationId) {
    const idx = state.user.bookmarks.indexOf(meditationId);
    if (idx >= 0) {
      state.user.bookmarks.splice(idx, 1);
    } else {
      state.user.bookmarks.push(meditationId);
    }
    savePersistedState();
    updateBookmarkButton(meditationId);
  }

  function updateBookmarkButton(meditationId) {
    const isBookmarked = state.user.bookmarks.includes(meditationId);
    const icon = document.getElementById('bookmark-icon');
    if (icon) {
      icon.textContent = isBookmarked ? '★' : '☆';
      icon.style.color = isBookmarked ? 'var(--sacred-gold)' : 'inherit';
    }
  }

  // --- COMPLETE SESSION & LOGGING ---
  function completeSession() {
    const m = state.activeMeditation;
    if (!m) return;

    // Stop and clear timer interval
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;

    const resInput = document.getElementById('resolution-textarea');
    const resolutionText = resInput ? resInput.value.trim() : '';

    const todayStr = new Date().toISOString().split('T')[0];
    const prayerMinutes = Math.max(1, Math.round(state.timer.elapsedSeconds / 60) || state.user.settings.durationMinutes);

    // Update streak
    if (state.user.lastActiveDate !== todayStr) {
      state.user.streak = (state.user.streak || 0) + 1;
      state.user.lastActiveDate = todayStr;
    }

    // Add to history
    const entry = {
      id: `dev_${Date.now()}`,
      date: todayStr,
      meditationId: m.id,
      bookTitle: m.bookTitle,
      chapterTitle: m.title,
      durationMinutes: prayerMinutes,
      resolution: resolutionText
    };

    state.user.history.unshift(entry);
    savePersistedState();

    // Populate Complete Screen
    const compBookChapter = document.getElementById('complete-book-chapter');
    const compTimeSpent = document.getElementById('complete-time-spent');
    const compResRow = document.getElementById('complete-resolution-row');
    const compResText = document.getElementById('complete-resolution-text');
    const compStreak = document.getElementById('complete-streak-text');

    if (compBookChapter) compBookChapter.textContent = `${m.bookTitle} — ${m.title}`;
    if (compTimeSpent) compTimeSpent.textContent = `${prayerMinutes} minutes`;
    if (compStreak) compStreak.textContent = `${state.user.streak} Day${state.user.streak === 1 ? '' : 's'}`;

    if (resolutionText) {
      if (compResRow) compResRow.style.display = 'flex';
      if (compResText) compResText.textContent = `"${resolutionText}"`;
    } else {
      if (compResRow) compResRow.style.display = 'none';
    }

    if (resInput) resInput.value = '';

    updateStatsDisplay();
    showScreen('complete');
  }

  // --- LIBRARY BROWSER MODAL ---
  function openLibraryModal(filterBook = 'all') {
    const modal = document.getElementById('modal-library');
    if (!modal) return;

    modal.classList.add('active');
    renderLibraryTabs(filterBook);
    filterAndRenderChapters(filterBook, '');

    const searchInput = document.getElementById('library-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  function renderLibraryTabs(activeTab = 'all') {
    const tabs = document.querySelectorAll('#library-book-tabs .tab-btn');
    tabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-book') === activeTab);
    });
  }

  function filterAndRenderChapters(bookId = 'all', searchQuery = '') {
    const container = document.getElementById('library-chapters-list');
    if (!container) return;

    let items = state.meditations;

    if (bookId === 'bookmarks') {
      items = items.filter(m => state.user.bookmarks.includes(m.id));
    } else if (bookId !== 'all') {
      items = items.filter(m => m.bookId === bookId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(m => 
        m.title.toLowerCase().includes(q) ||
        (m.subtitle && m.subtitle.toLowerCase().includes(q)) ||
        (m.division && m.division.toLowerCase().includes(q)) ||
        (m.scripture && m.scripture.toLowerCase().includes(q)) ||
        (m.chapterLabel && m.chapterLabel.toLowerCase().includes(q))
      );
    }

    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted); font-style: italic;">No meditations found matching your query.</div>`;
      return;
    }

    items.forEach(m => {
      const itemEl = document.createElement('div');
      itemEl.className = 'chapter-item';
      const isBookmarked = state.user.bookmarks.includes(m.id);

      itemEl.innerHTML = `
        <div class="chapter-item-left">
          <span class="chapter-item-book">${m.bookTitle} · ${m.chapterLabel || `Chapter ${m.chapterNumber}`}</span>
          <span class="chapter-item-title">${m.title}</span>
          <span class="chapter-item-meta">${m.subtitle || m.division || ''}</span>
        </div>
        <div class="chapter-item-right">
          <span style="color: var(--sacred-gold); font-size: 1.1rem;">${isBookmarked ? '★' : ''}</span>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        closeAllModals();
        selectMeditation(m);
      });

      container.appendChild(itemEl);
    });
  }

  // --- SPIRITUAL JOURNAL MODAL ---
  function openJournalModal() {
    const modal = document.getElementById('modal-journal');
    if (!modal) return;

    modal.classList.add('active');

    const totalMinutes = state.user.history.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);

    const totalEntriesEl = document.getElementById('journal-total-entries');
    const totalMinutesEl = document.getElementById('journal-total-minutes');
    const currentStreakEl = document.getElementById('journal-current-streak');
    const listEl = document.getElementById('journal-entries-list');

    if (totalEntriesEl) totalEntriesEl.textContent = state.user.history.length;
    if (totalMinutesEl) totalMinutesEl.textContent = `${totalMinutes}m`;
    if (currentStreakEl) currentStreakEl.textContent = `${state.user.streak}d`;

    if (!listEl) return;
    listEl.innerHTML = '';

    if (!state.user.history.length) {
      listEl.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--text-muted); font-style: italic;">Your spiritual journal is empty. Completed daily meditations and resolutions will be recorded here.</div>`;
      return;
    }

    state.user.history.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'journal-entry-card';
      card.innerHTML = `
        <div class="journal-entry-date">${entry.date} · ${entry.durationMinutes} min prayer</div>
        <div class="journal-entry-reading">${entry.bookTitle} — ${entry.chapterTitle}</div>
        ${entry.resolution ? `<div class="journal-entry-resolution"><strong>Resolution:</strong> "${entry.resolution}"</div>` : ''}
      `;
      listEl.appendChild(card);
    });
  }

  // --- SETTINGS & THEMES ---
  function applySettingsToUI() {
    applyHudCollapsed();
    const s = state.user.settings;

    // Apply Theme
    document.documentElement.setAttribute('data-theme', s.theme || 'parchment');

    // Apply Font Size
    const root = document.documentElement;
    if (s.fontSize === 'small') {
      root.style.setProperty('--reading-font-size', '1.05rem');
      root.style.setProperty('--reading-line-height', '1.75');
    } else if (s.fontSize === 'large') {
      root.style.setProperty('--reading-font-size', '1.35rem');
      root.style.setProperty('--reading-line-height', '1.95');
    } else if (s.fontSize === 'xlarge') {
      root.style.setProperty('--reading-font-size', '1.5rem');
      root.style.setProperty('--reading-line-height', '2.05');
    } else {
      root.style.setProperty('--reading-font-size', '1.18rem');
      root.style.setProperty('--reading-line-height', '1.85');
    }

    // Update settings buttons
    updatePillButtons('#setting-duration-group', 'data-minutes', String(s.durationMinutes));
    updatePillButtons('#setting-chime-group', 'data-sound', s.sound);
    updatePillButtons('#setting-theme-group', 'data-theme', s.theme);
    updatePillButtons('#setting-font-size-group', 'data-size', s.fontSize);
  }

  function applyHudCollapsed() {
    const collapsed = !!state.user.settings.hudCollapsed;
    const hud = document.getElementById('meditation-hud');
    const btn = document.getElementById('btn-hud-collapse');
    if (hud) hud.classList.toggle('collapsed', collapsed);
    if (btn) {
      const label = collapsed ? 'Show reading tools' : 'Hide reading tools';
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    }
  }

  // Keep the sticky HUD directly beneath the header, whatever its height.
  function trackHeaderHeight() {
    const header = document.querySelector('.app-header');
    if (!header) return;
    const update = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    update();
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(header);
    else window.addEventListener('resize', update);
  }

  function updatePillButtons(containerSelector, attrName, targetVal) {
    const buttons = document.querySelectorAll(`${containerSelector} .pill-btn`);
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute(attrName) === targetVal);
    });
  }

  function openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }

  // --- EVENT LISTENERS BINDING ---
  function setupEventListeners() {
    // Brand Home Click
    document.getElementById('btn-home')?.addEventListener('click', () => showScreen('welcome'));

    // Top Navigation Action Buttons
    document.getElementById('btn-open-library')?.addEventListener('click', () => openLibraryModal('all'));
    document.getElementById('btn-open-journal')?.addEventListener('click', openJournalModal);
    document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);
    document.getElementById('btn-signout')?.addEventListener('click', signOut);
    document.getElementById('btn-hud-collapse')?.addEventListener('click', () => {
      state.user.settings.hudCollapsed = !state.user.settings.hudCollapsed;
      applyHudCollapsed();
      savePersistedState();
    });

    // Theme Toggle (Quick switch between Parchment and Cloister)
    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'parchment';
      const nextTheme = current === 'cloister' ? 'parchment' : 'cloister';
      state.user.settings.theme = nextTheme;
      savePersistedState();
      applySettingsToUI();
    });

    // Close Modals
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // Welcome Screen Actions
    document.getElementById('btn-start-daily')?.addEventListener('click', () => {
      if (state.activeMeditation) selectMeditation(state.activeMeditation);
    });

    document.getElementById('btn-random-meditation')?.addEventListener('click', () => {
      if (!state.meditations.length) return;
      const randIdx = Math.floor(Math.random() * state.meditations.length);
      selectMeditation(state.meditations[randIdx]);
    });

    // Book Cards on Welcome Screen
    document.querySelectorAll('.btn-select-book').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bookId = e.currentTarget.getAttribute('data-book-id');
        openLibraryModal(bookId);
      });
    });

    document.querySelectorAll('.btn-quick-book').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bookId = e.currentTarget.getAttribute('data-book-id');
        const bookItems = state.meditations.filter(m => m.bookId === bookId);
        if (bookItems.length) {
          const dayOfYear = getDayOfYear();
          const item = bookItems[(dayOfYear - 1) % bookItems.length] || bookItems[0];
          selectMeditation(item);
        }
      });
    });

    // Preparation Screen Actions
    document.getElementById('btn-back-to-welcome')?.addEventListener('click', () => {
      clearInterval(state.timer.intervalId);
      state.timer.isRunning = false;
      showScreen('welcome');
    });
    document.getElementById('btn-start-meditation-reading')?.addEventListener('click', proceedToReading);

    // Reading Screen HUD Actions
    document.getElementById('btn-timer-toggle')?.addEventListener('click', toggleTimer);
    document.getElementById('btn-add-time')?.addEventListener('click', () => addMinutesToTimer(5));

    document.getElementById('btn-toggle-bookmark')?.addEventListener('click', () => {
      if (state.activeMeditation) toggleBookmark(state.activeMeditation.id);
    });

    document.getElementById('btn-font-smaller')?.addEventListener('click', () => {
      const sizes = ['small', 'medium', 'large', 'xlarge'];
      let currIdx = sizes.indexOf(state.user.settings.fontSize);
      if (currIdx > 0) {
        state.user.settings.fontSize = sizes[currIdx - 1];
        savePersistedState();
        applySettingsToUI();
      }
    });

    document.getElementById('btn-font-larger')?.addEventListener('click', () => {
      const sizes = ['small', 'medium', 'large', 'xlarge'];
      let currIdx = sizes.indexOf(state.user.settings.fontSize);
      if (currIdx < sizes.length - 1) {
        state.user.settings.fontSize = sizes[currIdx + 1];
        savePersistedState();
        applySettingsToUI();
      }
    });

    document.getElementById('btn-zen-mode')?.addEventListener('click', () => {
      document.body.classList.toggle('zen-mode');
    });

    // Reading Navigation Buttons
    // Back to Step 1 (Preparation); the prayer timer keeps running.
    document.getElementById('btn-back-to-preparation')?.addEventListener('click', () => {
      updateHudBadges(state.activeMeditation, 'Phase 1: Preparation');
      showScreen('preparation');
    });

    document.getElementById('btn-next-chapter')?.addEventListener('click', () => {
      if (!state.activeMeditation) return;
      const currIdx = state.meditations.findIndex(m => m.id === state.activeMeditation.id);
      if (currIdx >= 0 && currIdx < state.meditations.length - 1) {
        state.activeMeditation = state.meditations[currIdx + 1];
        renderReadingScreen(state.activeMeditation);
        updateHudBadges(state.activeMeditation, 'Phase 2: Meditation');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    document.getElementById('btn-proceed-concluding')?.addEventListener('click', () => {
      updateHudBadges(state.activeMeditation, 'Phase 3: Thanksgiving');
      showScreen('concluding');
    });

    // Concluding Actions
    document.getElementById('btn-back-to-reading')?.addEventListener('click', () => {
      updateHudBadges(state.activeMeditation, 'Phase 2: Meditation');
      showScreen('reading');
    });
    document.getElementById('btn-complete-session')?.addEventListener('click', completeSession);

    // Complete Screen Actions
    document.getElementById('btn-return-home')?.addEventListener('click', () => showScreen('welcome'));
    document.getElementById('btn-view-journal-entry')?.addEventListener('click', () => {
      showScreen('welcome');
      openJournalModal();
    });

    // Library Modal Search & Tabs
    document.getElementById('library-search-input')?.addEventListener('input', (e) => {
      const activeTab = document.querySelector('#library-book-tabs .tab-btn.active')?.getAttribute('data-book') || 'all';
      filterAndRenderChapters(activeTab, e.target.value);
    });

    document.querySelectorAll('#library-book-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const book = e.currentTarget.getAttribute('data-book');
        renderLibraryTabs(book);
        const query = document.getElementById('library-search-input')?.value || '';
        filterAndRenderChapters(book, query);
      });
    });

    // Settings Modal Options
    document.querySelectorAll('#setting-duration-group .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.user.settings.durationMinutes = parseInt(e.currentTarget.getAttribute('data-minutes'), 10);
        savePersistedState();
        applySettingsToUI();
      });
    });

    document.querySelectorAll('#setting-chime-group .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.user.settings.sound = e.currentTarget.getAttribute('data-sound');
        savePersistedState();
        applySettingsToUI();
        chime.play(state.user.settings.sound);
      });
    });

    document.getElementById('btn-test-chime')?.addEventListener('click', () => {
      chime.play(state.user.settings.sound);
    });

    document.querySelectorAll('#setting-theme-group .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.user.settings.theme = e.currentTarget.getAttribute('data-theme');
        savePersistedState();
        applySettingsToUI();
      });
    });

    document.querySelectorAll('#setting-font-size-group .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.user.settings.fontSize = e.currentTarget.getAttribute('data-size');
        savePersistedState();
        applySettingsToUI();
      });
    });

    // Devotion Counter Reset Handlers
    document.getElementById('btn-reset-counter')?.addEventListener('click', resetDevotionCounters);
    document.getElementById('btn-journal-clear')?.addEventListener('click', resetDevotionCounters);

    // Escape Key to close modals or exit zen mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('zen-mode')) {
          document.body.classList.remove('zen-mode');
        } else {
          closeAllModals();
        }
      }
    });
  }

  // --- RESET DEVOTION COUNTERS & HISTORY ---
  function resetDevotionCounters() {
    const confirmReset = window.confirm(
      'Are you sure you want to reset your devotion streak, completed session count, and prayer journal history?'
    );
    if (!confirmReset) return;

    state.user.history.forEach(e => { if (e._rid) sync.pendingDeletes.push(e._rid); });
    state.user.streak = 0;
    state.user.history = [];
    state.user.lastActiveDate = null;
    savePersistedState();
    updateStatsDisplay();

    if (document.getElementById('modal-journal')?.classList.contains('active')) {
      openJournalModal();
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--rubric-crimson); color:#fff; padding:10px 20px; border-radius:20px; font-family:var(--font-serif); font-size:0.95rem; z-index:9999; box-shadow:var(--shadow-md); border:1px solid var(--border-gold);';
    toast.textContent = '✠ Devotion counters and journal history have been reset.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // --- PWA SERVICE WORKER REGISTRATION ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('PWA ServiceWorker notice:', err);
      });
    });
  }

  // --- BOOTSTRAP ---
  document.addEventListener('DOMContentLoaded', initApp);

})();
