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
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(reg => console.log('Time Studio SW registrado com sucesso:', reg.scope))
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
    if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/invite')) {
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

  // --- Lembrete Inteligente Anti-Esquecimento (UX/UI) ---
  function getReminderInterval() {
    const val = localStorage.getItem('timestudio_reminder_interval');
    return val !== null ? parseInt(val, 10) : 60; // 60 min default recomendado
  }

  function setReminderInterval(mins) {
    localStorage.setItem('timestudio_reminder_interval', String(mins));
    renderReminderControls();
  }

  function renderReminderControls() {
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

  function playReminderChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Nota 1: Ré (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Nota 2: Lá (880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.18);
      gain2.gain.setValueAtTime(0.12, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.65);
    } catch (e) {
      // Audio não suportado ou bloqueado; fallback silencioso
    }
  }

  function triggerReminderAlert(minutes, st) {
    playReminderChime();

    const contractObj = contracts.find(c => String(c.id) === String(st.contractId));
    const contractTitle = contractObj ? (contractObj.title || contractObj.label) : 'Processo Atendido';
    const actType = st.activityType || 'Atividade Jurídica';

    // 1. Notificação Nativa do Sistema (Web Notification)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('⏱️ Time Studio · Lembrete de Horas', {
          body: `Cronômetro ativo há ${minutes} minuto(s) em "${contractTitle}". Clique para conferir ou pausar.`,
          icon: './icon-192.svg',
          tag: 'timestudio-reminder',
          renotify: true
        });
      } catch (e) {}
    }

    // 2. Modal Flutuante na Interface
    const modal = $('#reminder-modal');
    if (modal) {
      const timeTxt = $('#reminder-modal-time-text');
      if (timeTxt) {
        const hrs = (minutes / 60).toFixed(1);
        timeTxt.textContent = `Sessão ativa há ${minutes} minutos (${hrs}h)`;
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

  // --- Manual Entry Form ---
  $('#form-manual')?.addEventListener('submit', e => {
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
      stage_id: stageId,
      activity_type: activityType,
      start_time: startTime,
      end_time: endTime,
      pause_minutes: pauseMin,
      work_date: date,
      minutes: minutes,
      description: desc
    });

    e.target.reset();
    $('#manual-date').value = new Date().toISOString().slice(0, 10);
    populateStagesForContract('', $('#manual-stage'));

    const feedback = $('#manual-feedback');
    if (feedback) {
      feedback.textContent = `Apontamento de ${minutes} min registrado e adicionado à fila com sucesso!`;
      feedback.style.display = 'block';
      setTimeout(() => feedback.style.display = 'none', 4000);
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
    const found = contracts.find(c => c.id === contractId);
    if (found && found.stages && found.stages.length > 0) {
      stageSelectEl.innerHTML = '<option value="">Selecione a Etapa Processual...</option>' +
        found.stages.map(st => `<option value="${esc(st.id)}">${st.stage_order}. ${esc(st.stage_name)}</option>`).join('');
      stageSelectEl.disabled = false;
    } else {
      stageSelectEl.innerHTML = '<option value="">Sem etapas específicas ou geral</option>';
    }
  }

  function renderContractsSelects() {
    const opts = ['<option value="">Selecione o Contrato / Processo...</option>']
      .concat(contracts.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`))
      .join('');
    if ($('#timer-contract')) {
      $('#timer-contract').innerHTML = opts;
      $('#timer-contract').onchange = e => {
        populateStagesForContract(e.target.value, $('#timer-stage'));
      };
    }
    if ($('#manual-contract')) {
      $('#manual-contract').innerHTML = opts;
      $('#manual-contract').onchange = e => {
        populateStagesForContract(e.target.value, $('#manual-stage'));
      };
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
          localStorage.setItem('timestudio_token', res.token);
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

  // --- Login Form ---
  $('#form-login')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const err = $('#login-error');

    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('timestudio_token', res.token);
      await initApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = 'block';
    }
  });

  // --- Logout ---
  function logout() {
    localStorage.removeItem('timestudio_token');
    user = null;
    contracts = [];
    $('#btn-logout').style.display = 'none';
    $('#hdr-office').textContent = 'DRE Jurídico';
    showScreen('screen-login');
  }
  $('#btn-logout')?.addEventListener('click', logout);


  // Wire reminder interval selector buttons
  $$('.btn-reminder-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const interval = parseInt(btn.dataset.interval, 10);
      setReminderInterval(interval);
      requestNotificationPermission();
    });
  });

  $('#btn-reminder-continue')?.addEventListener('click', () => {
    closeReminderModal();
  });

  $('#btn-reminder-stop')?.addEventListener('click', () => {
    closeReminderModal();
    $('#btn-timer-stop')?.click();
  });

  // --- App Initialization ---
  async function initApp() {
    const token = localStorage.getItem('timestudio_token');
    if (!token) {
      showScreen('screen-login');
      return;
    }

    try {
      const me = await api('/me');
      user = me.professional;
      contracts = me.contracts;

      $('#hdr-office').textContent = `${user.office_name} · ${user.name}`;
      $('#btn-logout').style.display = 'inline-block';

      renderContractsSelects();
      renderReminderControls();
      renderTimerUI();
      loadHistory();
      updateQueueBadge();

      // Set manual date default
      if ($('#manual-date')) {
        $('#manual-date').value = new Date().toISOString().slice(0, 10);
      }

      showScreen('screen-app');
      flushQueue();
    } catch (err) {
      console.warn('Erro na autenticação Time Studio:', err);
      logout();
    }
  }

  // Start bootstrap
  (async () => {
    updateNetworkStatus();
    updateQueueBadge();
    renderReminderControls();
    const hasInvite = await checkInviteToken();
    if (!hasInvite) {
      initApp();
    }
  })();

})();
