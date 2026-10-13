import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function setup(network = true) {
  const events = {}, stored = new Map(), fetched = [], deleted = [];
  const self = { location: { href: 'https://example.com/workout-tracker/sw.js' }, addEventListener: (name, handler) => { events[name] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const shell = { addAll: async assets => { for (const asset of assets) stored.set(typeof asset === 'string' ? asset : asset.url, { ok: true, cached: typeof asset === 'string' ? asset : asset.url, cacheMode: asset.cache }); } };
  shell.match = async request => stored.get(typeof request === 'string' ? request : request.url);
  const caches = { open: async () => shell, keys: async () => ['workout-shell-v0', 'unrelated-app'], delete: async key => { deleted.push(key); }, match: async () => { throw new Error('Do not read another release cache'); } };
  const fetch = async (request, options) => { fetched.push({ request, options }); if (!network) throw new Error('offline'); return { ok: true, network: true }; };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, caches, fetch, URL, Request });
  return { events, stored, fetched, deleted };
}
async function lifecycle(handler) { let promise; handler({ waitUntil: p => { promise = p; } }); await promise; }
async function request(handler, url, mode = 'cors', method = 'GET') { let promise; handler({ request: { url, mode, method }, respondWith: p => { promise = p; } }); return promise ? await promise : null; }
test('worker caches its complete shell under the project subpath', async () => {
  const { events, stored, deleted } = setup(); await lifecycle(events.install); await lifecycle(events.activate);
  assert.equal(stored.size, 9); for (const item of stored.values()) assert.equal(item.cacheMode, 'reload'); assert.ok(stored.has('https://example.com/workout-tracker/index.html'));
  assert.deepEqual(deleted, ['workout-shell-v0']);
});
test('offline navigation and JavaScript requests return cached shell', async () => {
  const { events, stored, fetched } = setup(false); await lifecycle(events.install);
  const navigation = await request(events.fetch, 'https://example.com/workout-tracker/', 'navigate');
  assert.equal(navigation, stored.get('https://example.com/workout-tracker/index.html'));
  const script = await request(events.fetch, 'https://example.com/workout-tracker/app.js');
  assert.equal(script, stored.get('https://example.com/workout-tracker/app.js?v=7')); assert.equal(fetched.length, 1); assert.equal(fetched[0].options.cache, 'no-store');
});
test('worker does not intercept other projects, origins or POST requests', async () => {
  const { events } = setup();
  assert.equal(await request(events.fetch, 'https://example.com/other/'), null);
  assert.equal(await request(events.fetch, 'https://another.com/workout-tracker/'), null);
  assert.equal(await request(events.fetch, 'https://example.com/workout-tracker/', 'cors', 'POST'), null);
});
