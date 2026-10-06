import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/js/analytics.js', import.meta.url), 'utf8');

function run({ hostname = 'ks-design.art', readyState = 'loading', idle = true } = {}) {
  const listeners = {};
  const scripts = [];
  const pending = [];
  const window = {
    addEventListener: (name, callback, options) => {
      listeners[name] = { callback, options };
    },
  };
  if (idle) window.requestIdleCallback = (callback, options) => pending.push({ callback, options });
  const document = {
    readyState,
    addEventListener: (name, callback) => { listeners[name] = { callback }; },
    createElement: (tag) => ({ tag, dataset: {} }),
    head: { append: (script) => scripts.push(script) },
  };
  vm.runInNewContext(source, {
    location: { hostname }, window, document,
    setTimeout: (callback) => pending.push({ callback }),
  });
  return { window, listeners, scripts, pending };
}

test('analytics stays disabled on previews and local development', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'ks-preview.workers.dev', 'stats.ks-design.art']) {
    const state = run({ hostname });
    assert.equal(state.window.plausible, undefined);
    assert.deepEqual(state.listeners, {});
    assert.equal(state.pending.length, 0);
  }
});

test('tracker waits for load and idle, and uses only same-origin endpoints', () => {
  const state = run();
  assert.equal(state.scripts.length, 0);
  assert.equal(state.pending.length, 0);
  assert.equal(state.listeners.load.options.once, true);
  state.listeners.load.callback();
  assert.equal(state.pending[0].options.timeout, 1500);
  assert.equal(state.scripts.length, 0);
  state.pending[0].callback();
  const script = state.scripts[0];
  assert.equal(script.tag, 'script');
  assert.equal(script.src, '/stats/script.js');
  assert.equal(script.dataset.api, '/stats/event');
  assert.equal(script.dataset.domain, 'ks-design.art');
  assert.equal(script.defer, true);
});

test('already loaded pages and browsers without idle callbacks still load the tracker', () => {
  for (const idle of [true, false]) {
    const state = run({ readyState: 'complete', idle });
    assert.equal(state.listeners.load, undefined);
    assert.equal(state.pending.length, 1);
    state.pending[0].callback();
    assert.equal(state.scripts.length, 1);
  }
});

test('contact clicks are queued before the tracker loads; other clicks are ignored', () => {
  const state = run();
  state.listeners.click.callback({ target: { closest: () => null } });
  state.listeners.click.callback({ target: {} });
  assert.equal(state.window.plausible.q, undefined);
  state.listeners.click.callback({ target: { closest: (selector) => {
    assert.equal(selector, 'a[data-contact]');
    return { dataset: { contact: 'telegram' } };
  } } });
  assert.equal(state.window.plausible.q.length, 1);
  assert.equal(state.window.plausible.q[0][0], 'Contact telegram');
});
