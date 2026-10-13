import { STORE_KEY, DAYS, DAY_META, DEFAULT_PROGRAM, clone, newState, suggestedDay, previousExercise, makeDraft, completedSets, totalSets, finishSession, exerciseDelta, formatLogs, validateState, migrateState, PROGRAM_REVISION, sessionTitle, finishersComplete, finisherBest, atTopOfRange } from './model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = newState();
let storageBlocked = false;
let lastSaveSucceeded = true;
let day = suggestedDay();
let view = 'workout';
let previewDraft;
let toastTimer;
let routineUpdated = false;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function warning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = false; }
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) { const loaded = validateState(JSON.parse(raw)); routineUpdated = loaded.programRevision !== PROGRAM_REVISION; state = migrateState(loaded); if (routineUpdated) save(); }
} catch {
  storageBlocked = true;
  lastSaveSucceeded = false;
  warning('Your saved data could not be loaded. Existing storage will not be overwritten. Export any current work, then use Restore backup in Settings to recover a valid backup.');
}

function save() {
  if (storageBlocked) { lastSaveSucceeded = false; return false; }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); lastSaveSucceeded = true; $('#storage-warning').hidden = true; return true; }
  catch { lastSaveSucceeded = false; warning('This browser could not save your workout. Keep this page open and export a backup from Settings.'); return false; }
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function draft() {
  if (state.drafts[day]) return state.drafts[day];
  if (!previewDraft || previewDraft.day !== day) previewDraft = makeDraft(state, day);
  return previewDraft;
}
function mutableDraft() {
  if (!state.drafts[day]) { state.drafts[day] = clone(draft()); state.drafts[day].startedAt = new Date().toISOString(); }
  return state.drafts[day];
}
function setView(next) {
  view = next;
  for (const item of ['workout', 'history']) {
    const button = $(`#${item}-nav`); button.classList.toggle('active', view === item);
    if (view === item) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function render() { view === 'history' ? renderHistory() : renderWorkout(); }
function inputMarkup(ex, ei, si, field, label) {
  return `<input class="rep-input" inputmode="numeric" type="number" min="0" max="9999" step="1" value="${ex.logs[si][field]}" data-ex="${ei}" data-set="${si}" data-field="${field}" aria-label="${escape(ex.name)} set ${si + 1} ${label}">`;
}
function renderWorkout() {
  const session = draft(); const meta = DAY_META[day];
  $('#main').innerHTML = `<section class="hero"><p class="eyebrow">20 lb kettlebell · bar · mat</p><h1>${meta.title}<span style="color:var(--green)">.</span></h1><p class="subheading">${meta.subtitle}</p><p class="session-time">${meta.day} · ${meta.time}</p></section>
  <div class="split-tabs" aria-label="Workout split">${DAYS.map(d => `<button class="split-tab" data-day="${d}" aria-pressed="${d === day}">${DAY_META[d].short}<small>${d === 'push' ? 'Hard' : d === 'pull' ? 'Balanced' : 'Fun'}</small></button>`).join('')}</div>
  <div class="session-status"><span id="set-count"></span><span id="save-status"></span></div><div class="progress-track" role="progressbar" aria-label="Completed sets" aria-valuemin="0" aria-valuemax="${totalSets(session)}" aria-valuenow="${completedSets(session)}"><span></span></div>
  <div id="exercise-list">${session.exercises.map((ex, ei) => {
    const previous = previousExercise(state, day, ex);
    const group = ex.group || (ex.finisher ? 'finisher' : 'A');
    const groupStart = ei === 0 || (session.exercises[ei - 1].group || (session.exercises[ei - 1].finisher ? 'finisher' : 'A')) !== group;
    const label = ex.finisher ? '↗' : `${group}${session.exercises.slice(0, ei + 1).filter(item => item.group === group).length}`;
    return `${groupStart ? `<div class="superset-heading"><h2>${group === 'finisher' ? 'Finisher' : `Superset ${group}`}</h2><span>${group === 'finisher' ? 'Required · one effort' : `${Math.max(...session.exercises.filter(item => item.group === group).map(item => item.sets))} rounds · alternate exercises`}</span></div>` : ''}<section class="exercise-card" data-card="${ei}" aria-label="${escape(ex.name)}"><div class="exercise-top"><span class="exercise-number">${label}</span><h2>${escape(ex.name)}</h2></div>
    <p class="target">${ex.sets} ${ex.unit === 'sec' ? (ex.sets === 1 ? 'hold' : 'holds') : ex.sets === 1 ? 'set' : 'sets'} · ${escape(ex.target)}${ex.unit === 'sec' ? ' sec' : /\d/.test(ex.target) ? ' reps' : ''}${ex.sides ? ' / side' : ''}</p>
    <p class="last">${previous ? `Last: ${escape(formatLogs(previous))}${ex.unit === 'sec' ? ' sec' : ''}` : 'First session. Start where you are.'}</p>
    ${ex.finisher ? `<p class="best" data-best="${ei}"></p>` : `<p class="progression" data-progression="${ei}" hidden></p>`}
    ${ex.note ? `<p class="hint">${escape(ex.note)}</p>` : ''}
    ${ex.logs.map((log, si) => `<div class="set-row ${log.done ? 'is-done' : ''}" data-row="${si}"><span class="set-label">${ex.finisher ? ex.unit === 'sec' ? 'Hold' : 'Set' : `R${si + 1}`}</span>${ex.sides ? `<div class="paired-controls"><label class="side-field"><span>L</span>${inputMarkup(ex, ei, si, 'reps', 'left reps')}</label><label class="side-field"><span>R</span>${inputMarkup(ex, ei, si, 'right', 'right reps')}</label></div>` : `<div class="rep-controls"><button class="step" data-step="-1" data-ex="${ei}" data-set="${si}" aria-label="Decrease ${escape(ex.name)} set ${si + 1}">−</button>${inputMarkup(ex, ei, si, 'reps', ex.unit === 'sec' ? 'seconds' : 'reps')}<button class="step" data-step="1" data-ex="${ei}" data-set="${si}" aria-label="Increase ${escape(ex.name)} set ${si + 1}">+</button></div>`}<button class="done-button" data-done data-ex="${ei}" data-set="${si}" aria-pressed="${log.done}" aria-label="${log.done ? 'Unmark' : 'Complete'} ${escape(ex.name)} set ${si + 1}">✓</button></div>`).join('')}
    <p class="delta" data-delta="${ei}" hidden></p></section>`;
  }).join('')}</div>
  <div class="workout-notes"><label for="workout-notes">Workout notes <span>optional</span></label><textarea id="workout-notes" rows="3" maxlength="2000" placeholder="How did it feel? Anything to remember next time?">${escape(session.notes || '')}</textarea></div>
  <div class="finish-area"><button id="finish-button" class="primary-button">Finish workout <span aria-hidden="true">↗</span></button><p class="footnote" id="finish-note">Log both rounds, then your finisher.<br>Progress saves on this device as you go.</p><button id="discard-button" class="text-button">Reset this session</button></div>`;
  updateWorkoutStatus();
}
function updateWorkoutStatus(saved) {
  if (view !== 'workout') return;
  const session = draft(), done = completedSets(session), total = totalSets(session);
  $('#set-count').textContent = `${done} / ${total} sets complete`;
  $('#save-status').innerHTML = storageBlocked || saved === false || !lastSaveSucceeded ? 'Not saved · see warning' : state.drafts[day] ? '<span class="saved-dot"></span>Saved on this device' : 'Ready when you are';
  $('.progress-track').setAttribute('aria-valuenow', done);
  $('.progress-track span').style.width = `${done / total * 100}%`;
  $('#finish-button').disabled = done === 0 || !finishersComplete(session);
  $('#finish-note').textContent = !finishersComplete(session) ? 'Log your scheduled finisher to complete this workout.' : 'Finisher complete. Ready to log your workout.';
  session.exercises.forEach((ex, ei) => {
    if (ex.finisher) {
      const best = finisherBest(state, day, ex), current = ex.logs.filter(log => log.done).reduce((n, log) => Math.max(n, log.reps), -1);
      $(`[data-best="${ei}"]`).textContent = `${best === null ? 'No personal best yet' : `Personal best: ${best} ${ex.unit === 'sec' ? 'sec' : 'reps'}`}${current > (best ?? -1) ? ` · New best today: ${current} ${ex.unit === 'sec' ? 'sec' : 'reps'}` : ''}`;
    } else {
      const guidance = $(`[data-progression="${ei}"]`); guidance.hidden = !atTopOfRange(ex);
      guidance.textContent = 'Top of range reached in both rounds. With good form, try more range of motion, a harder variation, or more resistance next time.';
    }
    const node = $(`[data-delta="${ei}"]`), delta = exerciseDelta(ex, previousExercise(state, day, ex));
    node.hidden = delta === null || delta <= 0;
    if (delta > 0) node.textContent = `↑ ${delta} more ${ex.unit === 'sec' ? 'seconds' : 'reps'} than last session${ex.sides ? ' across both sides' : ''}`;
  });
}
function updateRow(ei, si) {
  const ex = draft().exercises[ei], log = ex.logs[si];
  const row = $(`[data-card="${ei}"] [data-row="${si}"]`);
  row.classList.toggle('is-done', log.done);
  row.querySelectorAll('.rep-input').forEach(input => { input.value = log[input.dataset.field]; });
  const check = row.querySelector('.done-button'); check.setAttribute('aria-pressed', log.done);
  check.setAttribute('aria-label', `${log.done ? 'Unmark' : 'Complete'} ${ex.name} set ${si + 1}`);
  updateWorkoutStatus(save());
}
const formatDate = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
function renderHistory() {
  const week = new Date(); week.setHours(0, 0, 0, 0); week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  const thisWeek = state.history.filter(session => new Date(session.finishedAt) >= week).length;
  $('#main').innerHTML = `<section class="hero"><p class="eyebrow">Every session counts</p><h1>Your history<span style="color:var(--green)">.</span></h1><p class="subheading">Small efforts, adding up.</p></section>
  <div class="history-summary"><div class="stat"><strong>${state.history.length}</strong><small>Workouts logged</small></div><div class="stat"><strong>${thisWeek}</strong><small>This week</small></div></div>
  ${state.history.length ? state.history.slice().reverse().map(session => `<button class="history-item" data-history="${escape(session.id)}"><span class="history-badge" aria-hidden="true">${DAY_META[session.day].symbol}</span><span><strong>${escape(sessionTitle(session))}</strong><small>${formatDate(session.finishedAt)} · ${completedSets(session)} / ${totalSets(session)} sets</small></span><span class="history-chevron" aria-hidden="true">›</span></button>`).join('') : '<div class="empty-state"><div class="empty-symbol" aria-hidden="true">↗</div><h2>Your first chapter starts here.</h2><p>Finish a workout and it will show up here.<br>No streaks to protect. Just progress.</p><button class="secondary-button" data-go-workout>Log a workout</button></div>'}
  ${(state.archivedDrafts || []).length ? `<p class="eyebrow">Earlier unfinished sessions</p>${state.archivedDrafts.slice().reverse().map(session => `<button class="history-item" data-archive="${escape(session.id)}"><span class="history-badge" aria-hidden="true">↶</span><span><strong>${escape(sessionTitle(session))}</strong><small>${formatDate(session.startedAt)} · ${completedSets(session)} sets logged · unfinished</small></span><span class="history-chevron" aria-hidden="true">›</span></button>`).join('')}` : ''}
  <p class="section-note">History stays on this device. Export a backup in Settings every so often.</p>`;
}
function showModal(title, body) {
  $('#modal-content').innerHTML = `<div class="modal-header"><h2>${escape(title)}</h2><button class="close-button" data-close aria-label="Close dialog">×</button></div>${body}`;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() { $('#modal').close(); }
function confirmAction(title, message, label, action) {
  showModal(title, `<p class="modal-copy">${escape(message)}</p><div class="button-row"><button class="secondary-button" data-close>Cancel</button><button class="secondary-button" id="confirm-action">${escape(label)}</button></div>`);
  $('#confirm-action').onclick = () => { closeModal(); action(); };
}
function finish() {
  const current = draft(); if (!completedSets(current) || !finishersComplete(current)) return;
  const commit = () => {
    finishSession(state, day, uuid()); previewDraft = null;
    const saved = save(); render();
    toast(saved ? 'Workout logged. Nicely done.' : 'Workout logged in memory. Export a backup.');
  };
  if (completedSets(current) < totalSets(current)) confirmAction('Finish this workout?', `${completedSets(current)} of ${totalSets(current)} sets are complete. Only checked sets will count; the others will be recorded as skipped.`, 'Finish workout', commit);
  else commit();
}
function showHistory(id, archived = false) {
  const session = (archived ? state.archivedDrafts : state.history).find(item => item.id === id); if (!session) return;
  showModal(sessionTitle(session), `<p class="modal-copy">${formatDate(session.finishedAt || session.startedAt)} · ${completedSets(session)} sets complete${archived ? ' · unfinished session from before the routine update' : ''}</p>
  ${session.exercises.map(ex => `<div class="detail-exercise"><h3>${escape(ex.name)}</h3><p>${escape(formatLogs(ex))}${ex.unit === 'sec' ? ' sec' : ex.sides ? ' reps by side' : ' reps'}${ex.finisher && ex.failure && ex.logs.some(log => log.done) ? ex.unit === 'sec' ? '<br>Form / grip limit reached' : '<br>Technical failure reached' : ''}</p></div>`).join('')}${session.notes?.trim() ? `<div class="detail-exercise"><h3>Workout notes</h3><p class="saved-notes">${escape(session.notes)}</p></div>` : ''}${archived ? '' : '<button class="text-button danger" id="delete-session">Delete this workout</button>'}`);
  if (archived) return;
  $('#delete-session').onclick = () => confirmAction('Delete this workout?', 'This removes the session from your history on this device.', 'Delete workout', () => { state.history = state.history.filter(item => item.id !== id); save(); render(); toast('Workout deleted.'); });
}
function showSettings() {
  showModal('Keep it simple.', `<div class="settings-group"><h3>Your program</h3><div class="button-row">${DAYS.map(d => `<button class="secondary-button" data-edit="${d}">${DAY_META[d].day}</button>`).join('')}</div><p>Edit names, sets, rep targets, or exercise variations. Your completed history stays intact.</p></div>
  <div class="settings-group"><h3>Your data</h3><div class="button-row"><button class="secondary-button" id="export-button">Export backup ↗</button><button class="secondary-button" id="import-button">Restore backup</button><input type="file" id="import-file" accept="application/json,.json" hidden></div><p>No account. No sync. Backups include your program, unfinished sessions, and full history. Restore replaces the data on this device.</p></div>
  <div class="settings-group"><h3>On your Home Screen</h3><p>In Safari, open Share → Add to Home Screen. After the first online load, your installed tracker works offline.</p><p id="offline-status">Checking offline support…</p></div><div class="settings-group"><p>Workout v2 · made for your 20 lb kettlebell, pull-up bar & yoga mat.</p></div>`);
  $('#export-button').onclick = exportBackup;
  $('#import-button').onclick = () => $('#import-file').click();
  $('#import-file').onchange = event => importBackup(event.target.files[0]);
  $('#offline-status').textContent = offlineStatus;
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup exported. Keep it somewhere safe.');
}
async function importBackup(file) {
  if (!file) return;
  let imported;
  try { if (file.size > 20 * 1024 * 1024) throw new Error('This backup is too large (maximum 20 MB).'); imported = migrateState(JSON.parse(await file.text())); }
  catch (error) { showModal('Could not restore', `<p class="import-error">${escape(error instanceof SyntaxError ? 'This file is not valid JSON. Your data has not changed.' : error.message)}</p><button class="secondary-button" id="back-settings">Back to settings</button>`); $('#back-settings').onclick = showSettings; return; }
  confirmAction('Restore this backup?', `Replace this device’s program and history with ${imported.history.length} saved workouts from the backup? Export your current data first if you want to keep it.`, 'Restore backup', () => {
    // Persist before replacing the visible state so a failed write does not discard current work.
    try { localStorage.setItem(STORE_KEY, JSON.stringify(imported)); }
    catch { toast('Could not save the backup. Your current data is unchanged.'); return; }
    state = imported; storageBlocked = false; lastSaveSucceeded = true; previewDraft = null; $('#storage-warning').hidden = true; render(); toast('Backup restored.');
  });
}
function editProgram(editDay) {
  if (state.drafts[editDay]) {
    confirmAction('Unfinished session', 'Editing this routine requires resetting its unfinished session. Your completed history will stay intact.', 'Reset and edit', () => { delete state.drafts[editDay]; previewDraft = null; save(); render(); openEditor(editDay); });
  } else openEditor(editDay);
}
function openEditor(editDay) {
  let editing = clone(state.program[editDay]);
  const collect = () => {
    const fields = [...$('#program-editor').querySelectorAll('.edit-exercise')];
    const collected = fields.map((node, index) => {
      const get = key => node.querySelector(`[data-edit-field="${key}"]`);
      const name = get('name').value.trim(), target = get('target').value.trim(), sets = Number(get('sets').value);
      if (!name || name.length > 100 || !target || !Number.isInteger(sets) || sets < 1 || sets > 10) throw new Error('Each exercise needs a name, a target, and 1–10 sets.');
      const initial = Math.min(9999, Math.max(0, Number(target.match(/\d+/)?.[0] ?? 0)));
      const group = get('group').value, finisher = group === 'finisher';
      return { ...editing[index], name, target, sets: finisher ? 1 : sets, group, finisher, unit: get('unit').value, sides: get('sides').checked, initial: finisher ? 0 : initial };
    });
    if (!collected.some(ex => ex.finisher)) throw new Error('Keep at least one scheduled finisher.');
    return collected;
  };
  const draw = () => {
    showModal(`Edit ${DAY_META[editDay].title.toLowerCase()}`, `<form id="program-editor"><p class="modal-copy">Use the exercise name for variations, such as “Feet-elevated push-ups.” New names start a fresh comparison.</p>
    ${editing.map((ex, i) => `<div class="edit-exercise" data-edit-index="${i}"><label>Exercise<input data-edit-field="name" maxlength="100" required value="${escape(ex.name)}"></label><label>Group<select data-edit-field="group"><option value="A" ${ex.group === 'A' ? 'selected' : ''}>Superset A</option><option value="B" ${ex.group === 'B' ? 'selected' : ''}>Superset B</option><option value="finisher" ${ex.finisher ? 'selected' : ''}>Required finisher</option></select></label><div class="edit-fields"><label>Sets<input data-edit-field="sets" type="number" inputmode="numeric" min="1" max="10" required value="${ex.sets}"></label><label>Target<input data-edit-field="target" maxlength="100" required value="${escape(ex.target)}"></label><label>Unit<select data-edit-field="unit"><option value="reps" ${ex.unit === 'reps' ? 'selected' : ''}>Reps</option><option value="sec" ${ex.unit === 'sec' ? 'selected' : ''}>Seconds</option></select></label></div><div class="edit-actions"><label class="edit-checkbox"><input type="checkbox" data-edit-field="sides" ${ex.sides ? 'checked' : ''}>Track left / right</label><button type="button" class="text-button danger" data-remove="${i}" ${editing.length === 1 || (ex.finisher && editing.filter(item => item.finisher).length === 1) ? 'disabled' : ''}>Remove</button></div></div>`).join('')}
    <p class="import-error" id="editor-error" role="alert" hidden></p><div class="edit-footer"><button type="button" class="secondary-button" id="add-exercise" ${editing.length >= 30 ? 'disabled' : ''}>+ Exercise</button><button class="primary-button" type="submit">Save routine</button></div></form><button class="text-button" id="restore-routine">Restore new M/W/F routine</button>`);
    const attempt = action => { try { editing = collect(); action(); } catch (error) { $('#editor-error').textContent = error.message; $('#editor-error').hidden = false; } };
    $('#program-editor').onsubmit = event => { event.preventDefault(); attempt(() => { state.program[editDay] = editing.sort((a, b) => ['A', 'B', 'finisher'].indexOf(a.group) - ['A', 'B', 'finisher'].indexOf(b.group)); previewDraft = null; const saved = save(); closeModal(); render(); toast(saved ? 'Routine updated.' : 'Routine updated in memory. Export a backup.'); }); };
    $('#add-exercise').onclick = () => attempt(() => { editing.push({ id: uuid(), name: 'New exercise', sets: 2, group: 'B', target: '8–12', initial: 8, unit: 'reps', sides: false, finisher: false, note: '' }); draw(); });
    $('#program-editor').querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => attempt(() => { editing.splice(Number(button.dataset.remove), 1); draw(); }); });
    $('#restore-routine').onclick = () => confirmAction('Restore the new M/W/F routine?', 'Your completed workouts stay intact. This replaces the exercises and targets for this day.', 'Restore routine', () => { state.program[editDay] = clone(DEFAULT_PROGRAM[editDay]); previewDraft = null; save(); render(); toast('M/W/F routine restored.'); });
  };
  draw();
}

$('#main').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.day) { day = button.dataset.day; previewDraft = null; renderWorkout(); }
  else if (button.hasAttribute('data-done')) { const ei = Number(button.dataset.ex), si = Number(button.dataset.set); const ex = mutableDraft().exercises[ei]; ex.logs[si].done = !ex.logs[si].done; updateRow(ei, si); }
  else if (button.dataset.step) { const ei = Number(button.dataset.ex), si = Number(button.dataset.set); const log = mutableDraft().exercises[ei].logs[si]; log.reps = Math.min(9999, Math.max(0, log.reps + Number(button.dataset.step))); updateRow(ei, si); }
  else if (button.id === 'finish-button') finish();
  else if (button.id === 'discard-button') confirmAction('Reset this session?', 'This clears the unfinished sets for this day. Your workout history stays intact.', 'Reset session', () => { delete state.drafts[day]; previewDraft = null; save(); renderWorkout(); });
  else if (button.dataset.history) showHistory(button.dataset.history);
  else if (button.dataset.archive) showHistory(button.dataset.archive, true);
  else if (button.hasAttribute('data-go-workout')) setView('workout');
});
$('#main').addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'workout-notes') { mutableDraft().notes = input.value.slice(0, 2000); updateWorkoutStatus(save()); }
  else if (input.matches('.rep-input')) {
    const raw = input.value;
    if (raw === '') return;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 9999) return;
    mutableDraft().exercises[Number(input.dataset.ex)].logs[Number(input.dataset.set)][input.dataset.field] = value;
    updateWorkoutStatus(save());
  }
});
$('#main').addEventListener('focusout', event => {
  if (event.target.matches('.rep-input')) updateRow(Number(event.target.dataset.ex), Number(event.target.dataset.set));
});
$('#modal-content').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-close')) closeModal();
  if (button.dataset.edit) editProgram(button.dataset.edit);
});
$('#settings-button').onclick = showSettings;
$('#workout-nav').onclick = () => setView('workout');
$('#history-nav').onclick = () => setView('history');
$('.brand').onclick = event => { event.preventDefault(); setView('workout'); };
render();
if (routineUpdated) toast('New M/W/F routine loaded. Earlier workouts kept.');

// Avoid silently overwriting changes made in another tab.
window.addEventListener('storage', event => {
  if (event.key !== STORE_KEY) return;
  try {
    state = event.newValue ? migrateState(JSON.parse(event.newValue)) : newState();
    storageBlocked = false; lastSaveSucceeded = true; previewDraft = null; $('#storage-warning').hidden = true; closeModal(); render(); toast('Updated from another tab.');
  } catch { storageBlocked = true; warning('Saved data changed in another tab and could not be read. Export your current work before restoring a backup.'); }
});

let offlineStatus = 'Offline support is unavailable in this browser.';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(async () => {
    await navigator.serviceWorker.ready;
    offlineStatus = 'Offline ready. Your workouts stay on this device.';
    if ($('#offline-status')) $('#offline-status').textContent = offlineStatus;
  }).catch(() => {
    offlineStatus = 'Offline setup failed. You can still log workouts online; reopen the app online to retry.';
    if ($('#offline-status')) $('#offline-status').textContent = offlineStatus;
  });
}
