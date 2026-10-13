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
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, 'const { STORE_KEY, DAYS, DAY_META, DEFAULT_PROGRAM, clone, newState, suggestedDay, previousExercise, makeDraft, completedSets, totalSets, finishSession, exerciseDelta, formatLogs, validateState } = model;\n');
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
  const input = { value: '11', dataset: { ex: '1', set: '0', field: 'right' }, matches: selector => selector === '.rep-input' };
  app.node('#main').events.input({ target: input });
  app.click('', { done: '', ex: '1', set: '0' });
  assert.equal(app.stored().drafts.push.exercises[0].logs[0].reps, 9);
  assert.equal(app.stored().drafts.push.exercises[1].logs[0].right, 11);
  app.click('', { day: 'pull' }); app.click('', { done: '', ex: '0', set: '0' });
  app.click('', { day: 'push' }); app.click('finish-button');
  assert.equal(app.node('#modal').open, true); app.node('#confirm-action').onclick();
  assert.equal(app.stored().history.length, 1); assert.equal(model.completedSets(app.stored().history[0]), 2);
  assert.ok(app.stored().drafts.pull); assert.equal(app.stored().drafts.push, undefined);
  app.node('#history-nav').onclick(); assert.match(app.node('#main').innerHTML, /2 \/ 19 sets/);
  const reloaded = boot(JSON.stringify(app.stored())); reloaded.click('', { day: 'push' });
  assert.match(reloaded.node('#main').innerHTML, /Last: 9 · — · —/);
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
  app.click('', { day: 'legs' }); assert.equal(app.node('#set-count').textContent, '1 / 23 sets complete');
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
