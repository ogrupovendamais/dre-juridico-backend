// Time Studio PWA · Client Application Logic · v1.0
(() => {
  'use strict';

  // --- Global State ---
  let user = null;
  let contracts = [];
  let timerInterval = null;
  const API_BASE = '/api/timestudio';

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=20261030_final3', { scope: './' })
        .then(reg => { reg.update(); console.log('Time Studio SW atualizado:', reg.scope); })
        .catch(err => console.warn('Falha ao registrar Time Studio SW:', err));
    });
  }

  // Helper DOM Selectors
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  // Escaping utility to avoid XSS
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Network State Monitoring ---
  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const pill = $('#status-online');
    if (pill) {
      if (isOnline) {
        pill.className = 'pill pill-online';
        pill.textContent = '● Online';
      } else {
        pill.className = 'pill pill-offline';
        pill.textContent = '● Offline';
      }
    }
    if (isOnline) {
      flushQueue();
    }
  }
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  // --- API Client ---
  async function api(path, options = {}) {
    const token = localStorage.getItem('timestudio_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401 && (path === '/me' || path.startsWith('/me'))) {
      logout();
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }
    if (!res.ok) {
      let errMsg = `Erro HTTP ${res.status}`;
      if (typeof data.detail === 'string') errMsg = data.detail;
      else if (Array.isArray(data.detail)) errMsg = data.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      else if (typeof data.message === 'string') errMsg = data.message;
      throw new Error(errMsg);
    }
    return data;
  }

  // --- Screen Switching ---
  function showScreen(screenId) {
    $$('.view-screen').forEach(s => s.classList.remove('active'));
    const target = $(`#${screenId}`);
    if (target) target.classList.add('active');
  }

  // --- Tabs Switching ---
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      $$('.tab-pane').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetPane = $(`#${targetId}`);
      if (targetPane) targetPane.style.display = 'block';

      if (targetId === 'tab-history') {
        loadHistory();
      }
      if (targetId === 'tab-manual') {
        initManualTimeDefaults(false);
        if (!$('#manual-contract')?.value && contracts.length > 0) {
          fillSampleManualData(false);
        }
      }
    });
  });

  // --- Offline Sync Queue Storage & Sync ---
  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem('timestudio_queue') || '[]');
    } catch {
      return [];
    }
  }

  function setQueue(q) {
    localStorage.setItem('timestudio_queue', JSON.stringify(q));
    updateQueueBadge();
  }

  function enqueueWorklog(entry) {
    const queue = getQueue();
    queue.push(entry);
    setQueue(queue);
    flushQueue();
  }

  function updateQueueBadge() {
    const queue = getQueue();
    const count = queue.length;
    const badge = $('#status-sync');
    const label = $('#sync-label');
    const qText = $('#queue-status-text');

    if (count === 0) {
      if (label) label.textContent = 'Sincronizado';
      if (badge) {
        badge.className = 'pill pill-sync';
        badge.style.color = '#34D399';
      }
      if (qText) qText.textContent = 'Todos os apontamentos sincronizados';
    } else {
      if (label) label.textContent = `${count} pendente${count > 1 ? 's' : ''}`;
      if (badge) {
        badge.className = 'pill pill-sync';
        badge.style.color = '#FBBF24';
      }
      if (qText) qText.textContent = `${count} apontamento${count > 1 ? 's' : ''} aguardando sincronização`;
    }
  }

  async function flushQueue() {
    if (!navigator.onLine) {
      updateQueueBadge();
      return;
    }
    const queue = getQueue();
    if (queue.length === 0) return;

    const icon = $('#sync-icon');
    if (icon) icon.style.display = 'inline-block';

    try {
      const res = await api('/entries/sync', {
        method: 'POST',
        body: JSON.stringify({ entries: queue })
      });
      // Clear queue on success
      setQueue([]);
      console.log('Sincronização Time Studio concluída:', res);
      loadHistory();
    } catch (err) {
      console.warn('Falha temporária ao sincronizar fila:', err.message);
    } finally {
      updateQueueBadge();
    }
  }

  $('#status-sync')?.addEventListener('click', flushQueue);
  $('#btn-sync-now')?.addEventListener('click', flushQueue);

  // --- Timer Engine ---
  function getTimerState() {
    try {
      return JSON.parse(localStorage.getItem('timestudio_timer') || 'null') || {
        state: 'stopped',
        contractId: '',
        description: '',
        startedAt: 0,
        accumulatedMs: 0,
        lastReminderMinute: 0
      };
    } catch {
      return { state: 'stopped', contractId: '', description: '', startedAt: 0, accumulatedMs: 0, lastReminderMinute: 0 };
    }
  }

  function saveTimerState(st) {
    localStorage.setItem('timestudio_timer', JSON.stringify(st));
    renderTimerUI();
  }

  function formatTime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  function getElapsedMs(st) {
    if (st.state === 'running') {
      return (Date.now() - st.startedAt) + st.accumulatedMs;
    }
    return st.accumulatedMs;
  }

  function renderTimerUI() {
    const st = getTimerState();
    const display = $('#timer-display');
    const badge = $('#timer-state-badge');
    const btnStart = $('#btn-timer-start');
    const btnPause = $('#btn-timer-pause');
    const btnResume = $('#btn-timer-resume');
    const btnStop = $('#btn-timer-stop');
    const selectContract = $('#timer-contract');
    const desc = $('#timer-desc');

    if (display) {
      display.textContent = formatTime(getElapsedMs(st));
      display.className = 'timer-clock' + (st.state === 'running' ? ' running' : (st.state === 'paused' ? ' paused' : ''));
    }

    if (badge) {
      badge.className = `timer-state-tag ${st.state}`;
      if (st.state === 'stopped') badge.textContent = 'Pronto para iniciar';
      else if (st.state === 'running') badge.textContent = '● Em andamento';
      else if (st.state === 'paused') badge.textContent = '❚❚ Pausado';
    }

    if (selectContract && st.contractId && selectContract.value !== st.contractId) {
      selectContract.value = st.contractId;
      populateStagesForContract(st.contractId, $('#timer-stage'));
    }
    const selectStage = $('#timer-stage');
    if (selectStage && st.stageId && selectStage.value !== st.stageId) {
      selectStage.value = st.stageId;
    }
    const selectAct = $('#timer-activity');
    if (selectAct && st.activityType && selectAct.value !== st.activityType) {
      selectAct.value = st.activityType;
    }
    if (desc && st.description && desc.value !== st.description) {
      desc.value = st.description;
    }

    // Buttons visibility
    if (st.state === 'stopped') {
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';
      if (selectContract) selectContract.disabled = false;
      if (selectStage) selectStage.disabled = false;
      if (selectAct) selectAct.disabled = false;
    } else if (st.state === 'running') {
      if (btnStart) btnStart.style.display = 'none';
      if (btnPause) btnPause.style.display = 'inline-flex';
      if (btnResume) btnResume.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';
      if (selectContract) selectContract.disabled = true;
      if (selectStage) selectStage.disabled = true;
      if (selectAct) selectAct.disabled = true;
    } else if (st.state === 'paused') {
      if (btnStart) btnStart.style.display = 'none';
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'inline-flex';
      if (btnStop) btnStop.style.display = 'inline-flex';
      if (selectContract) selectContract.disabled = true;
      if (selectStage) selectStage.disabled = true;
      if (selectAct) selectAct.disabled = true;
    }

    // Interval loop com Lembrete Anti-Esquecimento e Título Dinâmico
    if (st.state === 'running' && !timerInterval) {
      timerInterval = setInterval(() => {
        const cur = getTimerState();
        if (cur.state === 'running') {
          const elapsedMs = getElapsedMs(cur);
          if (display) {
            display.textContent = formatTime(elapsedMs);
          }

          const elapsedMins = Math.floor(elapsedMs / 60000);
          const isWarning = elapsedMins >= 60;
          document.title = `${isWarning ? '⚠️ ' : '▶ '}${formatTime(elapsedMs)} • Time Studio`;

          // Checa lembrete periódico anti-esquecimento
          const interval = getReminderInterval();
          if (interval > 0 && elapsedMins > 0 && (elapsedMins % interval === 0) && cur.lastReminderMinute !== elapsedMins) {
            cur.lastReminderMinute = elapsedMins;
            localStorage.setItem('timestudio_timer', JSON.stringify(cur));
            triggerReminderAlert(elapsedMins, cur);
          }
        }
      }, 250);
    } else if (st.state !== 'running') {
      document.title = 'Time Studio | DRE Jurídico';
      closeReminderModal();
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  }

    // --- Lembrete Inteligente Anti-Esquecimento (UX/UI & Sistema Sonoro Executivo) ---
  const SOUND_B64 = {
    cristalino: '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',
    dingdong: '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zAE6Aa4ALgCy/y//of4Q/pX9Tv1b/cv9mP4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    arpejo: '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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  };
  window.SOUND_B64 = SOUND_B64;

  let tabAlertInterval = null;

  function getSelectedSoundType() {
    return localStorage.getItem('timestudio_chime_sound') || 'cristalino';
  }
  window.getSelectedSoundType = getSelectedSoundType;

  function renderSoundChoiceUI() {
    const current = getSelectedSoundType();
    const valid = ['cristalino', 'dingdong', 'arpejo'].includes(current) ? current : 'cristalino';
    document.querySelectorAll('.btn-sound-choice').forEach(btn => {
      const sType = btn.getAttribute('data-sound');
      const isActive = (sType === valid);
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.style.setProperty('background', 'rgba(235, 181, 44, 0.28)', 'important');
        btn.style.setProperty('color', '#EBB52C', 'important');
        btn.style.setProperty('border-color', '#EBB52C', 'important');
        btn.style.setProperty('box-shadow', '0 0 10px rgba(235, 181, 44, 0.4)', 'important');
      } else {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
        btn.style.removeProperty('border-color');
        btn.style.removeProperty('box-shadow');
      }
    });

    const statusPill = document.getElementById('reminder-sound-status');
    if (statusPill) {
      const labels = {
        cristalino: 'Sino Cristalino 🔔',
        dingdong: 'Ding-Dong 🛎️',
        arpejo: 'Arpejo Moderno ✨'
      };
      statusPill.textContent = labels[valid] || 'Sino Cristalino 🔔';
    }
  }
  window.renderSoundChoiceUI = renderSoundChoiceUI;

  function playOscillatorSynthesis(ctx, type) {
    const t0 = ctx.currentTime + 0.03;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.75, t0);
    master.connect(ctx.destination);

    function note(freq, delay, dur, vol, wave = 'sine') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t0 + delay);
      g.gain.setValueAtTime(0.001, t0 + delay);
      g.gain.linearRampToValueAtTime(vol, t0 + delay + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t0 + delay + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.05);
    }

    if (type === 'dingdong') {
      // Ding-Dong Executivo (Duplo Ping Harmonioso)
      note(880.00, 0.00, 0.45, 0.70, 'sine');
      note(1760.00, 0.00, 0.25, 0.20, 'triangle');
      note(1108.73, 0.25, 0.80, 0.80, 'sine');
      note(2217.46, 0.25, 0.40, 0.25, 'triangle');
    } else if (type === 'arpejo') {
      // Arpejo Moderno (Tríade Maior Triunfal)
      note(523.25, 0.00, 0.35, 0.50, 'sine');
      note(659.25, 0.12, 0.38, 0.55, 'sine');
      note(783.99, 0.24, 0.45, 0.60, 'sine');
      note(1046.50, 0.36, 0.70, 0.70, 'sine');
      note(2093.00, 0.36, 0.30, 0.20, 'triangle');
    } else {
      // Sino Cristalino (Harmônicos Puros Suaves)
      note(659.25, 0.00, 0.40, 0.50, 'sine');
      note(830.61, 0.14, 0.45, 0.55, 'sine');
      note(987.77, 0.28, 0.50, 0.60, 'sine');
      note(1318.51, 0.42, 0.85, 0.75, 'sine');
      note(2637.02, 0.42, 0.40, 0.20, 'triangle');
    }
  }

  window.playReminderChime = function(soundType) {
    const chosen = soundType || getSelectedSoundType();

    // 1. ENGINE A: Web Audio API com contexto dinâmico no clique do usuário
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        playOscillatorSynthesis(ctx, chosen);
      }
    } catch (e) {
      console.warn('Web Audio synthesis notice:', e);
    }

    // 2. ENGINE B: HTML5 Audio com WAV Base64 pré-renderizado (Funciona em 100% dos navegadores)
    try {
      const b64Data = SOUND_B64[chosen] || SOUND_B64.cristalino;
      if (b64Data) {
        const audio = new Audio('data:audio/wav;base64,' + b64Data);
        audio.volume = 1.0;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(err => console.warn('HTML5 Audio notice:', err));
        }
      }
    } catch (err) {
      console.warn('HTML5 Audio fallback notice:', err);
    }
  };
  const playReminderChime = window.playReminderChime;

  window.selectChimeSound = function(type, ev) {
    if (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
    }
    const valid = ['cristalino', 'dingdong', 'arpejo'].includes(type) ? type : 'cristalino';
    localStorage.setItem('timestudio_chime_sound', valid);
    renderSoundChoiceUI();
    window.playReminderChime(valid);
  };
  const selectChimeSound = window.selectChimeSound;

  window.testChimeSound = function(ev) {
    if (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
    }
    const chosen = getSelectedSoundType();
    window.playReminderChime(chosen);

    // Destaque visual pulsante no visor do temporizador
    const display = document.getElementById('timer-display');
    if (display) {
      display.classList.add('reminder-alert');
      setTimeout(() => display.classList.remove('reminder-alert'), 2500);
    }

    // Feedback visual imediato no botão de teste
    const testBtn = document.getElementById('btn-test-reminder-sound');
    if (testBtn) {
      const orig = testBtn.innerHTML;
      testBtn.innerHTML = '🔊 Tocando...';
      testBtn.style.borderColor = 'var(--brand-gold)';
      testBtn.style.color = '#FFFFFF';
      setTimeout(() => {
        testBtn.innerHTML = orig;
        testBtn.style.borderColor = '';
        testBtn.style.color = '';
      }, 2500);
    }
  };
  const testChimeSound = window.testChimeSound;

  function playSubtleClickChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      }
    } catch (e) {}
  }
  
  function startTabTitleAlert(minutes, elapsedMs) {
    if (tabAlertInterval) clearInterval(tabAlertInterval);
    let toggle = false;
    const formatted = formatTime(elapsedMs);
    tabAlertInterval = setInterval(() => {
      toggle = !toggle;
      document.title = toggle
        ? `🔔 [${formatted}] TEMPO ATINGIDO!`
        : `⏱️ [${formatted}] Time Studio`;
    }, 1000);
  }

  function stopTabTitleAlert(elapsedMs) {
    if (tabAlertInterval) {
      clearInterval(tabAlertInterval);
      tabAlertInterval = null;
    }
    if (elapsedMs) {
      document.title = `⏱️ ${formatTime(elapsedMs)} — Time Studio`;
    } else {
      document.title = 'Time Studio | DRE Jurídico';
    }
  }

  function getReminderInterval() {
    const val = localStorage.getItem('timestudio_reminder_interval');
    return val !== null ? parseInt(val, 10) : 60; // 60 min default recomendado
  }

  function setReminderInterval(mins) {
    localStorage.setItem('timestudio_reminder_interval', String(mins));
    renderReminderControls();
  }

  function renderReminderControls() {
    renderSoundChoiceUI();
    const current = getReminderInterval();
    $$('.btn-reminder-choice').forEach(btn => {
      const bVal = parseInt(btn.dataset.interval, 10);
      btn.classList.toggle('active', bVal === current);
    });

    const pill = $('#reminder-status-pill');
    if (pill) {
      if (current === 0) {
        pill.textContent = 'Desativado';
        pill.style.background = 'rgba(255, 255, 255, 0.08)';
        pill.style.color = '#94A3B8';
      } else {
        pill.textContent = `A cada ${current} min`;
        pill.style.background = 'rgba(235, 181, 44, 0.15)';
        pill.style.color = 'var(--brand-gold)';
      }
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function triggerReminderAlert(minutes, st) {
    // 1. Toca o som de alerta anti-esquecimento
    playReminderChime();

    // 2. Destaca visualmente o temporizador na tela (pulsante em dourado)
    const display = $('#timer-display');
    if (display) {
      display.classList.add('reminder-alert');
    }
    const badge = $('#timer-alert-badge');
    if (badge) {
      badge.style.display = 'inline-flex';
    }

    // 3. Pisca o título da aba do navegador para quem estiver em outra janela/app
    const elapsedMs = getElapsedMs(st);
    startTabTitleAlert(minutes, elapsedMs);

    // 4. Vibração tátil no celular/PWA
    if ('vibrate' in navigator) {
      try { navigator.vibrate([250, 150, 250, 150, 450]); } catch(e){}
    }

    const contractObj = contracts.find(c => String(c.id) === String(st.contractId));
    const contractTitle = contractObj ? (contractObj.title || contractObj.label) : 'Processo Atendido';
    const actType = st.activityType || 'Atividade Jurídica';

    // 5. Notificação Nativa do Sistema (Web Notification)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🔔 Time Studio — Lembrete Anti-Esquecimento', {
          body: `Cronômetro ativo há ${minutes} minuto(s) em "${contractTitle}". Verifique o temporizador!`,
          icon: './icon-192.svg',
          tag: 'timestudio-reminder',
          renotify: true
        });
      } catch (e) {}
    }

    // 6. Modal Flutuante na Interface
    const modal = $('#reminder-modal');
    if (modal) {
      const timeTxt = $('#reminder-modal-time-text');
      if (timeTxt) {
        const hrs = (minutes / 60).toFixed(1);
        timeTxt.textContent = `Sessão ativa há ${minutes} minutos (${hrs}h) — Verifique o temporizador!`;
      }
      const cLabel = $('#reminder-contract-label');
      if (cLabel) cLabel.textContent = contractTitle;
      const aLabel = $('#reminder-activity-label');
      if (aLabel) aLabel.textContent = actType;

      const overtimeNote = $('#reminder-overtime-note');
      if (overtimeNote) {
        overtimeNote.style.display = (minutes >= 240) ? 'block' : 'none';
      }

      modal.style.display = 'flex';
    }
  }

  function closeReminderModal() {
    const modal = $('#reminder-modal');
    if (modal) modal.style.display = 'none';

    // Remove destaque do temporizador
    const display = $('#timer-display');
    if (display) {
      display.classList.remove('reminder-alert');
    }
    const badge = $('#timer-alert-badge');
    if (badge) {
      badge.style.display = 'none';
    }

    // Restaura o título padrão da aba
    const cur = getTimerState();
    if (cur.state === 'running') {
      stopTabTitleAlert(getElapsedMs(cur));
    } else {
      stopTabTitleAlert(0);
    }
  }

  // Timer controls event listeners
  $('#btn-timer-start')?.addEventListener('click', () => {
    requestNotificationPermission();
    const contract = $('#timer-contract').value;
    if (!contract) {
      alert('Por favor, selecione o processo ou contrato atendido antes de iniciar.');
      $('#timer-contract').focus();
      return;
    }
    const stageId = $('#timer-stage')?.value || null;
    const activityType = $('#timer-activity')?.value || 'Petição / Manifestação';

    saveTimerState({
      state: 'running',
      contractId: contract,
      stageId: stageId,
      activityType: activityType,
      description: $('#timer-desc').value.trim(),
      startedAt: Date.now(),
      accumulatedMs: 0,
      lastReminderMinute: 0
    });
  });

  $('#btn-timer-pause')?.addEventListener('click', () => {
    const st = getTimerState();
    if (st.state !== 'running') return;
    const total = (Date.now() - st.startedAt) + st.accumulatedMs;
    saveTimerState({
      ...st,
      state: 'paused',
      startedAt: 0,
      accumulatedMs: total,
      description: $('#timer-desc').value.trim()
    });
  });

  $('#btn-timer-resume')?.addEventListener('click', () => {
    const st = getTimerState();
    if (st.state !== 'paused') return;
    saveTimerState({
      ...st,
      state: 'running',
      startedAt: Date.now(),
      description: $('#timer-desc').value.trim()
    });
  });

  $('#btn-timer-stop')?.addEventListener('click', () => {
    const st = getTimerState();
    const elapsedMs = getElapsedMs(st);
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    const description = ($('#timer-desc').value || st.description || '').trim();

    if (!confirm(`Finalizar cronômetro com ${minutes} minuto(s) registrado(s)?`)) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const idempotencyKey = 'ts_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    enqueueWorklog({
      idempotency_key: idempotencyKey,
      contract_id: st.contractId,
      stage_id: st.stageId || null,
      activity_type: st.activityType || 'Petição / Manifestação',
      work_date: today,
      minutes: minutes,
      description: description
    });

    // Reset timer
    closeReminderModal();
    document.title = 'Time Studio | DRE Jurídico';
    saveTimerState({
      state: 'stopped',
      contractId: '',
      stageId: '',
      activityType: '',
      description: '',
      startedAt: 0,
      accumulatedMs: 0,
      lastReminderMinute: 0
    });
    if ($('#timer-desc')) $('#timer-desc').value = '';

    alert('Apontamento registrado com sucesso! O registro foi adicionado à fila de sincronização.');
  });

  // Keep description synced
  $('#timer-desc')?.addEventListener('input', e => {
    const st = getTimerState();
    if (st.state !== 'stopped') {
      st.description = e.target.value;
      localStorage.setItem('timestudio_timer', JSON.stringify(st));
    }
  });

  
  // --- Lógica de Preenchimento Automático do Apontamento Manual (UX/UI) ---
  function formatMinutesHuman(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0 min';
    const hrs = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (hrs > 0 && mins > 0) return `${hrs}h ${String(mins).padStart(2, '0')}min`;
    if (hrs > 0) return `${hrs}h 00min`;
    return `${mins} min`;
  }

  function updateManualMinutesBadge(mins) {
    const badge = $('#manual-minutes-badge');
    if (badge) {
      badge.textContent = formatMinutesHuman(mins);
      badge.style.display = mins > 0 ? 'inline-block' : 'none';
    }
  }

  function recalculateManualMinutesFromTimes() {
    const startVal = $('#manual-start')?.value;
    const endVal = $('#manual-end')?.value;
    const pauseMin = Number($('#manual-pause')?.value) || 0;

    if (startVal && endVal) {
      const [sh, sm] = startVal.split(':').map(Number);
      const [eh, em] = endVal.split(':').map(Number);
      let startTotal = sh * 60 + sm;
      let endTotal = eh * 60 + em;

      // Suporte a virada de meia-noite (ex: 23:30 até 01:00)
      if (endTotal < startTotal) {
        endTotal += 24 * 60;
      }

      let diff = (endTotal - startTotal) - pauseMin;
      if (diff > 0) {
        if ($('#manual-minutes')) {
          $('#manual-minutes').value = diff;
        }
        updateManualMinutesBadge(diff);
        const hint = $('#manual-calc-hint');
        if (hint) {
          hint.innerHTML = `⚡ Calculado automaticamente: <strong>${formatMinutesHuman(diff)}</strong> (${diff} min). Você pode editar livremente.`;
          hint.style.color = '#FDE047';
        }
        return diff;
      }
    }
    return null;
  }

  function initManualTimeDefaults(force = false) {
    const startEl = $('#manual-start');
    const endEl = $('#manual-end');
    const pauseEl = $('#manual-pause');
    const minutesEl = $('#manual-minutes');
    const dateEl = $('#manual-date');

    // Data de hoje
    if (dateEl && (!dateEl.value || force)) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateEl.value = `${yyyy}-${mm}-${dd}`;
    }

    if (pauseEl && (pauseEl.value === '' || force)) {
      pauseEl.value = '0';
    }

    // Se início ou término estiverem vazios (ou force=true), preenche seguindo o relógio
    if (startEl && endEl && (force || !startEl.value || !endEl.value)) {
      const now = new Date();
      const curH = String(now.getHours()).padStart(2, '0');
      const curM = String(now.getMinutes()).padStart(2, '0');
      const nowStr = `${curH}:${curM}`;

      // Início padrão: 1 hora atrás do horário atual
      const prevHour = new Date(now.getTime() - 60 * 60 * 1000);
      const prevH = String(prevHour.getHours()).padStart(2, '0');
      const prevM = String(prevHour.getMinutes()).padStart(2, '0');
      const startStr = `${prevH}:${prevM}`;

      if (!startEl.value || force) startEl.value = startStr;
      if (!endEl.value || force) endEl.value = nowStr;

      // Calcula automaticamente os minutos
      const diff = recalculateManualMinutesFromTimes();
      if (!diff && minutesEl && (!minutesEl.value || force)) {
        minutesEl.value = 60;
        updateManualMinutesBadge(60);
      }
    } else if (minutesEl && minutesEl.value) {
      updateManualMinutesBadge(Number(minutesEl.value));
    }
  }

  // --- Funções de Teste Rápido (UX/UI Executive Pre-fill) ---
  function fillSampleManualData(notifyUser = false) { return; }
  function fillSampleTimerData(notifyUser = false) {
    // Nenhum contrato fictício inserido

    // Purga cache legado de acao_trabalhista para garantir base comercial 100% limpa
    try {
      const cached = localStorage.getItem('timestudio_contracts');
      if (cached && cached.includes('acao_trabalhista')) {
        localStorage.removeItem('timestudio_contracts');
        contracts = [];
      }
    } catch(e) {}

    const cEl = $('#timer-contract');
    if (cEl && contracts.length > 0) {
      cEl.value = contracts[0].id;
      populateStagesForContract(contracts[0].id, $('#timer-stage'));
    }
    const sEl = $('#timer-stage');
    if (sEl && sEl.options.length > 1) {
      sEl.selectedIndex = Math.min(3, sEl.options.length - 1);
    }
    const aEl = $('#timer-activity');
    if (aEl) aEl.value = 'Petição / Manifestação';
    const dEl = $('#timer-desc');
    if (dEl) dEl.value = 'Acompanhamento processual e análise jurídica (Teste Cronômetro Time Studio).';
  }

  window.fillSampleManualData = fillSampleManualData;
  window.fillSampleTimerData = fillSampleTimerData;
  $('#btn-sample-fill')?.addEventListener('click', () => fillSampleManualData(true));
  $('#btn-timer-test-fill')?.addEventListener('click', () => fillSampleTimerData(true));

  // --- Manual Entry Form ---
  $('#form-manual')?.addEventListener('submit', async e => {
    e.preventDefault();
    const contract = $('#manual-contract').value;
    const stageId = $('#manual-stage')?.value || null;
    const activityType = $('#manual-activity')?.value || 'Petição / Manifestação';
    const date = $('#manual-date').value;
    const minutes = Number($('#manual-minutes').value);
    const startTime = $('#manual-start')?.value || null;
    const endTime = $('#manual-end')?.value || null;
    const pauseMin = Number($('#manual-pause')?.value) || 0;
    const desc = $('#manual-desc').value.trim();

    if (!contract || !date || minutes <= 0) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const idempotencyKey = 'ts_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    enqueueWorklog({
      idempotency_key: idempotencyKey,
      contract_id: contract,
      contract_stage_id: stageId,
      stage_id: stageId,
      activity_type: activityType,
      start_time: startTime,
      end_time: endTime,
      pause_minutes: pauseMin,
      work_date: date,
      minutes: minutes,
      description: desc,
      professional_id: user?.id,
      professional_name: user?.name,
      created_at: new Date().toISOString()
    });

    const feedback = $('#manual-feedback');
    if (feedback) {
      feedback.innerHTML = `<strong>✓ Apontamento de ${minutes} min registrado!</strong> Sincronizando com o DRE Jurídico...`;
      feedback.className = 'alert-box alert-success';
      feedback.style.display = 'block';
    }

    // Dispara sincronização em tempo real e atualiza histórico
    await flushQueue();
    try {
      await loadHistory();
    } catch (e) {}

    if (feedback) {
      feedback.innerHTML = `<strong>✓ Sincronizado com Sucesso!</strong> Apontamento de ${minutes} min transmitido para a Central de Homologação do DRE Jurídico.`;
      setTimeout(() => { feedback.style.display = 'none'; }, 5000);
    }
  });

  // --- Load Personal History ---
  async function loadHistory() {
    const list = $('#history-list');
    if (!list) return;

    try {
      const entries = await api('/entries');
      const countEl = $('#history-count');
      if (countEl) countEl.textContent = String(entries.length);

      if (entries.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#64748B;font-size:13px;padding:24px;">Nenhum apontamento registrado ainda.</p>';
        return;
      }

      list.innerHTML = entries.map(item => {
        let badgeHtml = '';
        if (item.status === 'APPROVED') {
          badgeHtml = '<span class="pill badge-approved">✓ Aprovado</span>';
        } else if (item.status === 'REJECTED') {
          badgeHtml = `<span class="pill badge-rejected" title="${esc(item.rejection_reason)}">✕ Rejeitado</span>`;
        } else {
          badgeHtml = '<span class="pill badge-pending">⏳ Pendente</span>';
        }

        const hrs = `${Math.floor(item.minutes / 60)}h ${String(item.minutes % 60).padStart(2, '0')}min`;

        return `
          <article class="history-item">
            <div class="history-header">
              <div>
                <strong class="history-title" style="display:block;">${esc(item.contract_label)}</strong>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                  ${item.stage_name ? `<span class="pill badge-stage">📍 ${esc(item.stage_name)}</span>` : ''}
                  ${item.activity_type ? `<span class="pill badge-activity">🏷️ ${esc(item.activity_type)}</span>` : ''}
                </div>
              </div>
              <span class="history-time">${hrs}</span>
            </div>
            <p class="history-desc" style="margin-top:6px;">${esc(item.description || 'Sem descrição informada.')}</p>
            ${item.status === 'REJECTED' && item.rejection_reason ? `
              <div style="font-size:11.5px;color:#FCA5A5;background:rgba(239,68,68,0.1);padding:6px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.25);margin-top:6px;">
                <strong>Motivo da recusa:</strong> ${esc(item.rejection_reason)}
              </div>
            ` : ''}
            <div class="history-footer" style="margin-top:8px;">
              <span>📅 ${esc(item.work_date)}</span>
              ${badgeHtml}
            </div>
          </article>
        `;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p style="text-align:center;color:#FCA5A5;font-size:13px;padding:20px;">Erro ao carregar histórico: ${esc(err.message)}</p>`;
    }
  }

  // --- Populate Contracts & Stages Dropdowns ---
  function populateStagesForContract(contractId, stageSelectEl) {
    if (!stageSelectEl) return;
    const found = contracts.find(c => String(c.id) === String(contractId));
    if (found && found.stages && found.stages.length > 0) {
      stageSelectEl.innerHTML = '<option value="">Selecione a Etapa Processual...</option>' +
        found.stages.map(st => {
          const sName = st.stage_name || st.name || 'Etapa';
          const sOrder = st.stage_order || st.order || '';
          const prefix = sOrder ? `${sOrder}. ` : '';
          return `<option value="${esc(st.id)}">${prefix}${esc(sName)}</option>`;
        }).join('');
      stageSelectEl.disabled = false;
    } else {
      stageSelectEl.innerHTML = '<option value="">Sem etapas específicas ou geral</option>';
    }
  }

  function renderContractsSelects() {
    if (!contracts || contracts.length === 0) {
      const emptyOpt = '<option value="" selected disabled>Nenhum contrato ativo cadastrado na banca</option>';
      if ($('#timer-contract')) {
        $('#timer-contract').innerHTML = emptyOpt;
        $('#timer-contract').disabled = true;
      }
      if ($('#timer-stage')) {
        $('#timer-stage').innerHTML = '<option value="" selected disabled>Cadastre um contrato no painel primeiro</option>';
        $('#timer-stage').disabled = true;
      }
      if ($('#manual-contract')) {
        $('#manual-contract').innerHTML = emptyOpt;
        $('#manual-contract').disabled = true;
      }
      if ($('#manual-stage')) {
        $('#manual-stage').innerHTML = '<option value="" selected disabled>Cadastre um contrato no painel primeiro</option>';
        $('#manual-stage').disabled = true;
      }
      return;
    }

    const opts = ['<option value="">Selecione o Contrato / Processo...</option>']
      .concat(contracts.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`))
      .join('');
    if ($('#timer-contract')) {
      $('#timer-contract').disabled = false;
      $('#timer-contract').innerHTML = opts;
      $('#timer-contract').onchange = e => {
        populateStagesForContract(e.target.value, $('#timer-stage'));
      };
    }
    if ($('#timer-stage')) {
      $('#timer-stage').disabled = false;
    }
    if ($('#manual-contract')) {
      $('#manual-contract').disabled = false;
      $('#manual-contract').innerHTML = opts;
      $('#manual-contract').onchange = e => {
        populateStagesForContract(e.target.value, $('#manual-stage'));
      };
    }
    if ($('#manual-stage')) {
      $('#manual-stage').disabled = false;
    }
  }

  // --- Invite Verification & Acceptance ---
  async function checkInviteToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = urlParams.get('invite') || hashParams.get('invite');
    if (!token) return false;

    showScreen('screen-invite');
    try {
      const data = await api(`/invite/verify?token=${encodeURIComponent(token)}`);
      $('#invite-prof-name').textContent = data.professional_name;
      $('#invite-office-name').textContent = data.office_name;
      $('#invite-email').textContent = data.email;

      $('#form-accept-invite').onsubmit = async ev => {
        ev.preventDefault();
        const p1 = $('#invite-password').value;
        const p2 = $('#invite-password-confirm').value;
        const err = $('#invite-error');

        if (p1 !== p2) {
          err.textContent = 'As senhas digitadas não coincidem.';
          err.style.display = 'block';
          return;
        }

        try {
          const res = await api('/invite/accept', {
            method: 'POST',
            body: JSON.stringify({ token, password: p1 })
          });
          localStorage.setItem('timestudio_token', res.token); if (res.professional) { localStorage.setItem('timestudio_user', JSON.stringify(res.professional)); }
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          await initApp();
        } catch (ex) {
          err.textContent = ex.message;
          err.style.display = 'block';
        }
      };
      return true;
    } catch (err) {
      $('#invite-info').innerHTML = `<strong style="color:#FCA5A5;">Convite inválido ou expirado:</strong> ${esc(err.message)}`;
      $('#form-accept-invite').style.display = 'none';
      return true;
    }
  }

  // --- Password Toggle ---
  function wirePasswordToggle() {
    const btn = $('#btn-toggle-pwd');
    const input = $('#login-password');
    if (!btn || !input) return;

    const toggle = (ev) => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      const icon = $('#toggle-pwd-icon');
      if (icon) {
        icon.textContent = isPwd ? '🙈' : '👁️';
      }
      btn.title = isPwd ? 'Ocultar senha' : 'Mostrar senha';
      btn.setAttribute('aria-label', isPwd ? 'Ocultar senha' : 'Mostrar senha');
      input.focus();
    };

    btn.onclick = toggle;
    btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  }
  wirePasswordToggle();

  // --- SSO Helper ---
  async function attemptSSOLogin(dreToken) {
    if (!dreToken) return false;
    try {
      const res = await api('/auth/sso', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${dreToken}` }
      });
      if (res && res.token) {
        localStorage.setItem('timestudio_token', res.token); if (res.professional) { localStorage.setItem('timestudio_user', JSON.stringify(res.professional)); }
        await initApp();
        return true;
      }
    } catch (err) {
      console.warn('Tentativa de SSO não concluída:', err);
    }
    return false;
  }

  // --- Login Form ---
  $('#form-login')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const err = $('#login-error');
    const submitBtn = $('#btn-submit-login');
    const btnText = $('#login-btn-text');

    if (err) {
      err.style.display = 'none';
      err.innerHTML = '';
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      if (btnText) btnText.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;">⏳ Autenticando...</span>';
    }

    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('timestudio_token', res.token); if (res.professional) { localStorage.setItem('timestudio_user', JSON.stringify(res.professional)); }
      await initApp();
    } catch (ex) {
      if (err) {
        const rawMsg = ex.message || 'Falha na autenticação';
        let detailHtml = `<strong>⚠️ Não foi possível entrar:</strong> ${escapeHtml(rawMsg)}`;
        
        if (rawMsg.includes('inválidas') || rawMsg.includes('inativa') || rawMsg.includes('não encontrada')) {
          detailHtml += `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.15);font-size:11.5px;color:#F1F5F9;line-height:1.5;">
              <span style="display:block;margin-bottom:4px;font-weight:700;color:var(--brand-gold,#EBB52C);">💡 Dicas de Acesso:</span>
              <span style="display:block;">• <strong>Advogado / Profissional:</strong> Utilize o mesmo e-mail cadastrado pelo sócio no convite individual.</span>
              <span style="display:block;">• <strong>Administrador da Banca:</strong> Utilize seu e-mail corporativo e a mesma senha do DRE Jurídico.</span>
              <span style="display:block;margin-top:6px;"><a href="/" style="color:#BAE6FD;text-decoration:underline;">Clique aqui para acessar pelo painel DRE Jurídico</a></span>
            </div>
          `;
        }
        err.innerHTML = detailHtml;
        err.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Entrar no Time Studio';
      }
    }
  });

  // --- Botão SSO no Login ---
  $('#btn-sso-login')?.addEventListener('click', async () => {
    const dreToken = localStorage.getItem('dre_token') || sessionStorage.getItem('dre_token');
    const btn = $('#btn-sso-login');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Conectando via DRE...</span>';
    }
    const ok = await attemptSSOLogin(dreToken);
    if (!ok && btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Acessar com Minha Conta DRE (1 Clique)</span>';
      const err = $('#login-error');
      if (err) {
        err.innerHTML = '<strong>Sessão DRE expirada.</strong> Por favor, informe seu e-mail e senha abaixo ou faça login novamente no painel principal.';
        err.style.display = 'block';
      }
    }
  });

  // --- Logout ---
  function logout() {
    localStorage.removeItem('timestudio_token');
    user = null;
    contracts = [];
    if (typeof stopTimer === 'function') stopTimer();
    $('#btn-logout').style.display = 'none';
    $('#hdr-office').textContent = 'DRE Jurídico';
    showScreen('screen-login');
    if (typeof checkSSOAvailable === 'function') checkSSOAvailable();
  }
  $('#btn-logout')?.addEventListener('click', logout);


    // Wire reminder interval selector buttons
  $$('.btn-reminder-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const interval = parseInt(btn.dataset.interval, 10);
      setReminderInterval(interval);
      requestNotificationPermission();

      // Desbloqueia áudio e toca micro-feedback auditivo
      getAudioContext();
      if (interval > 0) {
        playSubtleClickChime();
      }
    });
  });

  // Botão de teste sonoro no cabeçalho do lembrete
    // Cliques nos botões de escolha de toque sonoro (3 opções)
  $$('.btn-sound-choice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const soundType = btn.dataset.sound;
      setSelectedSoundType(soundType, true);
    });
  });

  // Botão de teste sonoro no cabeçalho do lembrete
  $('#btn-test-reminder-sound')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const chosen = getSelectedSoundType();
    await playReminderChime(chosen);

    // Destaque visual temporário no temporizador por 2.5s para demonstrar
    const display = $('#timer-display');
    if (display) {
      display.classList.add('reminder-alert');
      setTimeout(() => display.classList.remove('reminder-alert'), 2500);
    }
    const testBtn = $('#btn-test-reminder-sound');
    if (testBtn) {
      const orig = testBtn.innerHTML;
      testBtn.innerHTML = '🔊 Tocando...';
      testBtn.style.borderColor = 'var(--brand-gold)';
      setTimeout(() => {
        testBtn.innerHTML = orig;
        testBtn.style.borderColor = '';
      }, 2500);
    }
  });

  $('#btn-replay-reminder-sound')?.addEventListener('click', (e) => {
    e.preventDefault();
    getAudioContext();
    playReminderChime();
  });

  $('#btn-reminder-continue')?.addEventListener('click', () => {
    closeReminderModal();
  });

  $('#btn-reminder-pause')?.addEventListener('click', () => {
    closeReminderModal();
    $('#btn-timer-pause')?.click();
  });

  
  // Wire eventos de cálculo automático e edição no Apontamento Manual
  ['input', 'change'].forEach(evt => {
    $('#manual-start')?.addEventListener(evt, () => recalculateManualMinutesFromTimes());
    $('#manual-end')?.addEventListener(evt, () => recalculateManualMinutesFromTimes());
    $('#manual-pause')?.addEventListener(evt, () => recalculateManualMinutesFromTimes());
  });

  // Permite edição manual livre no campo de minutos com feedback instantâneo
  $('#manual-minutes')?.addEventListener('input', e => {
    const val = Number(e.target.value) || 0;
    updateManualMinutesBadge(val);
    const hint = $('#manual-calc-hint');
    if (hint) {
      if (val > 0) {
        hint.innerHTML = `✏️ Tempo manual: <strong>${formatMinutesHuman(val)}</strong>.`;
        hint.style.color = '#94A3B8';
      }
    }
  });

  // Botões rápidos de horário
  $('#btn-set-now-end')?.addEventListener('click', (e) => {
    e.preventDefault();
    const now = new Date();
    const curH = String(now.getHours()).padStart(2, '0');
    const curM = String(now.getMinutes()).padStart(2, '0');
    if ($('#manual-end')) $('#manual-end').value = `${curH}:${curM}`;
    recalculateManualMinutesFromTimes();
  });

  $('#btn-set-now-start')?.addEventListener('click', (e) => {
    e.preventDefault();
    const now = new Date();
    const prevHour = new Date(now.getTime() - 60 * 60 * 1000);
    const prevH = String(prevHour.getHours()).padStart(2, '0');
    const prevM = String(prevHour.getMinutes()).padStart(2, '0');
    if ($('#manual-start')) $('#manual-start').value = `${prevH}:${prevM}`;
    recalculateManualMinutesFromTimes();
  });

  $('#btn-reminder-stop')?.addEventListener('click', () => {
    closeReminderModal();
    $('#btn-timer-stop')?.click();
  });

  // --- App Initialization ---
  function checkSSOAvailable() {
    const dreToken = localStorage.getItem('dre_token') || sessionStorage.getItem('dre_token');
    const ssoBox = $('#box-sso-detected');
    if (ssoBox) {
      ssoBox.style.display = dreToken ? 'block' : 'none';
    }
  }

  async function initApp() {
    let token = localStorage.getItem('timestudio_token');

    // Se não há token do Time Studio, verifica se temos um token DRE Jurídico para SSO silencioso
    if (!token) {
      const dreToken = localStorage.getItem('dre_token') || sessionStorage.getItem('dre_token');
      if (dreToken) {
        try {
          const ssoRes = await api('/auth/sso', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${dreToken}` }
          });
          if (ssoRes && ssoRes.token) {
            token = ssoRes.token;
            localStorage.setItem('timestudio_token', token);
            if (ssoRes.professional) {
              localStorage.setItem('timestudio_user', JSON.stringify(ssoRes.professional));
            }
          }
        } catch (ssoEx) {
          console.warn('Silent SSO could not be completed:', ssoEx);
        }
      }
    }

    if (!token) {
      showScreen('screen-login');
      checkSSOAvailable();
      return;
    }

    try {
      const me = await api('/me');
      user = me.professional;
      contracts = me.contracts || [];
      try {
        localStorage.setItem('timestudio_user', JSON.stringify(user));
        localStorage.setItem('timestudio_contracts', JSON.stringify(contracts));
      } catch (e) {}
    } catch (err) {
      console.warn('Tentando recuperar perfil de usuário em cache:', err);
      const cachedUser = localStorage.getItem('timestudio_user');
      if (cachedUser) {
        user = JSON.parse(cachedUser);
        contracts = JSON.parse(localStorage.getItem('timestudio_contracts') || '[]');
      } else {
        logout();
        return;
      }
    }

    if (!user) {
      logout();
      return;
    }

    $('#hdr-office').textContent = `${user.office_name || 'Almeida Braatz Advocacia'} • ${user.name || 'Advogado'}`;
    $('#btn-logout').style.display = 'inline-block';

    renderContractsSelects();
    renderReminderControls();
    renderTimerUI();
    try { loadHistory(); } catch(e){}
    updateQueueBadge();

    // Nenhum contrato fictício inserido

    // Purga cache legado de acao_trabalhista para garantir base comercial 100% limpa
    try {
      const cached = localStorage.getItem('timestudio_contracts');
      if (cached && cached.includes('acao_trabalhista')) {
        localStorage.removeItem('timestudio_contracts');
        contracts = [];
      }
    } catch(e) {}


    // Set manual date default and pre-fill test data
    initManualTimeDefaults(false);
    fillSampleManualData(false);
    fillSampleTimerData(false);

    showScreen('screen-app');
    flushQueue();
  }

  // Start bootstrap
  (async () => {
    updateNetworkStatus();
    updateQueueBadge();
    renderReminderControls();

    // Captura token SSO passado pela URL (?auth= ou ?token=)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const authQ = urlParams.get('auth') || hashParams.get('auth') || urlParams.get('token');
      if (authQ) {
        localStorage.setItem('dre_token', authQ);
        // Limpa URL discretamente preservando invite se houver
        const cleanSearch = urlParams.get('invite') ? `?invite=${encodeURIComponent(urlParams.get('invite'))}` : '';
        window.history.replaceState({}, document.title, window.location.pathname + cleanSearch);
      }
    } catch (e) {}

    const hasInvite = await checkInviteToken();
    if (!hasInvite) {
      initApp();
    }
  })();


  // Global Event Delegation para botões de áudio e testes
  document.addEventListener('click', (e) => {
    const soundBtn = e.target.closest('.btn-sound-choice');
    if (soundBtn) {
      const sType = soundBtn.getAttribute('data-sound');
      if (sType && typeof window.selectChimeSound === 'function') {
        window.selectChimeSound(sType, e);
      }
    }
    const testBtn = e.target.closest('#btn-test-reminder-sound');
    if (testBtn) {
      if (typeof window.testChimeSound === 'function') {
        window.testChimeSound(e);
      }
    }
  });

  // Garante renderização da UI sonora ao inicializar
  try {
    if (typeof renderSoundChoiceUI === 'function') renderSoundChoiceUI();
  } catch (e) {}

})();
