import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { newState, makeDraft, finishSession, completedSets, totalSets, exerciseDelta, previousExercise, validateState, migrateState, suggestedDay, formatLogs, finisherBest, atTopOfRange, sessionTitle } from '../model.js';
const markFinisher = draft => { draft.exercises.at(-1).logs[0].done = true; };
function legacyState() {
  const state = newState(); delete state.programRevision; delete state.archivedDrafts;
  for (const day of Object.keys(state.program)) state.program[day].forEach(ex => { delete ex.group; ex.sets = 3; });
  state.program.push[0].name = 'My customized original exercise';
  state.drafts.push = makeDraft(state, 'push'); delete state.drafts.push.title; delete state.drafts.push.programRevision;
  state.drafts.push.exercises[0].logs[0] = { reps: 17, right: 14, done: true };
  state.history.push({ ...structuredClone(state.drafts.push), id: 'old-session', finishedAt: '2026-10-12T20:00:00Z' });
  return state;
}
test('exact routines have four working exercises, two rounds each, and one finisher', () => {
  const state = newState();
  const expected = {
    push: [['Bulgarian Split Squats', '8–12', true], ['Pull-Ups', '4–6', false], ['Single-Leg KB Romanian Deadlifts', '8–12', true], ['Single-Arm KB Overhead Press', '8–12', true]],
    pull: [['Push-Ups', '10–18', false], ['KB Goblet Squats', '12–20', false], ['Single-Arm KB Rows', '10–15', true], ['KB Overhead Triceps Extensions', '10–15', false]],
    legs: [['Chin-Ups', '4–6', false], ['KB Reverse Lunges', '8–10', true], ['Pike Push-Ups', '6–12', false], ['KB Biceps Curls', '6–12', true]]
  };
  for (const day of Object.keys(expected)) {
    const list = state.program[day]; assert.equal(list.length, 5);
    assert.deepEqual(list.slice(0, 4).map(ex => [ex.name, ex.target, ex.sides]), expected[day]);
    assert.deepEqual(list.map(ex => ex.group), ['A', 'A', 'B', 'B', 'finisher']);
    assert.deepEqual(list.map(ex => ex.sets), [2, 2, 2, 2, 1]);
    assert.equal(totalSets(makeDraft(state, day)), 9); assert.equal(list.at(-1).finisher, true);
  }
  assert.deepEqual(Object.values(state.program).map(list => list.at(-1).unit), ['sec', 'sec', 'reps']);
  assert.equal(state.program.push.at(-1).target, 'Up to 60');
});
test('one-time migration preserves old history, unfinished reps, and future customization', () => {
  const original = legacyState(), history = structuredClone(original.history), oldDraft = structuredClone(original.drafts.push);
  const migrated = migrateState(original, new Date('2026-10-13T06:00:00Z'));
  assert.equal(migrated.programRevision, 2); assert.deepEqual(migrated.history, history);
  assert.deepEqual(migrated.drafts, {}); assert.equal(migrated.archivedDrafts.length, 1);
  assert.deepEqual(migrated.archivedDrafts[0].exercises, oldDraft.exercises);
  assert.equal(sessionTitle(migrated.history[0]), 'Push day');
  assert.equal(migrated.program.push[0].name, 'Bulgarian Split Squats');
  assert.equal(original.program.push[0].name, 'My customized original exercise');
  migrated.program.push[0].name = 'My new customized variation';
  assert.deepEqual(migrateState(migrated), migrated); assert.deepEqual(validateState(migrated), migrated);
});
test('scheduled finisher is required; partial strength sets can still be recorded', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push'); state.drafts.pull = makeDraft(state, 'pull');
  state.drafts.push.exercises[0].logs[0].done = true;
  assert.throws(() => finishSession(state, 'push', 'blocked'), /finisher/);
  markFinisher(state.drafts.push); const session = finishSession(state, 'push', 'one');
  assert.equal(completedSets(session), 2); assert.equal(session.title, 'The hard day');
  assert.equal(state.drafts.push, undefined); assert.ok(state.drafts.pull);
  assert.throws(() => finishSession(state, 'push', 'duplicate'));
});
test('last session seeds left and right separately, skipping unchecked sets', () => {
  const state = newState(); state.drafts.push = makeDraft(state, 'push'); const ex = state.drafts.push.exercises[0];
  ex.logs[0] = { reps: 11, right: 9, done: true }; ex.logs[1] = { reps: 77, right: 77, done: false };
  markFinisher(state.drafts.push); finishSession(state, 'push', 'one');
  const next = makeDraft(state, 'push').exercises[0];
  assert.deepEqual(next.logs[0], { reps: 11, right: 9, done: false });
  assert.deepEqual(next.logs[1], { reps: 8, right: 8, done: false });
  assert.equal(formatLogs(state.history[0].exercises[0]), '11L / 9R · —');
  state.program.push[0].name = 'A harder variation'; assert.equal(previousExercise(state, 'push', state.program.push[0]), null);
});
test('progression needs both rounds at top of range on both sides', () => {
  const ex = makeDraft(newState(), 'push').exercises[0]; ex.logs.forEach(log => Object.assign(log, { reps: 12, right: 12, done: true }));
  assert.equal(atTopOfRange(ex), true); ex.logs[1].right = 11; assert.equal(atTopOfRange(ex), false);
  ex.logs[1].right = 12; ex.logs[1].done = false; assert.equal(atTopOfRange(ex), false);
  assert.equal(atTopOfRange(makeDraft(newState(), 'push').exercises.at(-1)), false);
});
test('finisher bests use checked records and separate units and variations', () => {
  const state = newState();
  for (const [id, seconds] of [['one', 40], ['two', 35]]) {
    state.drafts.pull = makeDraft(state, 'pull'); const hang = state.drafts.pull.exercises.at(-1);
    hang.logs[0].reps = seconds; hang.logs[0].done = true; finishSession(state, 'pull', id);
  }
  const hang = state.program.pull.at(-1); assert.equal(finisherBest(state, 'pull', hang), 40);
  assert.equal(finisherBest(state, 'push', state.program.push.at(-1)), null);
  assert.equal(finisherBest(state, 'pull', { ...hang, unit: 'reps' }), null);
  assert.equal(finisherBest(state, 'pull', { ...hang, name: 'Different hang' }), null);
  state.history[0].exercises.at(-1).logs[0].done = false; assert.equal(finisherBest(state, 'pull', hang), 35);
});
test('delta compares equal complete sets and adds both sides', () => {
  const a = makeDraft(newState(), 'push').exercises[0], b = structuredClone(a);
  a.logs.forEach(log => { log.done = true; }); b.logs.forEach(log => { log.done = true; });
  a.logs[0].reps += 2; a.logs[0].right += 3; assert.equal(exerciseDelta(a, b), 5);
  b.logs.pop(); assert.equal(exerciseDelta(a, b), null);
});
test('backups round trip and malformed values reject without mutation', () => {
  const state = migrateState(legacyState()); state.drafts.legs = makeDraft(state, 'legs');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  for (const mutation of [s => { s.version = 2; }, s => { s.program.push[0].sets = 0; }, s => { s.program.push[0].group = 'invalid'; }, s => { s.programRevision = 99; }, s => { s.archivedDrafts[0].exercises[0].logs[0].reps = -1; }, s => { s.drafts.legs.day = 'push'; }]) {
    const bad = structuredClone(state); mutation(bad); const before = JSON.stringify(bad); assert.throws(() => validateState(bad)); assert.equal(JSON.stringify(bad), before);
  }
});
test('local weekdays select the correct split', () => {
  assert.equal(suggestedDay(new Date(2026, 9, 12, 21)), 'push'); assert.equal(suggestedDay(new Date(2026, 9, 14, 9)), 'pull'); assert.equal(suggestedDay(new Date(2026, 9, 16, 9)), 'legs');
});
test('relative PWA paths, update reload, and complete offline assets', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../${icon.src.split('?')[0]}`, import.meta.url)));
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const [, asset] of worker.matchAll(/'(\.\/[^']*)'/g)) assert.ok(existsSync(new URL(`../${asset.split('?')[0]}`, import.meta.url)), asset);
  assert.match(worker, /workout-shell-v7/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) assert.ok(existsSync(new URL(`../${asset.split('?')[0]}`, import.meta.url)), asset);
  assert.ok(html.includes('viewport-fit=cover')); assert.ok(html.includes('controllerchange'));
});

test('optional notes preserve old backups and validate new note types and lengths', () => {
  const state = newState(); state.drafts.legs = makeDraft(state, 'legs');
  delete state.drafts.legs.notes; assert.doesNotThrow(() => validateState(state));
  state.drafts.legs.notes = 'A useful note\nwith two lines.'; markFinisher(state.drafts.legs);
  finishSession(state, 'legs', 'notes-session');
  assert.equal(state.history[0].notes, 'A useful note\nwith two lines.');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  state.history[0].notes = 42; assert.throws(() => validateState(state));
  state.history[0].notes = 'a'.repeat(2001); assert.throws(() => validateState(state));
});
