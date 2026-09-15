// codex backend mock test. Does not call the real codex CLI; injects a fake
// executable through CODEX_BIN and checks the JSONL protocol handling.
// Run: node scripts/codex-runner-test.mjs
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kna-bridge-codex-test-'));
const fakeDir = path.join(tmp, 'fake');
fs.mkdirSync(fakeDir, { recursive: true });

const CALLS = path.join(fakeDir, 'calls.jsonl');
const MODE = path.join(fakeDir, 'mode.txt');
const THREAD = path.join(fakeDir, 'thread.txt');

// ── fake codex executable ──
const FAKE = `#!/usr/bin/env node
import fs from 'node:fs';
const dir = process.env.FAKE_CODEX_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(dir + '/calls.jsonl', JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
const mode = fs.readFileSync(dir + '/mode.txt', 'utf8').trim();
const threadId = fs.readFileSync(dir + '/thread.txt', 'utf8').trim();
const isResume = args.includes('resume');
const cwdFlag = args[args.indexOf('-C') + 1];
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');

process.stderr.write('fake codex booting\\n');

if (mode === 'resume-fail' && isResume) {
  emit({ type: 'error', message: 'thread not found: ' + args[args.indexOf('resume') + 1] });
  process.exit(1);
}

emit({ type: 'thread.started', thread_id: threadId });
emit({ type: 'turn.started' });
// Partial line buffering check: write one event in two pieces.
const partial = JSON.stringify({ type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'echo hi', status: 'in_progress' } });
process.stdout.write(partial.slice(0, 20));
process.stdout.write(partial.slice(20) + '\\n');
emit({ type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'echo hi', aggregated_output: 'hi', exit_code: 0, status: 'completed' } });
emit({ type: 'item.completed', item: { id: 'i2', type: 'reasoning', text: 'thinking' } });
process.stdout.write('not json at all\\n');

if (mode === 'outbox') {
  fs.mkdirSync(cwdFlag + '/outbox', { recursive: true });
  fs.writeFileSync(cwdFlag + '/outbox/report.txt', 'hello from the codex agent');
}

if (mode === 'fail') {
  emit({ type: 'turn.failed', error: { message: 'model refused' } });
  process.exit(0);
}

emit({ type: 'item.completed', item: { id: 'i3', type: 'agent_message', text: 'pong' } });
emit({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } });
process.exit(0);
`;
const fakeBin = path.join(fakeDir, 'fake-codex.mjs');
fs.writeFileSync(fakeBin, FAKE);
fs.chmodSync(fakeBin, 0o755);

const setMode = (mode, threadId) => {
  fs.writeFileSync(MODE, mode);
  fs.writeFileSync(THREAD, threadId);
  fs.writeFileSync(CALLS, '');
};
const readCalls = () =>
  fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ── isolate the environment before config.js reads it ──
process.env.FAKE_CODEX_DIR = fakeDir;
process.env.CODEX_BIN = fakeBin;
process.env.AGENT_BACKEND = 'codex';
// Do not read a local .env: point ENV_FILE at a file that does not exist.
process.env.ENV_FILE = path.join(tmp, 'no-such.env');
process.env.SESSIONS_FILE = path.join(tmp, 'sessions.json');
process.env.WORKSPACE_DIR = path.join(tmp, 'workspace');
process.env.CODEX_MODEL = '';
process.env.CODEX_REASONING_EFFORT = '';
// Use the default name for this backend, and a missing persona file so the bundled persona.example.md is used.
delete process.env.AGENT_NAME;
process.env.PERSONA_FILE = path.join(tmp, 'no-persona-here.md');

const { runCodex } = await import('../src/codex-runner.js');
const { sessions } = await import('../src/sessions.js');
const { config } = await import('../src/config.js');

const CWD = path.join(tmp, 'workspace', 'W1');

function makeChannel() {
  return {
    id: 'T1',
    sent: [],
    async send(payload) { this.sent.push(payload); return { id: 'm1' }; },
  };
}

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push([true, name]); console.log(`PASS  ${name}`); })
    .catch((e) => { results.push([false, name]); console.error(`FAIL  ${name}\n      ${e.message}`); });
}

// ── (a) new session ──
await check('(a) new session -> exec --json -C <cwd>, persona prepended, thread_id stored', async () => {
  setMode('ok', 'TH-1');
  const channel = makeChannel();
  const tools = [];
  const res = await runCodex({
    channel, sessionKey: 'S1', workspaceKey: 'W1', prompt: 'ping',
    onTool: (t) => tools.push(t),
  });

  const calls = readCalls();
  assert.equal(calls.length, 1, `codex call count is not 1: ${calls.length}`);
  const { args } = calls[0];
  assert.equal(args[0], 'exec');
  assert.ok(!args.includes('resume'), 'used resume for a new session');
  for (const flag of ['--json', '--skip-git-repo-check', '-C', '-s']) {
    assert.ok(args.includes(flag), `argument ${flag} missing: ${args.join(' ')}`);
  }
  assert.equal(args[args.indexOf('-C') + 1], CWD, '-C is not the channel workspace');
  assert.equal(args[args.indexOf('-s') + 1], 'danger-full-access');
  assert.ok(!args.includes('-m'), 'passed -m although CODEX_MODEL is empty');
  assert.ok(!args.includes('-c'), 'passed -c although CODEX_REASONING_EFFORT is empty');

  const sent = args.at(-1);
  assert.ok(sent.includes('이름: Codex'),'persona not prepended (or {{AGENT_NAME}} not replaced)');
  assert.ok(sent.includes('outbox/'), 'persona has no outbox/ instruction');
  assert.ok(sent.endsWith('\n\n---\n\nping'), `user prompt does not follow the separator: ${JSON.stringify(sent.slice(-30))}`);

  assert.equal(sessions.get('S1'), 'TH-1', 'thread_id not stored in sessions');
  assert.equal(res.text, 'pong');
  assert.equal(res.isError, false);
  assert.equal(res.subtype, 'success');
  assert.equal(res.sessionId, 'TH-1');
  assert.ok(tools.includes('command_execution'), `onTool did not get command_execution: ${tools}`);
  assert.ok(tools.includes('reasoning'), 'unknown item.type values must be reported to onTool too');
  assert.equal(tools.filter((t) => t === 'command_execution').length, 1, 'tool reported twice via item.started/completed');
  assert.equal(channel.sent.length, 0, 'sent a file although outbox is empty');
});

// ── (b) second call -> resume ──
await check('(b) second call -> exec resume <thread_id>, no persona', async () => {
  setMode('ok', 'TH-1');
  const res = await runCodex({ channel: makeChannel(), sessionKey: 'S1', workspaceKey: 'W1', prompt: 'ping2' });

  const calls = readCalls();
  assert.equal(calls.length, 1);
  const { args } = calls[0];
  assert.equal(args[0], 'exec');
  assert.equal(args[1], 'resume');
  assert.equal(args[2], 'TH-1');
  assert.ok(args.includes('--json'), 'resume needs --json too');
  assert.equal(args[args.indexOf('-C') + 1], CWD);
  assert.equal(args.at(-1), 'ping2', 'persona added on resume');
  assert.equal(res.text, 'pong');
});

// ── (c) resume fails -> retry with a new session ──
await check('(c) resume fails (exit 1 + error) -> one retry with a new session', async () => {
  setMode('resume-fail', 'TH-2');
  const res = await runCodex({ channel: makeChannel(), sessionKey: 'S1', workspaceKey: 'W1', prompt: 'ping3' });

  const calls = readCalls();
  assert.equal(calls.length, 2, `expected 2 calls including the retry: ${calls.length}`);
  assert.ok(calls[0].args.includes('resume'), 'first call was not a resume');
  assert.ok(!calls[1].args.includes('resume'), 'retry was not a new session');
  assert.ok(calls[1].args.at(-1).includes('이름: Codex'), 'retry prompt has no persona');
  assert.equal(sessions.get('S1'), 'TH-2', 'not updated to the new thread_id');
  assert.equal(res.text, 'pong');
  assert.equal(res.isError, false);
});

// ── (d) outbox file upload ──
await check('(d) outbox file -> channel.send({files}) then deleted', async () => {
  setMode('outbox', 'TH-9');
  const channel = makeChannel();
  const res = await runCodex({ channel, sessionKey: 'S2', workspaceKey: 'W2', prompt: 'send me the file' });

  assert.equal(channel.sent.length, 1, `expected exactly 1 upload: ${channel.sent.length}`);
  const payload = channel.sent[0];
  assert.ok(Array.isArray(payload.files), 'send payload has no files');
  assert.equal(payload.files[0].name, 'report.txt');
  assert.equal(payload.files[0].attachment, path.join(tmp, 'workspace', 'W2', 'outbox', 'report.txt'));
  assert.equal(fs.existsSync(payload.files[0].attachment), false, 'file not deleted after upload');
  assert.equal(res.text, 'pong');
});

// ── (e) turn.failed → throw ────────────────────────────────────────────────
await check('(e) turn.failed → throw', async () => {
  setMode('fail', 'TH-F');
  await assert.rejects(
    () => runCodex({ channel: makeChannel(), sessionKey: 'S3', workspaceKey: 'W3', prompt: 'fail please' }),
    (err) => {
      assert.match(err.message, /model refused/, `error message lacks the cause: ${err.message}`);
      return true;
    },
  );
  assert.equal(config.agentName, 'Codex', 'default name for AGENT_BACKEND=codex is not Codex');
});

await sessions.flush();
fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
