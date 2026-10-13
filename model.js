// Pure data functions: no browser or network dependencies.
export const STORE_KEY = 'workout-tracker-v1';
export const DAYS = ['push', 'pull', 'legs'];
export const PROGRAM_REVISION = 2;
export const LEGACY_TITLES = { push: 'Push day', pull: 'Pull day', legs: 'Leg day' };
export const DAY_META = {
  push: { title: 'The hard day', day: 'Monday', short: 'Mon', subtitle: 'Legs, back, shoulders & posterior chain.', time: '20–25 min', symbol: '↗' },
  pull: { title: 'The balanced day', day: 'Wednesday', short: 'Wed', subtitle: 'Chest, quads, back & triceps.', time: 'About 20 min', symbol: '↟' },
  legs: { title: 'The fun day', day: 'Friday', short: 'Fri', subtitle: 'Upper body, arms & lighter leg work.', time: 'About 20 min', symbol: '↥' }
};
const exercise = (id, name, target, initial, group, options = {}) => ({ id, name, sets: group === 'finisher' ? 1 : 2, target, initial, group, unit: 'reps', sides: false, finisher: group === 'finisher', note: '', ...options });
export const DEFAULT_PROGRAM = {
  push: [
    exercise('split-squats', 'Bulgarian Split Squats', '8–12', 8, 'A', { sides: true }),
    exercise('pullups', 'Pull-Ups', '4–6', 4, 'A'),
    exercise('single-rdl', 'Single-Leg KB Romanian Deadlifts', '8–12', 8, 'B', { sides: true }),
    exercise('overhead-press', 'Single-Arm KB Overhead Press', '8–12', 8, 'B', { sides: true }),
    exercise('plank-finisher', 'Forearm Plank', 'Up to 60', 0, 'finisher', { unit: 'sec', note: 'One hold, up to 60 seconds. Stop when proper form can no longer be maintained.' })
  ],
  pull: [
    exercise('pushups', 'Push-Ups', '10–18', 10, 'A'),
    exercise('squats', 'KB Goblet Squats', '12–20', 12, 'A'),
    exercise('rows', 'Single-Arm KB Rows', '10–15', 10, 'B', { sides: true }),
    exercise('triceps', 'KB Overhead Triceps Extensions', '10–15', 10, 'B', { note: 'Hold the kettlebell with both hands.' }),
    exercise('hang-finisher', 'Dead Hang', 'Grip / shoulder limit', 0, 'finisher', { unit: 'sec', note: 'One hold. Stop at your grip limit or when your shoulder position is no longer comfortable.' })
  ],
  legs: [
    exercise('chinups', 'Chin-Ups', '4–6', 4, 'A'),
    exercise('lunges', 'KB Reverse Lunges', '8–10', 8, 'A', { sides: true }),
    exercise('pike-pushups', 'Pike Push-Ups', '6–12', 6, 'B'),
    exercise('curls', 'KB Biceps Curls', '6–12', 6, 'B', { sides: true, note: 'Strict form. Keep your upper arm still and avoid swinging.' }),
    exercise('friday-push-finisher', 'Standard Push-Ups', 'Technical failure', 0, 'finisher', { note: 'One set. Stop when another clean repetition is no longer possible.' })
  ]
};
export const clone = value => JSON.parse(JSON.stringify(value));
export const newState = () => ({ version: 1, programRevision: PROGRAM_REVISION, program: clone(DEFAULT_PROGRAM), drafts: {}, archivedDrafts: [], history: [] });
export function migrateState(value, now = new Date()) {
  const state = validateState(value);
  if (state.programRevision === PROGRAM_REVISION) return state;
  // Keep all prior records exactly as logged; unfinished sessions are archived separately.
  state.archivedDrafts = [...(state.archivedDrafts || []), ...Object.values(state.drafts).map(draft => ({ ...clone(draft), id: `archive-${draft.day}-${draft.startedAt}`, archivedAt: now.toISOString(), title: LEGACY_TITLES[draft.day] }))];
  state.drafts = {};
  state.program = clone(DEFAULT_PROGRAM);
  state.programRevision = PROGRAM_REVISION;
  return state;
}
export const sessionTitle = session => session.title || LEGACY_TITLES[session.day];
export const finishersComplete = draft => draft.exercises.filter(ex => ex.finisher).every(ex => ex.logs.every(log => log.done));
export function finisherBest(state, day, ex) {
  const values = state.history.filter(session => session.day === day).flatMap(session => session.exercises.filter(item => item.finisher && signature(item) === signature(ex)).flatMap(item => item.logs.filter(log => log.done).map(log => log.reps)));
  return values.length ? Math.max(...values) : null;
}
export function atTopOfRange(ex) {
  const match = ex.target.match(/^\s*(\d+)\s*[–-]\s*(\d+)\s*$/);
  return !ex.finisher && ex.unit === 'reps' && ex.logs.length === 2 && match && ex.logs.every(log => log.done && log.reps >= Number(match[2]) && (!ex.sides || log.right >= Number(match[2]))) ? true : false;
}
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
  return { day, title: DAY_META[day].title, programRevision: PROGRAM_REVISION, notes: '', startedAt: now.toISOString(), exercises: state.program[day].map(ex => {
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
  if (draft.programRevision === PROGRAM_REVISION && !finishersComplete(draft)) throw new Error('Complete the scheduled finisher first.');
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
  if (ex.group !== undefined && !['A', 'B', 'finisher'].includes(ex.group)) return false;
  if (logged && (typeof ex.failure !== 'boolean' || !Array.isArray(ex.logs) || ex.logs.length !== ex.sets || !ex.logs.every(log => object(log) && number(log.reps) && number(log.right) && typeof log.done === 'boolean'))) return false;
  return true;
}
const validExercises = (exercises, logged) => Array.isArray(exercises) && exercises.length >= 1 && exercises.length <= 30 && exercises.every(ex => validExercise(ex, logged)) && new Set(exercises.map(ex => ex.id)).size === exercises.length;
function validSession(session) { return object(session) && DAYS.includes(session.day) && date(session.startedAt) && validExercises(session.exercises, true) && (session.notes === undefined || (typeof session.notes === 'string' && session.notes.length <= 2000)); }
export function validateState(value) {
  if (!object(value) || value.version !== 1 || !object(value.program) || !DAYS.every(day => validExercises(value.program[day], false)) || !object(value.drafts) || !Object.entries(value.drafts).every(([day, draft]) => DAYS.includes(day) && validSession(draft) && draft.day === day) || !Array.isArray(value.history) || value.history.length > 10000 || !value.history.every(session => validSession(session) && typeof session.id === 'string' && session.id.length > 0 && session.id.length < 100 && date(session.finishedAt)) || new Set(value.history.map(session => session.id)).size !== value.history.length) throw new Error('This is not a valid Workout backup. Your current data has not changed.');
  if (value.programRevision !== undefined && (!Number.isInteger(value.programRevision) || value.programRevision < 1 || value.programRevision > PROGRAM_REVISION)) throw new Error('This backup uses an unsupported program version.');
  if (value.archivedDrafts !== undefined && (!Array.isArray(value.archivedDrafts) || value.archivedDrafts.length > 10000 || !value.archivedDrafts.every(session => validSession(session) && typeof session.id === 'string' && date(session.archivedAt)))) throw new Error('Invalid unfinished session archive.');
  for (const session of [...value.history, ...Object.values(value.drafts), ...(value.archivedDrafts || [])]) if (session.title !== undefined && (typeof session.title !== 'string' || session.title.length > 100)) throw new Error('Invalid workout title.');
  return clone(value);
}
