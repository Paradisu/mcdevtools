import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.MCDEV_PROJECT = join(import.meta.dirname, 'fixtures', 'extension-project');

const { parseJunit, writeJunit } = await import('../src/testing/junit.ts');
const { collectReports, findReportDirs, globToRegex } = await import('../src/testing/run.ts');
const { loadConfig } = await import('../src/config.ts');
const { parseSuite } = await import('../src/testing/manual.ts');
const { DevError } = await import('../src/util.ts');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="net.x.JoinTest" tests="3" skipped="1" failures="1" errors="0" time="2.5">
  <testcase name="joins()" classname="net.x.JoinTest" time="0.512"/>
  <testcase name="chats &amp; leaves()" classname="net.x.JoinTest" time="1.25">
    <failure message="Timed out waiting for chat &lt;hi&gt;&#10;second line" type="java.lang.AssertionError">stack</failure>
  </testcase>
  <testcase name="later()" classname="net.x.JoinTest" time="0"><skipped/></testcase>
</testsuite>`;

test('parseJunit reads results, unescapes names and keeps the failure message lines', () => {
  const cases = parseJunit(XML);
  assert.deepEqual(
    cases.map((c) => [c.name, c.result]),
    [['joins()', 'passed'], ['chats & leaves()', 'failed'], ['later()', 'skipped']],
  );
  assert.equal(cases[1]!.message, 'Timed out waiting for chat <hi>\nsecond line');
  assert.equal(cases[0]!.seconds, 0.512);
  assert.equal(cases[0]!.className, 'net.x.JoinTest');
});

test('writeJunit round-trips through parseJunit', () => {
  const cases = parseJunit(XML);
  assert.deepEqual(
    parseJunit(writeJunit('manual', cases, 3)).map((c) => [c.name, c.result, c.message]),
    cases.map((c) => [c.name, c.result, c.message]),
  );
});

test('the report glob matches the folder at any depth but nothing else', () => {
  const glob = globToRegex('**/build/test-results/integrationTest');
  assert.ok(glob.test('integration-tests/build/test-results/integrationTest'));
  assert.ok(glob.test('build/test-results/integrationTest'));
  assert.ok(!glob.test('integration-tests/build/test-results/test'));
  assert.ok(!glob.test('x/build/test-results/integrationTestExtra'));
  assert.ok(globToRegex('a/*/c').test('a/b/c'));
  assert.ok(!globToRegex('a/*/c').test('a/b/d/c'));
});

test('collectReports reads only fresh XML from matching folders and skips ignored directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'reports-'));
  const dir = join(root, 'it', 'build', 'test-results', 'integrationTest');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'TEST-new.xml'), XML);
  const old = join(dir, 'TEST-old.xml');
  writeFileSync(old, XML);
  utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
  const ignored = join(root, 'node_modules', 'x', 'build', 'test-results', 'integrationTest');
  mkdirSync(ignored, { recursive: true });
  writeFileSync(join(ignored, 'TEST-n.xml'), XML);

  const glob = '**/build/test-results/integrationTest';
  assert.deepEqual(findReportDirs(root, glob), [dir]);
  assert.equal(collectReports(root, glob, Date.now() - 60_000).length, 3, 'only the fresh file counts');
  assert.equal(collectReports(root, glob, 0).length, 6, 'with no cutoff both files count');
});

test('the [test] config has defaults, and its failure patterns are valid regexes', async () => {
  const config = await loadConfig();
  assert.deepEqual(config.test.command, ['./gradlew', 'integrationTest']);
  assert.equal(config.test.capture, 'on-failure');
  assert.equal(config.test.in_game, false);
  const [error] = config.test.log_fail_patterns.map((p) => new RegExp(p));
  assert.ok(error!.test('[12:00:00 ERROR]: boom'));
  assert.ok(!error!.test('[12:00:00 INFO]: no TERRORS here'));
});

const SUITE = `
title = "Warps"
on = "lobby"
[[tests]]
id = "warp-menu"
title = "Warp menu teleports"
setup = ["lp user {player} permission set paradisu.warp true"]
steps = ["Run /warps", "Click the first warp"]
expect = "You are teleported"
cleanup = ["lp user {player} clear"]
[[tests]]
id = "back"
title = "Back command"
steps = ["Run /back"]
expect = "You return to the previous location"
`;

test('a manual suite parses with defaults for setup and cleanup', () => {
  const suite = parseSuite('warps', SUITE);
  assert.equal(suite.title, 'Warps');
  assert.equal(suite.on, 'lobby');
  assert.deepEqual(suite.tests.map((t) => t.id), ['warp-menu', 'back']);
  assert.deepEqual(suite.tests[1]!.setup, []);
  assert.deepEqual(suite.tests[0]!.cleanup, ['lp user {player} clear']);
});

test('a manual suite names the file and test when it is invalid', () => {
  const bad = (source: string, pattern: RegExp) => assert.throws(() => parseSuite('x', source, 'x.toml'), (error: Error) => error instanceof DevError && pattern.test(error.message));
  bad('title = "T"', /needs at least one/);
  bad('[[tests]]\nid = "a b"\ntitle = "T"\nsteps = ["s"]\nexpect = "e"', /id must be/);
  bad('[[tests]]\nid = "a"\ntitle = "T"\nsteps = []\nexpect = "e"', /at least one step/);
  bad('[[tests]]\nid = "a"\ntitle = "T"\nsteps = ["s"]', /what to expect/);
  bad('[[tests]]\nid = "a"\ntitle = "T"\nsteps = ["s"]\nexpect = "e"\n[[tests]]\nid = "a"\ntitle = "U"\nsteps = ["s"]\nexpect = "e"', /duplicate test id "a"/);
});

const { gametestFlags, pendingGameTestFlags, registerGameTestRun, clearGameTestRun } = await import('../src/testing/gametest-state.ts');

test('Fabric GameTest flags carry the report file and the optional filter', () => {
  assert.deepEqual(gametestFlags('fabric', { report: '/r.xml' }), ['-Dfabric-api.gametest', '-Dfabric-api.gametest.report-file=/r.xml']);
  assert.deepEqual(gametestFlags('fabric', { report: '/r.xml', selector: 'mymod.*' }).slice(-1), ['-Dfabric-api.gametest.filter=mymod.*']);
});

test('a platform without a GameTest report fails with what is supported and the alternative', () => {
  assert.throws(
    () => gametestFlags('purpur', { report: '/r.xml' }),
    (error: Error) => error instanceof DevError && /fabric/.test(error.message) && /GameTests\.run/.test(error.message),
  );
});

test('GameTest flags are added only to an instance with a registered run, until it is cleared', () => {
  assert.deepEqual(pendingGameTestFlags('gt', 'fabric'), []);
  registerGameTestRun('gt', { report: '/r.xml' });
  assert.equal(pendingGameTestFlags('gt', 'fabric')[0], '-Dfabric-api.gametest');
  assert.deepEqual(pendingGameTestFlags('other', 'fabric'), []);
  clearGameTestRun('gt');
  assert.deepEqual(pendingGameTestFlags('gt', 'fabric'), []);
});
