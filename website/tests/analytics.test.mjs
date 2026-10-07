import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

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
  assert.equal(script.dataset.domain, 'ks');
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

test('old dashboard bookmark redirects to the short URL without losing filters', () => {
  const config = readFileSync(new URL('../production/analytics/stats.conf', import.meta.url), 'utf8');
  assert.match(config, /location = \/ks-design\.art\s*\{\s*return 302 \/ks\$is_args\$args;/);
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

test('installer release guard reads effective Compose JSON and rejects unpinned releases', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ks-plausible-test-'));
  const docker = join(directory, 'docker');
  writeFileSync(docker, `#!${process.execPath}
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['compose', '-p', 'ks-plausible', 'config', '--format', 'json']);
console.log(process.env.PLAUSIBLE_TEST_CONFIG);
`);
  chmodSync(docker, 0o700);
  const script = fileURLToPath(new URL('../production/analytics/check-release.sh', import.meta.url));
  try {
    for (const image of [
      'ghcr.io/plausible/community-edition:v3.2.1',
      'ghcr.io/plausible/community-edition:v3.2.0',
      'ghcr.io/plausible/community-edition:latest',
      'untrusted/plausible:v3.2.1',
    ]) {
      const result = spawnSync('bash', [script], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`,
          PLAUSIBLE_TEST_CONFIG: JSON.stringify({ services: { plausible: { image } } }) },
      });
      assert.equal(result.status, image.endsWith('community-edition:v3.2.1') ? 0 : 1,
        result.stderr || result.stdout);
    }
    const invalid = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`,
        PLAUSIBLE_TEST_CONFIG: '{}' },
    });
    assert.notEqual(invalid.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
