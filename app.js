/* ============================================================
   POLLA MUNDIALISTA FIFA 2026
   app.js — Lógica principal (vanilla JS, sin frameworks)
   Zona horaria: America/Guayaquil (UTC-5)
   ============================================================ */

'use strict';

// ============================================================
// 1. CREDENCIALES (hardcoded — uso casual entre amigos)
// ============================================================
const CREDENTIALS = {
  Paty:  { password: 'Paty#2026',       role: 'jugador' },
  Jenn:  { password: 'Jenn#mvp7',       role: 'jugador' },
  Marce: { password: 'Marce#gol9',      role: 'jugador' },
  Gabo:  { password: 'Gabo#cup4',       role: 'jugador' },
  David: { password: 'David#net5',      role: 'jugador' },
  Alex:  { password: 'Alex#win8',       role: 'jugador' },
  Mauri: { password: 'Mauri#top3',      role: 'jugador' },
  Rick:  { password: 'Rick#fifa6',      role: 'jugador' },
  admin: { password: 'Admin#Polla2026!', role: 'admin'   },
};

const PLAYERS = Object.keys(CREDENTIALS).filter(k => CREDENTIALS[k].role === 'jugador');

const ROUNDS = [
  { key: 'dieciseisavos', label: '16avos de Final' },
  { key: 'octavos',       label: 'Octavos de Final' },
  { key: 'cuartos',       label: 'Cuartos de Final' },
  { key: 'semifinal',     label: 'Semifinales' },
  { key: 'tercer_puesto', label: 'Tercer Puesto' },
  { key: 'final',         label: 'Final' },
];

const TZ = 'America/Guayaquil'; // UTC-5, sin DST
const LOCK_MINUTES = 5;         // minutos antes del kickoff para cerrar pronósticos

// ============================================================
// 2. ESTADO GLOBAL
// ============================================================
let sb = null;          // cliente Supabase
let currentUser = null; // { name, role }
let matches = [];       // todos los partidos
let myPreds = {};       // { match_id: prediction } — del usuario actual
let allPreds = {};      // { match_id: [predictions] } — todos (solo cerrado/finalizado)
let currentRound = 'dieciseisavos';
let countdownInterval = null;

// ============================================================
// 3. SUPABASE
// ============================================================
function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error('Supabase SDK no cargado');
    return false;
  }
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (e) {
    console.error('Error iniciando Supabase:', e);
    return false;
  }
}

async function dbMatches() {
  const { data, error } = await sb.from('matches').select('*').order('order_index');
  if (error) throw error;
  return data;
}

async function dbMyPreds(userName) {
  const { data, error } = await sb.from('predictions').select('*').eq('user', userName);
  if (error) throw error;
  return data;
}

async function dbAllPreds() {
  const { data, error } = await sb.from('predictions').select('*');
  if (error) throw error;
  return data;
}

async function dbUpsertPred(pred) {
  const { error } = await sb.from('predictions').upsert(pred, { onConflict: 'user,match_id' });
  if (error) throw error;
}

async function dbUpdateMatch(id, updates) {
  const { error } = await sb.from('matches').update(updates).eq('id', id);
  if (error) throw error;
}

// ============================================================
// 4. AUTENTICACIÓN
// ============================================================
function login(name, password) {
  // Buscar el usuario ignorando mayúsculas/minúsculas
  const key = Object.keys(CREDENTIALS).find(k => k.toLowerCase() === name.toLowerCase());
  const cred = key ? CREDENTIALS[key] : null;
  if (!cred || cred.password !== password) return false;
  currentUser = { name: key, role: cred.role }; // usar el nombre con capitalización correcta
  localStorage.setItem('polla_session', JSON.stringify(currentUser));
  return true;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('polla_session');
  showLogin();
}

function restoreSession() {
  try {
    const s = localStorage.getItem('polla_session');
    if (s) {
      const parsed = JSON.parse(s);
      // Verificar que el usuario sigue siendo válido
      if (CREDENTIALS[parsed.name] && CREDENTIALS[parsed.name].role === parsed.role) {
        currentUser = parsed;
        return true;
      }
    }
  } catch (_) {}
  return false;
}

// ============================================================
// 5. TIEMPO / ECUADOR
// ============================================================

/** Convierte una fecha a hora Ecuador y devuelve partes útiles */
function toEcuador(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: TZ }));
}

/** Formatea fecha para mostrar (hora Ecuador) */
function fmtDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('es-EC', {
    timeZone: TZ,
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  }) + ' (EC)';
}

/** Calcula el estado real del partido en tiempo de cliente */
function calcStatus(match) {
  if (match.status === 'finalizado') return 'finalizado';
  if (!match.kickoff_at) return 'proximo';

  const now    = new Date();
  const kickoff = new Date(match.kickoff_at);
  const lockAt  = new Date(kickoff.getTime() - LOCK_MINUTES * 60 * 1000);

  return now >= lockAt ? 'cerrado' : 'proximo';
}

/** True si los penales ya están bloqueados (kickoff + 155 min) o partido finalizado */
function isPenLocked(match) {
  if (match.status === 'finalizado') return true;
  if (!match.kickoff_at) return false;
  const penLockAt = new Date(new Date(match.kickoff_at).getTime() + 155 * 60 * 1000);
  return new Date() >= penLockAt;
}

/** Milisegundos hasta el lock (kickoff - 5 min) */
function msToLock(match) {
  if (!match.kickoff_at) return Infinity;
  const kickoff = new Date(match.kickoff_at);
  const lockAt  = new Date(kickoff.getTime() - LOCK_MINUTES * 60 * 1000);
  return lockAt.getTime() - Date.now();
}

/** Formatea ms a string HH:MM:SS o D días */
function fmtCountdown(ms) {
  if (ms <= 0) return '¡Cerrado!';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ============================================================
// 6. PUNTAJE — función aislada y parametrizable
// ============================================================

/**
 * Calcula los puntos de un pronóstico dado el resultado oficial.
 *
 * Reglas:
 *  1. Goles acertados: min(pred_home, res_home) + min(pred_away, res_away), c/u vale 0.5 pts
 *  2. Ganador acertado: +1 (solo partidos sin empate)
 *  3. Marcador exacto: +1 (si pred_home === result_home Y pred_away === result_away)
 *  4. Empate acertado: +1 (independiente de penales — si pred fue empate y el partido fue a penales)
 *  5. Ganador en penales: +1 (cualquier jugador que acierte el equipo ganador en penales)
 *  6. Penales exactos: +1 (cualquier jugador que acierte el marcador exacto de penales)
 *
 * @param {object} pred   — { pred_home, pred_away, pred_pen_home, pred_pen_away }
 * @param {object} match  — { result_home, result_away, is_draw, pen_home, pen_away }
 * @returns {number} puntos (puede ser decimal, ej. 1.5)
 */
function calcularPuntos(pred, match) {
  // Requiere resultado cargado
  if (match.result_home === null || match.result_home === undefined) return 0;

  let pts = 0;

  // Regla 1 — Goles acertados
  const golesAcertados =
    Math.min(pred.pred_home, match.result_home) +
    Math.min(pred.pred_away, match.result_away);
  pts += golesAcertados * 0.5;

  // Regla 3 — Marcador exacto
  if (pred.pred_home === match.result_home && pred.pred_away === match.result_away) {
    pts += 1;
  }

  const realEmpate = !!match.is_draw;
  const predEmpate = pred.pred_home === pred.pred_away;

  if (realEmpate) {
    // Regla 3 — Empate acertado (independiente de penales)
    if (predEmpate) pts += 1;

    // Reglas 4 y 5 — Penales (cualquier jugador)
    const hasPredPen =
      pred.pred_pen_home !== null && pred.pred_pen_home !== undefined &&
      pred.pred_pen_away !== null && pred.pred_pen_away !== undefined &&
      pred.pred_pen_home !== pred.pred_pen_away;
    if (hasPredPen && match.pen_home !== null && match.pen_away !== null) {
      const realPenWinner = match.pen_home > match.pen_away ? 'home' : 'away';
      const predPenWinner = pred.pred_pen_home > pred.pred_pen_away ? 'home' : 'away';
      if (predPenWinner === realPenWinner) {
        pts += 1; // Regla 4 — ganador penales
        if (pred.pred_pen_home === match.pen_home && pred.pred_pen_away === match.pen_away) {
          pts += 1; // Regla 5 — marcador exacto penales
        }
      }
    }
  } else {
    // Regla 2 — Ganador acertado
    const realWinner = match.result_home > match.result_away ? 'home' : 'away';
    const predWinner = !predEmpate
      ? (pred.pred_home > pred.pred_away ? 'home' : 'away')
      : null;
    if (predWinner === realWinner) pts += 1;
  }

  return pts;
}

// ============================================================
// 7. CARGA DE DATOS
// ============================================================
async function loadData() {
  matches = await dbMatches();

  // Cargar pronósticos propios
  if (currentUser.role === 'jugador') {
    const preds = await dbMyPreds(currentUser.name);
    myPreds = {};
    for (const p of preds) myPreds[p.match_id] = p;
  }

  // Cargar todos los pronósticos (para partidos cerrados/finalizados)
  const all = await dbAllPreds();
  allPreds = {};
  for (const p of all) {
    if (!allPreds[p.match_id]) allPreds[p.match_id] = [];
    allPreds[p.match_id].push(p);
  }
}

// ============================================================
// 8. RECALCULAR PUNTOS DE UN PARTIDO
// ============================================================
async function recalcularPuntajePartido(matchId) {
  const match = matches.find(m => m.id === matchId);
  if (!match || match.result_home === null) return;

  const preds = allPreds[matchId] || [];
  for (const pred of preds) {
    const pts = calcularPuntos(pred, match);
    await sb.from('predictions').update({ points: pts }).eq('id', pred.id);
    pred.points = pts;
  }
  // Actualizar myPreds si aplica
  if (myPreds[matchId]) {
    myPreds[matchId].points = calcularPuntos(myPreds[matchId], match);
  }
}

// ============================================================
// 9. TABLA DE POSICIONES (calculada desde allPreds)
// ============================================================
function calcStandings() {
  const totals = {};
  for (const player of PLAYERS) totals[player] = 0;
  for (const matchId in allPreds) {
    for (const pred of allPreds[matchId]) {
      if (PLAYERS.includes(pred.user)) {
        totals[pred.user] = (totals[pred.user] || 0) + (pred.points || 0);
      }
    }
  }
  return Object.entries(totals)
    .map(([name, pts]) => ({ name, pts }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
}

// ============================================================
// 10. AVANZAR BRACKET (admin: al guardar resultado)
// ============================================================
async function advanceBracket(match) {
  // Determinar ganador y perdedor
  let winner, loser;
  if (match.is_draw) {
    winner = match.pen_home > match.pen_away ? match.team_home : match.team_away;
    loser  = winner === match.team_home ? match.team_away : match.team_home;
  } else {
    winner = match.result_home > match.result_away ? match.team_home : match.team_away;
    loser  = winner === match.team_home ? match.team_away : match.team_home;
  }

  const updates = [];

  // Avanzar ganador al siguiente partido
  if (match.next_match_id && match.next_slot) {
    const field = match.next_slot === 'home' ? 'team_home' : 'team_away';
    updates.push(dbUpdateMatch(match.next_match_id, { [field]: winner }));
  }

  // Avanzar perdedor al partido por el tercer puesto (solo SF)
  if (match.round === 'semifinal') {
    const tpSlot = match.id === 'SF-1' ? 'team_home' : 'team_away';
    updates.push(dbUpdateMatch('TP', { [tpSlot]: loser }));
  }

  await Promise.all(updates);

  // Actualizar matches en memoria
  matches = await dbMatches();
}

// ============================================================
// 11. MODAL
// ============================================================
function showModal({ title, body, confirmLabel = 'Confirmar', confirmClass = 'btn-primary' }, onConfirm) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;

  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn  = document.getElementById('modal-cancel');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className   = `btn ${confirmClass}`;

  // Limpiar listeners previos
  const newConfirm = confirmBtn.cloneNode(true);
  const newCancel  = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  newConfirm.addEventListener('click', () => { hideModal(); onConfirm(); });
  newCancel.addEventListener('click',  hideModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); }, { once: true });

  overlay.hidden = false;
}

function hideModal() {
  document.getElementById('modal-overlay').hidden = true;
}

// ============================================================
// 12. TOAST
// ============================================================
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ` ${type}` : '');
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ============================================================
// 13. RENDER — LOGIN
// ============================================================
function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-screen').hidden   = true;
  stopCountdowns();
}

function showApp() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-screen').hidden   = false;

  const headerName = document.getElementById('header-username');
  headerName.textContent = currentUser.name;

  if (currentUser.role === 'admin') {
    document.getElementById('player-view').hidden = true;
    document.getElementById('admin-view').hidden  = false;
    renderAdminRound(currentRound);
    initAdminTabs();
  } else {
    document.getElementById('player-view').hidden = false;
    document.getElementById('admin-view').hidden  = true;
    updateHeaderPoints();
    renderPlayerRound(currentRound);
    initPlayerTabs();
    startCountdowns();
  }
}

function updateHeaderPoints() {
  if (currentUser.role !== 'jugador') return;
  const standings = calcStandings();
  const me = standings.find(s => s.name === currentUser.name);
  const el = document.getElementById('header-points');
  if (me) {
    el.textContent = `${me.pts} pts`;
    el.hidden = false;
  }
}

// ============================================================
// 14. TABS
// ============================================================
function initPlayerTabs() {
  const tabs = document.querySelectorAll('#player-tabs .tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const round = btn.dataset.round;
      currentRound = round;
      if (round === 'standings') renderStandings('player-content');
      else renderPlayerRound(round);
    });
  });
}

function initAdminTabs() {
  const tabs = document.querySelectorAll('#admin-tabs .tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const round = btn.dataset.round;
      currentRound = round;
      if (round === 'standings') renderStandings('admin-content');
      else renderAdminRound(round);
    });
  });
}

// ============================================================
// 15. RENDER — VISTA JUGADOR
// ============================================================
function renderPlayerRound(round) {
  const container = document.getElementById('player-content');
  const roundMatches = matches.filter(m => m.round === round);

  if (roundMatches.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>No hay partidos cargados en esta ronda todavía.</p>
      </div>`;
    return;
  }

  const finalizados = roundMatches
    .filter(m => calcStatus(m) === 'finalizado')
    .sort((a, b) => a.order_index - b.order_index);

  const pendientes = roundMatches
    .filter(m => calcStatus(m) !== 'finalizado')
    .sort((a, b) => {
      const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : Infinity;
      const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : Infinity;
      return ta - tb;
    });

  let html = '';

  if (finalizados.length > 0) {
    html += `<div class="section-label">✔ Finalizados</div>`;
    html += finalizados.map(m => renderMatchCard(m)).join('');
  }

  if (pendientes.length > 0) {
    if (finalizados.length > 0) {
      html += `<div class="section-label">🗓 Próximos</div>`;
    }
    html += pendientes.map(m => renderMatchCard(m)).join('');
  }

  container.innerHTML = html;
  bindMatchCardEvents(container);
}

function renderMatchCard(match) {
  const status    = calcStatus(match);
  const myPred    = myPreds[match.id];
  const predsAll  = allPreds[match.id] || [];
  const homeLabel = match.team_home || '<em class="team-empty">Por definir</em>';
  const awayLabel = match.team_away || '<em class="team-empty">Por definir</em>';

  let statusBadge = '';
  if (status === 'proximo')    statusBadge = '<span class="status-badge proximo">● Próximo</span>';
  if (status === 'cerrado')    statusBadge = '<span class="status-badge cerrado">🔒 Cerrado</span>';
  if (status === 'finalizado') statusBadge = '<span class="status-badge finalizado">✔ Finalizado</span>';

  // Marcador central
  let centerDisplay = '';
  if (status === 'finalizado' && match.result_home !== null) {
    const pen = match.is_draw
      ? `<div class="match-pen-display">Penales: ${match.pen_home} – ${match.pen_away}</div>` : '';
    const winnerName = match.winner || '';
    centerDisplay = `
      <div>
        <div class="match-result-display">${match.result_home} – ${match.result_away}</div>
        ${pen}
        ${winnerName ? `<div style="text-align:center;font-size:.72rem;color:var(--c-gold);margin-top:4px;">🏆 ${winnerName}</div>` : ''}
      </div>`;
  } else {
    centerDisplay = '<span class="match-vs">VS</span>';
  }

  // Countdown
  let timeInfo = '';
  if (status === 'proximo' && match.kickoff_at) {
    const ms = msToLock(match);
    timeInfo = `
      <div class="match-countdown">
        Cierra en: <span class="countdown-value" data-match="${match.id}">${fmtCountdown(ms)}</span>
      </div>
      <div class="match-kickoff">${fmtDateTime(match.kickoff_at)}</div>`;
  } else if (match.kickoff_at) {
    timeInfo = `<div class="match-kickoff">${fmtDateTime(match.kickoff_at)}</div>`;
  }

  // Sección de pronóstico
  const penLocked = isPenLocked(match);
  let predSection = '';
  if (status === 'proximo') {
    predSection = renderPredInput(match, myPred, false, false);
  } else if (status === 'cerrado') {
    predSection = renderPredInput(match, myPred, true, penLocked);
  }

  // Mostrar todos los pronósticos cuando está cerrado o finalizado
  let allPredsHtml = '';
  if (status === 'cerrado' || status === 'finalizado') {
    allPredsHtml = renderAllPreds(match, predsAll, status);
  }

  return `
    <div class="match-card" id="card-${match.id}">
      <div class="match-header">
        <span class="match-id">${match.id}</span>
        ${statusBadge}
      </div>
      <div class="match-teams">
        <div class="team-name team-home">${homeLabel}</div>
        ${centerDisplay}
        <div class="team-name team-away">${awayLabel}</div>
      </div>
      ${timeInfo}
      ${predSection}
      ${allPredsHtml}
    </div>`;
}

function renderPredInput(match, myPred, locked, penLocked) {
  const ph  = myPred ? myPred.pred_home  : '';
  const pa  = myPred ? myPred.pred_away  : '';
  const pph = myPred ? (myPred.pred_pen_home ?? '') : '';
  const ppa = myPred ? (myPred.pred_pen_away ?? '') : '';

  const dis    = locked    ? ' disabled' : '';
  const disPen = penLocked ? ' disabled' : '';
  const savedHint = myPred ? '<span style="color:var(--c-accent);font-size:.72rem;">✔ Guardado</span>' : '';

  let lockedNotice = '';
  if (locked) {
    lockedNotice = `<div class="locked-notice">🔒 Pronóstico cerrado — el partido está por comenzar</div>`;
  }

  let penNotice = '';
  if (penLocked) {
    penNotice = `<div class="locked-notice" style="margin-top:6px;">🔒 Penales cerrados</div>`;
  } else if (locked) {
    penNotice = `<div style="font-size:.72rem;color:var(--c-orange);margin-bottom:6px;">⏱ Aún puedes editar los penales hasta el min 155</div>`;
  }

  let actionsHtml = '';
  if (!locked) {
    actionsHtml = `
      <div class="pred-actions">
        <button class="btn btn-primary btn-save-pred" data-match="${match.id}">
          Guardar pronóstico
        </button>
      </div>`;
  } else if (!penLocked) {
    actionsHtml = `
      <div class="pred-actions">
        <button class="btn btn-primary btn-save-pen" data-match="${match.id}">
          Guardar penales
        </button>
      </div>`;
  }

  return `
    <div class="prediction-section">
      <h4>Tu pronóstico ${savedHint}</h4>
      ${lockedNotice}
      <div class="score-inputs">
        <div class="score-group">
          <div class="input-label">Local</div>
          <input type="number" min="0" max="20"
            class="score-input pred-home"
            data-match="${match.id}"
            value="${ph}"
            placeholder="0"
            ${dis}>
        </div>
        <span class="score-vs">–</span>
        <div class="score-group">
          <div class="input-label">Visitante</div>
          <input type="number" min="0" max="20"
            class="score-input pred-away"
            data-match="${match.id}"
            value="${pa}"
            placeholder="0"
            ${dis}>
        </div>
      </div>

      <div class="penalty-section pred-pen-section" id="pen-${match.id}">
        <h5>⚽ Penales</h5>
        ${penNotice}
        <div class="score-inputs">
          <div class="score-group">
            <div class="input-label">Local</div>
            <input type="number" min="0" max="20"
              class="score-input pred-pen-home"
              data-match="${match.id}"
              value="${pph}"
              placeholder="0"
              ${disPen}>
          </div>
          <span class="score-vs">–</span>
          <div class="score-group">
            <div class="input-label">Visitante</div>
            <input type="number" min="0" max="20"
              class="score-input pred-pen-away"
              data-match="${match.id}"
              value="${ppa}"
              placeholder="0"
              ${disPen}>
          </div>
        </div>
      </div>

      ${actionsHtml}
    </div>`;
}

function renderAllPreds(match, preds, status) {
  if (preds.length === 0 && status === 'cerrado') {
    return `
      <div class="all-predictions">
        <h4>Pronósticos (${preds.length}/${PLAYERS.length})</h4>
        <p class="no-pred">Nadie ha enviado pronóstico para este partido.</p>
      </div>`;
  }
  if (preds.length === 0) return '';

  const rows = PLAYERS.map(player => {
    const p = preds.find(x => x.user === player);
    const isMe = player === (currentUser ? currentUser.name : '');
    if (!p) {
      return `<tr${isMe ? ' class="current-user"' : ''}>
        <td class="player-name${isMe ? ' player-you' : ''}">${player}${isMe ? ' (tú)' : ''}</td>
        <td class="no-pred" colspan="3">Sin pronóstico</td>
      </tr>`;
    }
    const scoreStr = `${p.pred_home}–${p.pred_away}`;
    const penStr = p.pred_pen_home !== null && p.pred_pen_away !== null
      ? ` (pen ${p.pred_pen_home}–${p.pred_pen_away})` : '';
    const ptsClass = (p.points || 0) === 0 ? 'pred-points-zero' : 'pred-points';
    const ptsVal = status === 'finalizado' ? `${p.points ?? 0}` : '—';
    return `<tr${isMe ? ' class="current-user"' : ''}>
      <td class="player-name${isMe ? ' player-you' : ''}">${player}${isMe ? ' (tú)' : ''}</td>
      <td class="pred-score">${scoreStr}${penStr}</td>
      <td class="${ptsClass}">${ptsVal} pts</td>
    </tr>`;
  });

  return `
    <div class="all-predictions">
      <h4>Pronósticos de todos (${preds.filter(p => PLAYERS.includes(p.user)).length}/${PLAYERS.length})</h4>
      <table class="pred-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Marcador</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

// ============================================================
// 16. BIND DE EVENTOS — TARJETAS JUGADOR
// ============================================================
function bindMatchCardEvents(container) {

  // ── Guardar pronóstico completo (score + penales) ──
  container.querySelectorAll('.btn-save-pred').forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.match;
      const match   = matches.find(m => m.id === matchId);
      const status  = calcStatus(match);

      if (status !== 'proximo') {
        showToast('Este partido ya está cerrado.', 'error');
        return;
      }

      const ph = parseInt(container.querySelector(`.pred-home[data-match="${matchId}"]`).value);
      const pa = parseInt(container.querySelector(`.pred-away[data-match="${matchId}"]`).value);

      if (isNaN(ph) || isNaN(pa) || ph < 0 || pa < 0) {
        showToast('Ingresa marcadores válidos (números ≥ 0).', 'error');
        return;
      }

      let pph = parseInt(container.querySelector(`.pred-pen-home[data-match="${matchId}"]`).value);
      let ppa = parseInt(container.querySelector(`.pred-pen-away[data-match="${matchId}"]`).value);
      if (isNaN(pph) || isNaN(ppa) || pph < 0 || ppa < 0) { pph = null; ppa = null; }

      const homeLabel = match.team_home || 'Local';
      const awayLabel = match.team_away || 'Visitante';
      const penLine = (pph !== null)
        ? `<br>Penales: <strong>${pph} – ${ppa}</strong>` : '';
      const modalBody = `
        <div class="modal-summary">
          <strong>${homeLabel}</strong> ${ph} – ${pa} <strong>${awayLabel}</strong>
          ${penLine}
        </div>
        <p>¿Confirmas tu pronóstico? Podrás editarlo hasta 5 min antes del partido.</p>`;

      showModal(
        { title: 'Confirmar pronóstico', body: modalBody, confirmLabel: 'Guardar' },
        async () => {
          btn.disabled = true;
          try {
            const pred = {
              user: currentUser.name,
              match_id: matchId,
              pred_home: ph,
              pred_away: pa,
              pred_pen_home: pph,
              pred_pen_away: ppa,
              points: 0,
              updated_at: new Date().toISOString(),
            };
            await dbUpsertPred(pred);
            myPreds[matchId] = pred;

            // Refrescar allPreds localmente
            if (!allPreds[matchId]) allPreds[matchId] = [];
            const existIdx = allPreds[matchId].findIndex(p => p.user === currentUser.name);
            if (existIdx >= 0) allPreds[matchId][existIdx] = pred;
            else allPreds[matchId].push(pred);

            updateHeaderPoints();
            renderPlayerRound(currentRound);
            showToast('Pronóstico guardado ✔', 'success');
          } catch (err) {
            console.error(err);
            showToast('Error al guardar. Intenta de nuevo.', 'error');
          } finally {
            btn.disabled = false;
          }
        }
      );
    });
  });

  // ── Guardar solo penales (cuando score ya está cerrado) ──
  container.querySelectorAll('.btn-save-pen').forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.match;
      const match   = matches.find(m => m.id === matchId);

      if (isPenLocked(match)) {
        showToast('El tiempo para editar penales ya cerró.', 'error');
        return;
      }

      let pph = parseInt(container.querySelector(`.pred-pen-home[data-match="${matchId}"]`).value);
      let ppa = parseInt(container.querySelector(`.pred-pen-away[data-match="${matchId}"]`).value);

      if (isNaN(pph) || isNaN(ppa) || pph < 0 || ppa < 0) {
        showToast('Ingresa marcadores de penales válidos.', 'error');
        return;
      }

      const homeLabel = match.team_home || 'Local';
      const awayLabel = match.team_away || 'Visitante';
      const modalBody = `
        <div class="modal-summary">
          Penales: <strong>${homeLabel} ${pph} – ${ppa} ${awayLabel}</strong>
        </div>
        <p>¿Confirmas tu pronóstico de penales?</p>`;

      showModal(
        { title: 'Confirmar penales', body: modalBody, confirmLabel: 'Guardar' },
        async () => {
          btn.disabled = true;
          try {
            const existing = myPreds[matchId] || {};
            const pred = {
              user: currentUser.name,
              match_id: matchId,
              pred_home:     existing.pred_home     ?? null,
              pred_away:     existing.pred_away     ?? null,
              pred_pen_home: pph,
              pred_pen_away: ppa,
              points:        existing.points        ?? 0,
              updated_at:    new Date().toISOString(),
            };
            await dbUpsertPred(pred);
            myPreds[matchId] = { ...existing, ...pred };

            if (!allPreds[matchId]) allPreds[matchId] = [];
            const existIdx = allPreds[matchId].findIndex(p => p.user === currentUser.name);
            if (existIdx >= 0) allPreds[matchId][existIdx] = myPreds[matchId];
            else allPreds[matchId].push(myPreds[matchId]);

            renderPlayerRound(currentRound);
            showToast('Penales guardados ✔', 'success');
          } catch (err) {
            console.error(err);
            showToast('Error al guardar. Intenta de nuevo.', 'error');
          } finally {
            btn.disabled = false;
          }
        }
      );
    });
  });
}

// ============================================================
// 17. TABLA DE POSICIONES
// ============================================================
function renderStandings(containerId) {
  const container = document.getElementById(containerId);
  const standings = calcStandings();
  const me = currentUser.name;

  const rows = standings.map((s, i) => {
    const pos = i + 1;
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    const isMe = s.name === me;
    return `<tr>
      <td class="pos ${posClass}">${pos}</td>
      <td class="player-name${isMe ? ' player-you' : ''}">${s.name}${isMe ? ' ⭐' : ''}</td>
      <td class="pts">${s.pts}</td>
    </tr>`;
  });

  container.innerHTML = `
    <div class="standings-card">
      <h2>🏅 Tabla de Posiciones</h2>
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th style="text-align:right">Pts</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

// ============================================================
// 18. RENDER — VISTA ADMIN
// ============================================================
function renderAdminRound(round) {
  const container = document.getElementById('admin-content');
  const roundMatches = matches.filter(m => m.round === round)
    .sort((a, b) => a.order_index - b.order_index);

  if (roundMatches.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>No hay partidos en esta ronda. Ejecuta el SQL inicial en Supabase.</p>
      </div>`;
    return;
  }

  container.innerHTML = roundMatches.map(m => renderAdminCard(m)).join('');
  bindAdminCardEvents(container);
}

function renderAdminCard(match) {
  const status = calcStatus(match);

  let statusBadge = '';
  if (status === 'proximo')    statusBadge = '<span class="status-badge proximo">● Próximo</span>';
  if (status === 'cerrado')    statusBadge = '<span class="status-badge cerrado">🔒 Cerrado</span>';
  if (status === 'finalizado') statusBadge = '<span class="status-badge finalizado">✔ Finalizado</span>';

  const resultSection = renderAdminResultSection(match, status);

  // Resultado actual si está finalizado
  let currentResult = '';
  if (status === 'finalizado' && match.result_home !== null) {
    const pen = match.is_draw
      ? ` | Pen: ${match.pen_home}–${match.pen_away}` : '';
    currentResult = `
      <div style="margin-bottom:10px;">
        <span class="result-tag">
          ✔ ${match.result_home}–${match.result_away}${pen} · Avanza: ${match.winner || '—'}
        </span>
      </div>`;
  }

  return `
    <div class="admin-card" id="admin-card-${match.id}">
      <div class="admin-card-header">
        <span class="match-id">${match.id}</span>
        ${statusBadge}
      </div>
      <div class="admin-card-body">
        <!-- Equipos y fecha -->
        <div class="admin-row">
          <div>
            <div class="lbl">Equipo Local</div>
            <input type="text" class="admin-home-team" data-match="${match.id}"
              value="${match.team_home || ''}" placeholder="País local">
          </div>
          <div class="vs-sep">VS</div>
          <div>
            <div class="lbl">Equipo Visitante</div>
            <input type="text" class="admin-away-team" data-match="${match.id}"
              value="${match.team_away || ''}" placeholder="País visitante">
          </div>
        </div>
        <div class="admin-field">
          <label>Fecha y hora del partido (hora Ecuador)</label>
          <input type="datetime-local" class="admin-kickoff" data-match="${match.id}"
            value="${match.kickoff_at ? toLocalDatetimeInput(match.kickoff_at) : ''}">
        </div>
        <div class="admin-actions">
          <button class="btn btn-secondary btn-save-match" data-match="${match.id}">
            💾 Guardar equipos / fecha
          </button>
        </div>

        <!-- Resultado oficial -->
        ${currentResult}
        ${status !== 'proximo' ? resultSection : `
          <div style="color:var(--c-muted);font-size:.8rem;margin-top:12px;">
            El resultado se puede cargar una vez que el partido esté cerrado o en curso.
          </div>`}
      </div>
    </div>`;
}

function renderAdminResultSection(match, status) {
  if (status === 'proximo') return '';

  const rh = match.result_home !== null ? match.result_home : '';
  const ra = match.result_away !== null ? match.result_away : '';
  const ph = match.pen_home !== null ? match.pen_home : '';
  const pa = match.pen_away !== null ? match.pen_away : '';
  const isDraw = rh !== '' && ra !== '' && rh === ra;

  return `
    <div class="admin-result-section" style="margin-top:12px;">
      <h4>⚽ Resultado Oficial (tras prórroga si aplica)</h4>
      <div class="admin-row">
        <div>
          <div class="lbl">${match.team_home || 'Local'}</div>
          <input type="number" min="0" max="20"
            class="score-input admin-result-home"
            data-match="${match.id}"
            value="${rh}" placeholder="0">
        </div>
        <div class="vs-sep">–</div>
        <div>
          <div class="lbl">${match.team_away || 'Visitante'}</div>
          <input type="number" min="0" max="20"
            class="score-input admin-result-away"
            data-match="${match.id}"
            value="${ra}" placeholder="0">
        </div>
      </div>

      <div class="penalty-section admin-pen-section${isDraw ? '' : ' hidden'}" id="admin-pen-${match.id}">
        <h5>⚽ Marcador de Penales</h5>
        <div class="admin-row">
          <div>
            <div class="lbl">${match.team_home || 'Local'}</div>
            <input type="number" min="0" max="20"
              class="score-input admin-pen-home"
              data-match="${match.id}"
              value="${ph}" placeholder="0">
          </div>
          <div class="vs-sep">–</div>
          <div>
            <div class="lbl">${match.team_away || 'Visitante'}</div>
            <input type="number" min="0" max="20"
              class="score-input admin-pen-away"
              data-match="${match.id}"
              value="${pa}" placeholder="0">
          </div>
        </div>
      </div>

      <div class="admin-actions" style="margin-top:8px;">
        <button class="btn btn-gold btn-save-result" data-match="${match.id}">
          📋 Cargar resultado
        </button>
      </div>
    </div>`;
}

/** Convierte timestamptz a string para datetime-local (hora Ecuador) */
function toLocalDatetimeInput(isoStr) {
  const d = new Date(isoStr);
  // Convertir a hora Ecuador
  const ecStr = d.toLocaleString('sv-SE', { timeZone: TZ }); // 'sv-SE' da formato YYYY-MM-DD HH:MM:SS
  return ecStr.substring(0, 16); // YYYY-MM-DDTHH:MM... necesitamos HH:MM
}

// ============================================================
// 19. BIND DE EVENTOS — ADMIN
// ============================================================
function bindAdminCardEvents(container) {
  // Detectar empate en resultado para mostrar penales
  container.querySelectorAll('.admin-result-home, .admin-result-away').forEach(input => {
    input.addEventListener('input', () => {
      const matchId = input.dataset.match;
      const rh = container.querySelector(`.admin-result-home[data-match="${matchId}"]`).value;
      const ra = container.querySelector(`.admin-result-away[data-match="${matchId}"]`).value;
      const penSec = document.getElementById(`admin-pen-${matchId}`);
      if (penSec) {
        const isDraw = rh !== '' && ra !== '' && rh === ra;
        penSec.hidden = !isDraw;
      }
    });
  });

  // Guardar equipos / fecha
  container.querySelectorAll('.btn-save-match').forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId  = btn.dataset.match;
      const homeTeam = container.querySelector(`.admin-home-team[data-match="${matchId}"]`).value.trim();
      const awayTeam = container.querySelector(`.admin-away-team[data-match="${matchId}"]`).value.trim();
      const kickoffLocal = container.querySelector(`.admin-kickoff[data-match="${matchId}"]`).value;

      // Convertir datetime-local (hora Ecuador) a UTC para guardar
      let kickoff_at = null;
      if (kickoffLocal) {
        // El input datetime-local está en hora Ecuador; necesitamos convertir a UTC
        // UTC = Ecuador + 5h
        const localDate = new Date(kickoffLocal + ':00'); // trata como local del browser
        // Sin embargo, debemos tratarlo como hora Ecuador (UTC-5)
        // Más confiable: parsear manualmente
        const [datePart, timePart] = kickoffLocal.split('T');
        const [y, mo, d] = datePart.split('-').map(Number);
        const [h, mi] = timePart.split(':').map(Number);
        // Ecuador = UTC-5, así que UTC = hora_ecuador + 5
        const utcDate = new Date(Date.UTC(y, mo - 1, d, h + 5, mi));
        kickoff_at = utcDate.toISOString();
      }

      btn.disabled = true;
      try {
        const updates = { team_home: homeTeam, team_away: awayTeam };
        if (kickoff_at) updates.kickoff_at = kickoff_at;
        await dbUpdateMatch(matchId, updates);
        // Actualizar en memoria
        const m = matches.find(x => x.id === matchId);
        Object.assign(m, updates);
        showToast('Partido actualizado ✔', 'success');
        renderAdminRound(currentRound);
      } catch (err) {
        console.error(err);
        showToast('Error al guardar.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Cargar resultado oficial
  container.querySelectorAll('.btn-save-result').forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.match;
      const match   = matches.find(m => m.id === matchId);

      const rh = parseInt(container.querySelector(`.admin-result-home[data-match="${matchId}"]`).value);
      const ra = parseInt(container.querySelector(`.admin-result-away[data-match="${matchId}"]`).value);

      if (isNaN(rh) || isNaN(ra) || rh < 0 || ra < 0) {
        showToast('Ingresa marcadores válidos.', 'error');
        return;
      }

      const isDraw = rh === ra;
      let ph = null, pa = null, winner = '';

      if (isDraw) {
        const penSec = document.getElementById(`admin-pen-${matchId}`);
        if (!penSec || penSec.hidden) {
          showToast('El partido terminó en empate. Ingresa el marcador de penales.', 'error');
          if (penSec) penSec.hidden = false;
          return;
        }
        ph = parseInt(container.querySelector(`.admin-pen-home[data-match="${matchId}"]`).value);
        pa = parseInt(container.querySelector(`.admin-pen-away[data-match="${matchId}"]`).value);
        if (isNaN(ph) || isNaN(pa) || ph < 0 || pa < 0 || ph === pa) {
          showToast('Ingresa penales válidos (deben ser distintos).', 'error');
          return;
        }
        winner = ph > pa ? (match.team_home || 'Local') : (match.team_away || 'Visitante');
      } else {
        winner = rh > ra ? (match.team_home || 'Local') : (match.team_away || 'Visitante');
      }

      const loser = winner === (match.team_home || 'Local')
        ? (match.team_away || 'Visitante')
        : (match.team_home || 'Local');

      const penLine = isDraw
        ? `<br>Penales: <strong>${match.team_home || 'Local'} ${ph} – ${pa} ${match.team_away || 'Visitante'}</strong>` : '';
      const nextLine = match.next_match_id
        ? `<br>Avanza a <strong>${match.next_match_id}</strong> (${match.next_slot === 'home' ? 'local' : 'visitante'})` : '';
      const tpLine = match.round === 'semifinal'
        ? `<br>Perdedor <strong>${loser}</strong> va a partido por 3er puesto` : '';

      const modalBody = `
        <div class="modal-summary">
          <strong>${match.team_home || 'Local'}</strong> ${rh} – ${ra} <strong>${match.team_away || 'Visitante'}</strong>
          ${penLine}
          <br><span class="winner-line">🏆 Avanza: ${winner}</span>
          ${nextLine}
          ${tpLine}
        </div>
        <p>¿Estás de acuerdo en guardar este resultado?</p>`;

      showModal(
        { title: 'Confirmar resultado', body: modalBody, confirmLabel: '✔ Guardar resultado', confirmClass: 'btn-gold' },
        async () => {
          btn.disabled = true;
          try {
            const updates = {
              result_home: rh,
              result_away: ra,
              is_draw: isDraw,
              pen_home: isDraw ? ph : null,
              pen_away: isDraw ? pa : null,
              winner,
              status: 'finalizado',
            };
            await dbUpdateMatch(matchId, updates);
            Object.assign(match, updates);

            // Refrescar allPreds
            const all = await dbAllPreds();
            allPreds = {};
            for (const p of all) {
              if (!allPreds[p.match_id]) allPreds[p.match_id] = [];
              allPreds[p.match_id].push(p);
            }

            // Recalcular puntos
            await recalcularPuntajePartido(matchId);

            // Avanzar bracket
            await advanceBracket(match);

            showToast('Resultado guardado y puntos actualizados ✔', 'success');
            renderAdminRound(currentRound);
          } catch (err) {
            console.error(err);
            showToast('Error al guardar resultado.', 'error');
          } finally {
            btn.disabled = false;
          }
        }
      );
    });
  });
}

// ============================================================
// 20. COUNTDOWNS (actualiza cada segundo)
// ============================================================
function startCountdowns() {
  stopCountdowns();
  countdownInterval = setInterval(tickCountdowns, 1000);
}

function stopCountdowns() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function tickCountdowns() {
  const nowTick = Date.now();
  document.querySelectorAll('.countdown-value[data-match]').forEach(el => {
    const matchId = el.dataset.match;
    const match   = matches.find(m => m.id === matchId);
    if (!match) return;
    const ms = msToLock(match);
    el.textContent = fmtCountdown(ms);
    // Si llegó a 0, refresca el card
    if (ms <= 0) {
      renderPlayerRound(currentRound);
    }
  });
}

// ============================================================
// 21. LOGIN FORM
// ============================================================
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('input-user').value.trim();
  const password = document.getElementById('input-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!login(username, password)) {
    errEl.textContent = 'Usuario o contraseña incorrectos.';
    return;
  }

  // Mostrar loading
  document.getElementById('login-screen').innerHTML = `
    <div class="loading-wrap" style="min-height:100vh">
      <div class="spinner"></div>
      <p>Cargando datos...</p>
    </div>`;

  try {
    if (!initSupabase()) throw new Error('No se pudo inicializar Supabase. Revisa config.js.');
    await loadData();
    showApp();
  } catch (err) {
    console.error(err);
    // Restaurar la pantalla de login con mensaje de error
    document.body.innerHTML = '';
    location.reload();
  }
});

// ============================================================
// 22. LOGOUT
// ============================================================
document.getElementById('logout-btn').addEventListener('click', () => {
  showModal(
    { title: 'Cerrar sesión', body: '<p>¿Seguro que quieres salir?</p>', confirmLabel: 'Salir', confirmClass: 'btn-danger' },
    logout
  );
});

// ============================================================
// 23. INICIALIZACIÓN
// ============================================================
async function init() {
  // Intentar restaurar sesión
  if (restoreSession()) {
    document.getElementById('login-screen').innerHTML = `
      <div class="loading-wrap" style="min-height:100vh">
        <div class="spinner"></div>
        <p>Cargando sesión...</p>
      </div>`;
    try {
      if (!initSupabase()) throw new Error('Supabase no disponible');
      await loadData();
      showApp();
    } catch (err) {
      console.error('Error al restaurar sesión:', err);
      currentUser = null;
      localStorage.removeItem('polla_session');
      location.reload();
    }
  }
  // Si no hay sesión, la pantalla de login ya está visible por defecto
}

// Arrancar al cargar la página
window.addEventListener('load', init);
