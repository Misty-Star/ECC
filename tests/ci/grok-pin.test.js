'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { validateGrokPin } = require('../../scripts/ci/validate-grok-pin');

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function writeMarketplace(root, sha) {
  const directory = path.join(root, '.grok-plugin');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'marketplace.json'), JSON.stringify({
    plugins: [{ source: { sha } }],
  }));
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-grok-pin-'));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'ECC test');
  git(root, 'config', 'user.email', 'ecc-test@example.invalid');
  fs.writeFileSync(path.join(root, 'payload.txt'), 'verified source\n');
  writeMarketplace(root, '0'.repeat(40));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'source snapshot');
  const sha = git(root, 'rev-parse', 'HEAD');
  writeMarketplace(root, sha);
  git(root, 'add', '.grok-plugin/marketplace.json');
  git(root, 'commit', '--quiet', '-m', 'pin source snapshot');
  return { root, sha };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed += 1;
  }
}

console.log('\n=== Grok marketplace pin validation ===\n');

test('accepts a pin commit that differs only by the pin update', () => {
  const fixture = createFixture();
  try {
    assert.strictEqual(validateGrokPin(fixture.root).sha, fixture.sha);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects source changes after the pinned snapshot', () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(path.join(fixture.root, 'payload.txt'), 'changed source\n');
    git(fixture.root, 'add', 'payload.txt');
    git(fixture.root, 'commit', '--quiet', '-m', 'change source without repinning');
    assert.throws(() => validateGrokPin(fixture.root), /pin .* is stale/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exitCode = 1;
