import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { config, DISCORD_FILE_LIMIT_BYTES } from './config.js';
import { sessions } from './sessions.js';
import { channelWorkspace } from './workspace.js';
import { persona } from './persona.js';

const PERSONA_SEPARATOR = '\n\n---\n\n';
const OUTBOX = 'outbox';

/**
 * codex 는 cwd 의 AGENTS.md 를 읽을 뿐 별도 system prompt 를 넘길 방법이 없다.
 * Discord 페르소나(PERSONA_FILE, src/persona.js 참고)는 새 세션의 첫 prompt 에만 붙인다.
 * resume 한 턴은 사용자 prompt 만 보낸다.
 */
export function personaFor() {
  return persona().text;
}

function withPersona(prompt) {
  const text = personaFor();
  return text ? `${text}${PERSONA_SEPARATOR}${prompt}` : prompt;
}

export function buildArgs({ cwd, resumeId, prompt }) {
  const args = ['exec'];
  if (resumeId) args.push('resume', resumeId);
  args.push('--json', '--skip-git-repo-check', '-C', cwd, '-s', config.codexSandbox);
  if (config.codexModel) args.push('-m', config.codexModel);
  if (config.codexReasoningEffort) args.push('-c', `model_reasoning_effort=${config.codexReasoningEffort}`);
  args.push(prompt);
  return args;
}

/** AbortController 나 AbortSignal 을 받아 AbortSignal 로 맞춘다. index.js 는 runClaude 와 같게 AbortController 를 넘긴다. */
function toSignal(controllerOrSignal) {
  if (!controllerOrSignal) return null;
  if (typeof controllerOrSignal.addEventListener === 'function' && 'aborted' in controllerOrSignal) return controllerOrSignal;
  if (controllerOrSignal.signal) return controllerOrSignal.signal;
  return null;
}

/**
 * codex CLI 를 한 번 실행하고 JSONL 이벤트를 파싱한다.
 * 실패(0 이 아닌 exit / error / turn.failed)하면 Error 를 던진다.
 */
function execCodex({ cwd, args, sessionKey, onText, onTool, abortController }) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.codexBin, args, {
      cwd,
      // stdin 은 닫아야 한다. 열려 있으면 codex 가 입력을 더 기다린다.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let threadId;
    const texts = [];
    const seenItems = new Set();
    let usage;
    let turnCompleted = false;
    let failure = null;
    let settled = false;
    let stdoutBuf = '';
    let stderrBuf = '';

    const abortSignal = toSignal(abortController);
    let timer = null;
    let onAbort = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (abortSignal && onAbort) abortSignal.removeEventListener('abort', onAbort);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    timer = setTimeout(() => {
      const err = new Error(`codex 가 ${Math.round(config.codexTimeoutMs / 1000)}초 안에 끝나지 않아 중단했다.`);
      err.noRetry = true;
      child.kill('SIGKILL');
      fail(err);
    }, config.codexTimeoutMs);

    if (abortSignal) {
      if (abortSignal.aborted) {
        child.kill('SIGKILL');
      } else {
        onAbort = () => {
          child.kill('SIGKILL');
          const err = new Error('요청이 취소됐다.');
          err.noRetry = true;
          fail(err);
        };
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    const handleEvent = (ev) => {
      switch (ev.type) {
        case 'thread.started':
          if (ev.thread_id) {
            threadId = ev.thread_id;
            sessions.set(sessionKey, threadId);
          }
          break;
        case 'item.started':
        case 'item.completed': {
          const item = ev.item ?? {};
          if (item.type === 'agent_message') {
            if (ev.type === 'item.completed' && item.text) texts.push(item.text);
            break;
          }
          const key = item.id ?? `${item.type}:${texts.length}`;
          if (item.type && !seenItems.has(key)) {
            seenItems.add(key);
            onTool?.(item.type);
          }
          break;
        }
        case 'turn.completed':
          turnCompleted = true;
          usage = ev.usage;
          break;
        case 'turn.failed':
          failure = ev.error?.message || 'turn.failed';
          break;
        case 'error':
          failure = ev.message || 'codex error';
          break;
        default:
          break;
      }
    };

    const consumeLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let ev;
      try {
        ev = JSON.parse(trimmed);
      } catch {
        // JSON 이 아닌 줄(진행 로그 등)은 무시한다.
        return;
      }
      if (ev && typeof ev === 'object') handleEvent(ev);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk;
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        consumeLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
      process.stderr.write(`[codex] ${chunk}`);
    });

    child.on('error', (err) => {
      const wrapped = new Error(`codex 실행 실패 (${config.codexBin}): ${err.message}`);
      wrapped.noRetry = err.code === 'ENOENT';
      fail(wrapped);
    });

    child.on('close', (code, sig) => {
      if (stdoutBuf) consumeLine(stdoutBuf);
      stdoutBuf = '';
      if (failure) {
        fail(new Error(`codex 실패: ${failure}`));
        return;
      }
      if (code !== 0) {
        const tail = stderrBuf.trim().split('\n').slice(-5).join('\n');
        fail(new Error(`codex 가 비정상 종료했다 (exit ${code}${sig ? `, signal ${sig}` : ''})${tail ? `:\n${tail}` : ''}`));
        return;
      }
      const text = texts.join('\n\n').trim();
      if (text) onText?.(text);
      done({ text, threadId, usage, turnCompleted });
    });
  });
}

async function snapshotOutbox(dir) {
  const snapshot = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return snapshot;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(path.join(dir, entry.name));
      snapshot.set(entry.name, stat.mtimeMs);
    } catch { /* 그사이 사라진 파일은 무시한다 */ }
  }
  return snapshot;
}

/**
 * 실행 중에 outbox/ 에 새로 생기거나 바뀐 파일을 Discord 에 올린다.
 * 올린 파일은 지운다. 실패하거나 너무 큰 파일은 경고 줄로 남긴다.
 */
async function flushOutbox({ dir, channel, before }) {
  const notes = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return notes;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    const prev = before.get(entry.name);
    if (prev !== undefined && stat.mtimeMs <= prev) continue;

    if (stat.size > DISCORD_FILE_LIMIT_BYTES) {
      notes.push(`⚠️ \`outbox/${entry.name}\` 는 ${(stat.size / 1024 / 1024).toFixed(1)} MB 라서 올리지 않았다(제한 25 MB).`);
      continue;
    }
    try {
      await channel.send({ files: [{ attachment: full, name: entry.name }] });
      await fs.rm(full, { force: true });
    } catch (err) {
      notes.push(`⚠️ \`outbox/${entry.name}\` 업로드 실패: ${err?.message ?? String(err)}`);
    }
  }
  return notes;
}

/**
 * 사용자 메시지 하나를 codex CLI 로 처리한다. 시그니처와 반환 형태는 runClaude 와 같다.
 * 반환: { text, sessionId, subtype, isError, costUsd, turns }
 */
export async function runCodex({ channel, sessionKey, workspaceKey, prompt, onText, onTool, abortController }) {
  const cwd = await channelWorkspace(workspaceKey ?? sessionKey);
  const outboxDir = path.join(cwd, OUTBOX);
  await fs.mkdir(outboxDir, { recursive: true });
  const before = await snapshotOutbox(outboxDir);

  const resumeId = sessions.get(sessionKey);
  const freshPrompt = withPersona(prompt);

  let result;
  try {
    result = await execCodex({
      cwd,
      args: buildArgs({ cwd, resumeId, prompt: resumeId ? prompt : freshPrompt }),
      sessionKey,
      onText,
      onTool,
      abortController,
    });
  } catch (err) {
    if (!resumeId || err?.noRetry) throw err;
    // 저장된 thread 가 없어졌거나 resume 이 깨졌다. 새 세션으로 한 번 다시 시도한다.
    console.warn(`[codex] resume 실패 (${err?.message ?? err}). 새 세션으로 다시 시도한다.`);
    sessions.clear(sessionKey);
    result = await execCodex({
      cwd,
      args: buildArgs({ cwd, resumeId: undefined, prompt: freshPrompt }),
      sessionKey,
      onText,
      onTool,
      abortController,
    });
  }

  const notes = await flushOutbox({ dir: outboxDir, channel, before });
  const text = [result.text, ...notes].filter(Boolean).join('\n\n').trim();

  return {
    text,
    sessionId: result.threadId ?? sessions.get(sessionKey),
    subtype: result.turnCompleted ? 'success' : 'unknown',
    isError: !result.turnCompleted,
    costUsd: undefined,
    turns: undefined,
  };
}
