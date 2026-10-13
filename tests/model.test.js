import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { newState, makeDraft, finishSession, completedSets, totalSets, exerciseDelta, previousExercise, validateState, suggestedDay, formatLogs } from '../model.js';

test('default routine preserves the three splits, finishers and optional sets', () => {
  const state = newState();
  assert.deepEqual(Object.keys(state.program), ['push', 'pull', 'legs']);
  assert.deepEqual(Object.values(state.program).map(list => list.length), [7, 7, 8]);
  assert.equal(totalSets(makeDraft(state, 'push')), 19);
  assert.equal(totalSets(makeDraft(state, 'pull')), 19);
  assert.equal(totalSets(makeDraft(state, 'legs')), 23);
  for (const list of Object.values(state.program)) assert.equal(list.at(-1).finisher, true);
});
test('drafts and defaults are independent snapshots', () => {
  const state = newState(), other = newState();
  state.drafts.push = makeDraft(state, 'push');
  state.drafts.push.exercises[0].logs[0].reps = 42;
  state.program.push[0].name = 'New name';
  assert.equal(state.drafts.push.exercises[0].name, 'Push-ups');
  assert.equal(other.program.push[0].name, 'Push-ups');
  assert.equal(makeDraft(other, 'push').exercises[0].logs[0].reps, 8);
});
test('finish records a partial session, deletes only its own draft and prevents duplicates', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push'); state.drafts.pull = makeDraft(state, 'pull');
  state.drafts.push.exercises[0].logs[0] = { reps: 12, right: 8, done: true };
  const session = finishSession(state, 'push', 'session-1');
  assert.equal(completedSets(session), 1);
  assert.equal(state.history.length, 1);
  assert.equal(state.drafts.push, undefined);
  assert.ok(state.drafts.pull);
  assert.throws(() => finishSession(state, 'push', 'duplicate'));
  assert.deepEqual(validateState(state), state);
});
test('cannot finish an empty session', () => {
  const state = newState(); state.drafts.legs = makeDraft(state, 'legs');
  assert.throws(() => finishSession(state, 'legs', 'empty'));
});
test('next session seeds completed reps only, including separate left and right', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push');
  const press = state.drafts.push.exercises[1];
  press.logs[0] = { reps: 11, right: 9, done: true };
  press.logs[1] = { reps: 77, right: 77, done: false };
  finishSession(state, 'push', 'one');
  const next = makeDraft(state, 'push').exercises[1];
  assert.deepEqual(next.logs[0], { reps: 11, right: 9, done: false });
  assert.deepEqual(next.logs[1], { reps: 8, right: 8, done: false });
  assert.equal(formatLogs(state.history[0].exercises[1]), '11L / 9R · — · —');
});
test('previous performance skips sessions where that exercise was not done', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push');
  state.drafts.push.exercises[0].logs[0].done = true;
  state.drafts.push.exercises[0].logs[0].reps = 12;
  finishSession(state, 'push', 'one');
  state.drafts.push = makeDraft(state, 'push'); state.drafts.push.exercises[1].logs[0].done = true;
  finishSession(state, 'push', 'two');
  assert.equal(previousExercise(state, 'push', state.program.push[0]).logs[0].reps, 12);
});
test('renaming a variation or changing unit does not compare unrelated exercises', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push'); state.drafts.push.exercises[0].logs[0].done = true;
  finishSession(state, 'push', 'one');
  assert.ok(previousExercise(state, 'push', state.program.push[0]));
  state.program.push[0].name = 'Feet-elevated push-ups';
  assert.equal(previousExercise(state, 'push', state.program.push[0]), null);
});
test('progress compares full matching set counts and adds both sides', () => {
  const state = newState(), a = makeDraft(state, 'push').exercises[1], b = structuredClone(a);
  a.logs.forEach(log => { log.done = true; }); b.logs.forEach(log => { log.done = true; });
  a.logs[0].reps += 2; a.logs[0].right += 3;
  assert.equal(exerciseDelta(a, b), 5);
  a.logs[1].done = false; assert.equal(exerciseDelta(a, b), null);
  a.logs[1].done = true; b.logs.pop(); assert.equal(exerciseDelta(a, b), null);
});
test('valid backups round trip without losing sessions or custom program names', () => {
  const state = newState(); state.program.legs[0].name = '<strong>Custom & squat</strong>';
  state.drafts.legs = makeDraft(state, 'legs'); state.drafts.legs.exercises[0].logs[0].done = true;
  finishSession(state, 'legs', 'one'); state.drafts.pull = makeDraft(state, 'pull');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
});
test('invalid backups fail without mutation', () => {
  for (const mutation of [s => { s.version = 2; }, s => { s.program.push[0].sets = 0; }, s => { s.program.push[0].sides = 'yes'; }, s => { s.program.push[0].name = ''; }, s => { s.program.push.push(s.program.push[0]); }, s => { s.drafts.push = makeDraft(s, 'push'); s.drafts.push.exercises[0].logs[0].reps = -1; }, s => { s.drafts.push = makeDraft(s, 'pull'); }]) {
    const state = newState(); mutation(state); const before = JSON.stringify(state);
    assert.throws(() => validateState(state)); assert.equal(JSON.stringify(state), before);
  }
});
test('local weekday selects the nearest split without an UTC conversion', () => {
  assert.equal(suggestedDay(new Date(2026, 9, 12, 21)), 'push');
  assert.equal(suggestedDay(new Date(2026, 9, 14, 9)), 'pull');
  assert.equal(suggestedDay(new Date(2026, 9, 16, 9)), 'legs');
});
test('PWA paths are relative and every offline asset exists', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../${icon.src}`, import.meta.url)));
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const [, asset] of worker.matchAll(/'(\.\/[^']*)'/g)) assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
  assert.ok(html.includes('viewport-fit=cover')); assert.ok(html.includes('apple-touch-icon'));
});
