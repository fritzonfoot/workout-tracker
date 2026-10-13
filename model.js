// Pure data functions: no browser or network dependencies.
export const STORE_KEY = 'workout-tracker-v1';
export const DAYS = ['push', 'pull', 'legs'];
export const DAY_META = {
  push: { title: 'Push day', day: 'Monday', short: 'Mon', subtitle: 'Chest, shoulders & triceps. A little stronger.', symbol: '↗' },
  pull: { title: 'Pull day', day: 'Wednesday', short: 'Wed', subtitle: 'Back, biceps & posterior chain. Show up, pull up.', symbol: '↟' },
  legs: { title: 'Leg day', day: 'Friday', short: 'Fri', subtitle: 'Quads, glutes & hamstrings. Build your foundation.', symbol: '↥' }
};
const exercise = (id, name, sets, target, initial, options = {}) => ({ id, name, sets, target, initial, unit: 'reps', sides: false, finisher: false, note: '', ...options });
export const DEFAULT_PROGRAM = {
  push: [
    exercise('pushups', 'Push-ups', 3, '8–15', 8),
    exercise('overhead-press', 'KB overhead press', 3, '8–12', 8, { sides: true }),
    exercise('floor-press', 'KB floor press', 3, '10–15', 10, { sides: true }),
    exercise('pike-pushups', 'Pike push-ups', 3, '6–12', 6),
    exercise('triceps', 'KB triceps extension', 3, '10–15', 10, { note: 'Overhead · 2–3 sets; the third is optional.' }),
    exercise('dead-bugs', 'Dead bugs', 3, '8–12', 8, { sides: true }),
    exercise('push-finisher', 'Push-up finisher', 1, 'Technical failure', 0, { finisher: true, note: 'Stop when the next rep would lose good form.' })
  ],
  pull: [
    exercise('pullups', 'Pull-ups / chin-ups', 3, '1–2 reps in reserve', 0, { note: 'Pick one variation and keep it consistent for comparison.' }),
    exercise('rows', 'Single-arm KB rows', 3, '10–15', 10, { sides: true }),
    exercise('rdl', 'KB Romanian deadlifts', 3, '12–20', 12),
    exercise('curls', 'KB curls', 3, '10–15', 10, { sides: true }),
    exercise('ytw', 'Prone Y–T–W raises', 3, '6–10 each letter', 6, { note: '2–3 rounds. Log reps per letter for each round; the third is optional.' }),
    exercise('bird-dogs', 'Bird dogs', 3, '8–12', 8, { sides: true }),
    exercise('pull-finisher', 'Pull-up / chin-up finisher', 1, 'Technical failure', 0, { finisher: true, note: 'Stop when the next rep would lose good form.' })
  ],
  legs: [
    exercise('squats', 'Goblet squats', 4, '12–20', 12),
    exercise('split-squats', 'Bulgarian split squats', 3, '8–12', 8, { sides: true }),
    exercise('single-rdl', 'Single-leg KB deadlifts', 3, '8–12', 8, { sides: true }),
    exercise('lunges', 'Reverse lunges with KB', 3, '8–12', 8, { sides: true }),
    exercise('calves', 'Single-leg calf raises', 3, '15–25', 15, { sides: true }),
    exercise('swings', 'KB swings', 3, '15–25', 15),
    exercise('plank', 'Plank', 3, '30–60', 30, { unit: 'sec', note: '2–3 sets; the third is optional.' }),
    exercise('legs-finisher', 'Bodyweight squat finisher', 1, 'Technical failure', 0, { finisher: true, note: 'Stop when the next rep would lose good form.' })
  ]
};
export const clone = value => JSON.parse(JSON.stringify(value));
export const newState = () => ({ version: 1, program: clone(DEFAULT_PROGRAM), drafts: {}, history: [] });
export const suggestedDay = (date = new Date()) => date.getDay() <= 2 ? 'push' : date.getDay() <= 4 ? 'pull' : 'legs';
export const signature = ex => JSON.stringify([ex.id, ex.name, ex.unit, ex.sides]);
export function previousExercise(state, day, ex) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const workout = state.history[i];
    if (workout.day !== day) continue;
    const previous = workout.exercises.find(item => signature(item) === signature(ex));
    if (previous?.logs.some(log => log.done)) return previous;
  }
  return null;
}
export function makeDraft(state, day, now = new Date()) {
  return { day, startedAt: now.toISOString(), exercises: state.program[day].map(ex => {
    const previous = previousExercise(state, day, ex);
    return { ...clone(ex), failure: false, logs: Array.from({ length: ex.sets }, (_, index) => {
      const last = previous?.logs[index];
      return { reps: last?.done ? last.reps : ex.initial, right: last?.done ? last.right : ex.initial, done: false };
    }) };
  }) };
}
export function completedSets(draft) { return draft.exercises.reduce((n, ex) => n + ex.logs.filter(log => log.done).length, 0); }
export function totalSets(draft) { return draft.exercises.reduce((n, ex) => n + ex.logs.length, 0); }
export function finishSession(state, day, id, now = new Date()) {
  const draft = state.drafts[day];
  if (!draft || completedSets(draft) === 0) throw new Error('Complete at least one set first.');
  const session = { ...clone(draft), id, finishedAt: now.toISOString() };
  state.history.push(session);
  delete state.drafts[day];
  return session;
}
export function exerciseDelta(ex, previous) {
  if (!previous || ex.logs.length !== previous.logs.length || !ex.logs.every(log => log.done) || !previous.logs.every(log => log.done)) return null;
  const total = item => item.logs.reduce((n, log) => n + log.reps + (item.sides ? log.right : 0), 0);
  return total(ex) - total(previous);
}
export function formatLogs(ex) {
  return ex.logs.map(log => !log.done ? '—' : ex.sides ? `${log.reps}L / ${log.right}R` : String(log.reps)).join(' · ');
}
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const number = x => Number.isInteger(x) && x >= 0 && x <= 9999;
const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
function validExercise(ex, logged = false) {
  if (!object(ex) || typeof ex.id !== 'string' || !ex.id || ex.id.length > 100 || typeof ex.name !== 'string' || !ex.name.trim() || ex.name.length > 100 || typeof ex.target !== 'string' || ex.target.length > 100 || typeof ex.note !== 'string' || ex.note.length > 500 || !Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 10 || !number(ex.initial) || !['reps', 'sec'].includes(ex.unit) || typeof ex.sides !== 'boolean' || typeof ex.finisher !== 'boolean') return false;
  if (logged && (typeof ex.failure !== 'boolean' || !Array.isArray(ex.logs) || ex.logs.length !== ex.sets || !ex.logs.every(log => object(log) && number(log.reps) && number(log.right) && typeof log.done === 'boolean'))) return false;
  return true;
}
const validExercises = (exercises, logged) => Array.isArray(exercises) && exercises.length >= 1 && exercises.length <= 30 && exercises.every(ex => validExercise(ex, logged)) && new Set(exercises.map(ex => ex.id)).size === exercises.length;
function validSession(session) { return object(session) && DAYS.includes(session.day) && date(session.startedAt) && validExercises(session.exercises, true); }
export function validateState(value) {
  if (!object(value) || value.version !== 1 || !object(value.program) || !DAYS.every(day => validExercises(value.program[day], false)) || !object(value.drafts) || !Object.entries(value.drafts).every(([day, draft]) => DAYS.includes(day) && validSession(draft) && draft.day === day) || !Array.isArray(value.history) || value.history.length > 10000 || !value.history.every(session => validSession(session) && typeof session.id === 'string' && session.id.length > 0 && session.id.length < 100 && date(session.finishedAt)) || new Set(value.history.map(session => session.id)).size !== value.history.length) throw new Error('This is not a valid Workout backup. Your current data has not changed.');
  return clone(value);
}
