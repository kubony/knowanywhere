// 스레드 라우팅 mock 테스트. runClaude 를 stub 하므로 모델 API 를 부르지 않는다.
// 실행: node scripts/thread-test.mjs
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

// config.js 가 로드되기 전에 격리된 경로를 준다(dotenv 는 이미 있는 env 값을 유지하므로 .env 보다 우선한다).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kna-bridge-thread-test-'));
// 로컬 .env 를 읽지 않도록 ENV_FILE 을 없는 파일로 가리킨다.
process.env.ENV_FILE = path.join(tmp, 'no-such.env');
process.env.SESSIONS_FILE = path.join(tmp, 'sessions.json');
process.env.WORKSPACE_DIR = path.join(tmp, 'workspace');
process.env.ALLOWED_CHANNEL_IDS = '';
process.env.ALLOWED_USER_IDS = '';
process.env.AGENT_NAME = 'Aria';

const { handleMessage, __setRunClaude } = await import('../src/index.js');
const { sessions } = await import('../src/sessions.js');

const BOT_ID = 'BOT1';
const USER_ID = 'U1';

function makeChannel({ id, type, parentId, ownerId }) {
  return {
    id,
    type,
    parentId,
    ownerId,
    sent: [],
    typingCount: 0,
    isThread() {
      return type === ChannelType.PublicThread || type === ChannelType.PrivateThread;
    },
    async send(content) {
      this.sent.push(typeof content === 'string' ? content : JSON.stringify(content));
      return { id: `m${this.sent.length}` };
    },
    async sendTyping() { this.typingCount += 1; },
  };
}

let msgSeq = 1000;
function makeMessage({ channel, content, mentionBot = false, startThread }) {
  const msg = {
    id: String(++msgSeq),
    author: { id: USER_ID, tag: 'user#0001', bot: false },
    channelId: channel.id,
    channel,
    content,
    attachments: new Map(),
    mentions: { users: new Map(mentionBot ? [[BOT_ID, { id: BOT_ID }]] : []) },
    replies: [],
    async reply(c) { this.replies.push(c); return { id: 'r1' }; },
  };
  if (startThread) msg.startThread = startThread.bind(msg);
  return msg;
}

const calls = [];
__setRunClaude(async (args) => {
  calls.push({
    sessionKey: args.sessionKey,
    workspaceKey: args.workspaceKey,
    channelId: args.channel?.id,
    resumeFrom: sessions.get(args.sessionKey),
    prompt: args.prompt,
  });
  // 실제 runner 처럼 세션 id 를 기록한다.
  sessions.set(args.sessionKey, `sess-${args.sessionKey}`);
  return { text: `reply:${args.prompt}`, sessionId: `sess-${args.sessionKey}`, subtype: 'success', isError: false };
});

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push([true, name]); console.log(`PASS  ${name}`); })
    .catch((e) => { results.push([false, name]); console.error(`FAIL  ${name}\n      ${e.message}`); });
}

// ── (a) 채널 메시지 -> startThread 호출, 답은 스레드로 ──
await check('(a) 채널 멘션 -> 스레드 생성, 스레드 안에서 답', async () => {
  const parent = makeChannel({ id: 'C_PARENT', type: ChannelType.GuildText });
  let threadArgs = null;
  const thread = makeChannel({ id: 'T_NEW', type: ChannelType.PublicThread, parentId: 'C_PARENT', ownerId: BOT_ID });
  const msg = makeMessage({
    channel: parent,
    content: `<@${BOT_ID}>   explain   the repository layout in detail so this runs past thirty characters`,
    mentionBot: true,
    async startThread(opts) { threadArgs = opts; return thread; },
  });

  const res = await handleMessage(msg, BOT_ID);
  await res.promise;

  assert.ok(threadArgs, 'startThread 가 불리지 않았다');
  assert.equal(threadArgs.autoArchiveDuration, 1440);
  assert.equal(threadArgs.name, 'explain the repository layout in detail so this runs past thirty characters'.slice(0, 30));
  assert.ok(threadArgs.name.length <= 30, `스레드 이름이 30자를 넘는다: ${threadArgs.name.length}`);
  assert.equal(res.createdThread, true);
  assert.equal(res.sessionKey, 'T_NEW', '세션 키가 스레드 id 가 아니다');
  assert.equal(res.workspaceKey, 'C_PARENT', 'workspace 키가 상위 채널이 아니다');
  assert.equal(parent.sent.length, 0, '답이 상위 채널로 샜다');
  assert.deepEqual(thread.sent, ['reply:explain   the repository layout in detail so this runs past thirty characters']);
  assert.ok(thread.typingCount >= 1, '스레드에 입력 중 표시를 보내지 않았다');
  const call = calls.at(-1);
  assert.equal(call.channelId, 'T_NEW', 'runClaude 가 스레드가 아닌 채널을 받았다');
  assert.equal(call.resumeFrom, undefined, '새 스레드가 기존 세션을 resume 했다');
});

// ── (b) 스레드 안 후속 메시지 -> 같은 세션 키로 resume, 새 스레드 없음 ──
await check('(b) 스레드 후속 메시지 -> 같은 세션 키 resume, 새 스레드 없음', async () => {
  const thread = makeChannel({ id: 'T_NEW', type: ChannelType.PublicThread, parentId: 'C_PARENT', ownerId: BOT_ID });
  let startThreadCalled = false;
  const msg = makeMessage({
    channel: thread,
    content: 'now explain only what is under src/',
    mentionBot: false, // 멘션 없이도 답해야 한다
    async startThread() { startThreadCalled = true; throw new Error('스레드 안에서 스레드를 만들려 했다'); },
  });

  const res = await handleMessage(msg, BOT_ID);
  assert.equal(res.handled, true, '스레드 안의 멘션 없는 메시지에 답하지 않았다');
  await res.promise;

  assert.equal(startThreadCalled, false, '스레드 안에서 startThread 를 불렀다');
  assert.equal(res.createdThread, false);
  assert.equal(res.sessionKey, 'T_NEW');
  assert.equal(res.workspaceKey, 'C_PARENT');
  const call = calls.at(-1);
  assert.equal(call.sessionKey, 'T_NEW', '(a) 와 다른 세션 키를 썼다');
  assert.equal(call.resumeFrom, 'sess-T_NEW', '(a) 에서 만든 세션을 resume 하지 않았다');
  assert.deepEqual(thread.sent, ['reply:now explain only what is under src/']);
});

// ── (c) startThread 가 throw -> 채널에서 답하는 쪽으로 ──
await check('(c) startThread 실패 -> 채널에서 바로 답', async () => {
  const parent = makeChannel({ id: 'C_NOPERM', type: ChannelType.GuildText });
  const msg = makeMessage({
    channel: parent,
    content: `<@${BOT_ID}> channel without thread permission`,
    mentionBot: true,
    async startThread() { throw new Error('Missing Permissions'); },
  });

  const res = await handleMessage(msg, BOT_ID);
  await res.promise;

  assert.equal(res.createdThread, false);
  assert.equal(res.sessionKey, 'C_NOPERM', 'fallback 세션 키가 채널 id 가 아니다');
  assert.equal(res.workspaceKey, 'C_NOPERM');
  assert.deepEqual(parent.sent, ['reply:channel without thread permission'], 'fallback 답이 채널로 가지 않았다');
  assert.equal(calls.at(-1).channelId, 'C_NOPERM');
});

// ── (d) 텍스트가 비었을 때 스레드 이름 ──
await check('(d) 스레드 이름 fallback 형식', async () => {
  const { threadNameFor } = await import('../src/index.js');
  assert.equal(threadNameFor('', new Date(2026, 7, 25, 9, 5)), 'Aria 응답 09:05');
  assert.equal(threadNameFor('  \n\t  ', new Date(2026, 7, 25, 23, 59)), 'Aria 응답 23:59');
});

await sessions.flush();
fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
