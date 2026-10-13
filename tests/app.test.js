// A minimal DOM adapter exercises the actual app event handlers without a browser.
// Real iPhone rendering and Home Screen installation still require device QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as model from '../model.js';

function boot(raw, failWrites = false) {
  const nodes = new Map(), storage = new Map(), windowEvents = {};
  if (raw) storage.set(model.STORE_KEY, raw);
  class Node {
    constructor() { this.innerHTML = ''; this.textContent = ''; this.hidden = false; this.value = ''; this.style = {}; this.dataset = {}; this.events = {}; this.attributes = {}; this.classList = { toggle() {} }; }
    addEventListener(name, handler) { this.events[name] = handler; }
    querySelector(selector) { return node(selector); }
    querySelectorAll() { return []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() { if (this.onclick) this.onclick(); }
    remove() {}
  }
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error('Quota'); storage.set(key, value); } };
  const document = { querySelector: node, createElement: () => new Node(), body: { append() {} } };
  const window = { scrollTo() {}, addEventListener(name, handler) { windowEvents[name] = handler; } };
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import \{([^}]+)\}[^\n]+\n/, 'const {$1} = model;\n');
  vm.runInNewContext(source, { model, document, window, navigator: {}, localStorage, crypto, Blob, URL, setTimeout: () => 0, clearTimeout() {}, console });
  const button = (id, dataset = {}) => ({ id, dataset, hasAttribute: key => key === 'data-done' && 'done' in dataset, closest() { return this; } });
  const click = (id, dataset) => node('#main').events.click({ target: button(id, dataset) });
  const stored = () => JSON.parse(storage.get(model.STORE_KEY));
  return { node, click, stored, storage, windowEvents };
}
test('actual handlers autosave left/right values, switch splits, and finish a partial session', () => {
  const app = boot(); app.click('', { day: 'push' });
  app.click('', { step: '1', ex: '0', set: '0' });
  app.click('', { done: '', ex: '0', set: '0' });
  const input = { value: '11', dataset: { ex: '0', set: '0', field: 'reps' }, matches: selector => selector === '.rep-input' };
  app.node('#main').events.input({ target: input });
  app.click('', { done: '', ex: '1', set: '0' });
  assert.equal(app.stored().drafts.push.exercises[0].logs[0].reps, 11);
  assert.equal(app.stored().drafts.push.exercises[0].logs[0].right, 8);
  app.click('', { day: 'pull' }); app.click('', { done: '', ex: '0', set: '0' });
  app.click('', { day: 'push' }); app.click('', { done: '', ex: '4', set: '0' }); app.click('finish-button');
  assert.equal(app.node('#modal').open, true); app.node('#confirm-action').onclick();
  assert.equal(app.stored().history.length, 1); assert.equal(model.completedSets(app.stored().history[0]), 3);
  assert.ok(app.stored().drafts.pull); assert.equal(app.stored().drafts.push, undefined);
  app.node('#history-nav').onclick(); assert.match(app.node('#main').innerHTML, /3 \/ 9 sets/);
  const reloaded = boot(JSON.stringify(app.stored())); reloaded.click('', { day: 'push' });
  assert.match(reloaded.node('#main').innerHTML, /Last: 11L \/ 8R · —/);
});
test('invalid numeric entries do not corrupt a draft', () => {
  const app = boot(); app.click('', { day: 'push' }); app.click('', { done: '', ex: '0', set: '0' });
  for (const value of ['', '-3', '1.5', '10000']) app.node('#main').events.input({ target: { value, dataset: { ex: '0', set: '0', field: 'reps' }, matches: () => true } });
  assert.equal(app.stored().drafts.push.exercises[0].logs[0].reps, 8);
});
test('corrupt storage is preserved and failed writes remain visible after tab switches', () => {
  const corrupt = boot('invalid JSON'); corrupt.click('', { day: 'push' }); corrupt.click('', { done: '', ex: '0', set: '0' });
  assert.equal(corrupt.storage.get(model.STORE_KEY), 'invalid JSON'); assert.equal(corrupt.node('#storage-warning').hidden, false);
  const blocked = boot(null, true); blocked.click('', { day: 'push' }); blocked.click('', { done: '', ex: '0', set: '0' });
  blocked.click('', { day: 'pull' }); assert.match(blocked.node('#save-status').innerHTML, /Not saved/);
});
test('backup restore requires confirmation and restores unfinished sessions', async () => {
  const app = boot(), backup = model.newState(); backup.drafts.legs = model.makeDraft(backup, 'legs'); backup.drafts.legs.exercises[0].logs[0].done = true;
  app.node('#settings-button').onclick();
  await app.node('#import-file').onchange({ target: { files: [{ size: 1000, text: async () => JSON.stringify(backup) }] } });
  assert.equal(app.storage.has(model.STORE_KEY), false);
  app.node('#confirm-action').onclick();
  assert.deepEqual(app.stored(), backup);
  app.click('', { day: 'legs' }); assert.equal(app.node('#set-count').textContent, '1 / 9 sets complete');
});
test('malformed backup leaves current data unchanged', async () => {
  const app = boot(); app.click('', { day: 'push' }); app.click('', { done: '', ex: '0', set: '0' });
  const before = app.storage.get(model.STORE_KEY); app.node('#settings-button').onclick();
  await app.node('#import-file').onchange({ target: { files: [{ size: 20, text: async () => '{not json}' }] } });
  assert.match(app.node('#modal-content').innerHTML, /Could not restore/);
  assert.equal(app.storage.get(model.STORE_KEY), before);
});
test('program content is escaped before insertion into HTML', () => {
  const state = model.newState(); state.program.push[0].name = '<script>alert(1)</script>';
  const app = boot(JSON.stringify(state)); app.click('', { day: 'push' });
  assert.match(app.node('#main').innerHTML, /&lt;script&gt;/); assert.ok(!app.node('#main').innerHTML.includes('<script>alert'));
});

test('finish button requires the finisher and updates bests in seconds', () => {
  const app = boot(); app.click('', { day: 'pull' });
  app.click('', { done: '', ex: '0', set: '0' });
  assert.equal(app.node('#finish-button').disabled, true);
  app.node('#main').events.input({ target: { value: '42', dataset: { ex: '4', set: '0', field: 'reps' }, matches: () => true } });
  app.click('', { done: '', ex: '4', set: '0' });
  assert.equal(app.node('#finish-button').disabled, false);
  assert.match(app.node('[data-best="4"]').textContent, /New best today: 42 sec/);
  app.click('finish-button'); app.node('#confirm-action').onclick();
  assert.match(app.node('[data-best="4"]').textContent, /Personal best: 42 sec/);
});
test('new program loads on existing devices without discarding old records', () => {
  const legacy = model.newState(); delete legacy.programRevision; delete legacy.archivedDrafts;
  legacy.program.push[0].name = 'Old custom routine';
  legacy.drafts.push = model.makeDraft(legacy, 'push'); delete legacy.drafts.push.title; delete legacy.drafts.push.programRevision;
  legacy.drafts.push.exercises[0].logs[0].done = true;
  legacy.history.push({ ...structuredClone(legacy.drafts.push), id: 'prior-session', finishedAt: '2026-10-12T20:00:00Z' });
  const app = boot(JSON.stringify(legacy)), stored = app.stored();
  assert.deepEqual(stored.history, legacy.history);
  assert.deepEqual(stored.archivedDrafts[0].exercises, legacy.drafts.push.exercises);
  assert.equal(stored.program.push[0].name, 'Bulgarian Split Squats');
  app.node('#history-nav').onclick();
  assert.match(app.node('#main').innerHTML, /Earlier unfinished sessions/); assert.match(app.node('#main').innerHTML, /Push day/);
  stored.program.push[0].name = 'My current customized exercise';
  const reloaded = boot(JSON.stringify(stored)); reloaded.click('', { day: 'push' });
  assert.match(reloaded.node('#main').innerHTML, /My current customized exercise/);
});
test('customizer groups exercises and retains a mandatory single-set finisher', () => {
  const app = boot(); app.node('#settings-button').onclick();
  app.node('#modal-content').events.click({ target: { dataset: { edit: 'push' }, closest() { return this; }, hasAttribute() { return false; } } });
  const editing = model.newState().program.push;
  const fields = editing.map(ex => ({ querySelector(selector) {
    const key = selector.match(/"([^\"]+)"/)[1];
    return { value: key === 'sets' ? String(ex.sets) : ex[key], checked: !!ex.sides };
  } }));
  app.node('#program-editor').querySelectorAll = selector => selector === '.edit-exercise' ? fields : [];
  app.node('#program-editor').onsubmit({ preventDefault() {} });
  assert.equal(app.stored().program.push.at(-1).group, 'finisher');
  assert.equal(app.stored().program.push.at(-1).initial, 0);
  assert.equal(app.stored().program.push.at(-1).sets, 1);
  app.node('#settings-button').onclick();
  app.node('#modal-content').events.click({ target: { dataset: { edit: 'push' }, closest() { return this; }, hasAttribute() { return false; } } });
  editing.at(-1).group = 'B';
  app.node('#program-editor').querySelectorAll = selector => selector === '.edit-exercise' ? fields : [];
  const before = JSON.stringify(app.stored());
  app.node('#program-editor').onsubmit({ preventDefault() {} });
  assert.equal(JSON.stringify(app.stored()), before);
  assert.match(app.node('#editor-error').textContent, /scheduled finisher/);
});

test('workout notes autosave by day, survive reload, and appear escaped in history and backups', () => {
  const app = boot(); app.click('', { day: 'pull' });
  const notes = 'Felt strong today.\n<script>keep this as text</script>';
  app.node('#main').events.input({ target: { id: 'workout-notes', value: notes, matches: () => false } });
  assert.equal(app.stored().drafts.pull.notes, notes);
  app.click('', { day: 'push' }); assert.ok(!app.node('#main').innerHTML.includes('Felt strong today.'));
  app.click('', { day: 'pull' }); assert.match(app.node('#main').innerHTML, /Felt strong today/);
  assert.ok(app.node('#main').innerHTML.includes('&lt;script&gt;'));
  const reloaded = boot(JSON.stringify(app.stored())); reloaded.click('', { day: 'pull' });
  assert.match(reloaded.node('#main').innerHTML, /Felt strong today/);
  reloaded.click('', { done: '', ex: '4', set: '0' }); reloaded.click('finish-button'); reloaded.node('#confirm-action').onclick();
  assert.equal(reloaded.stored().history[0].notes, notes);
  assert.equal(model.validateState(JSON.parse(JSON.stringify(reloaded.stored()))).history[0].notes, notes);
  reloaded.click('', { history: reloaded.stored().history[0].id });
  assert.match(reloaded.node('#modal-content').innerHTML, /Workout notes/);
  assert.ok(reloaded.node('#modal-content').innerHTML.includes('&lt;script&gt;'));
  assert.ok(!reloaded.node('#modal-content').innerHTML.includes('<script>'));
});
