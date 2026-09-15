/**
 * 스레드/채널의 최근 대화를 에이전트 prompt 에 넣을 텍스트로 만든다.
 *
 * - 새 세션(sinceMessageId 없음): 스레드면 시작 메시지 + 트리거 이전의 최근 메시지.
 * - 이어지는 세션(sinceMessageId 있음): 그 뒤로 다른 사람·봇이 쓴 메시지만(이 봇 자신은 뺀다).
 *
 * fetch 가 실패해도 throw 하지 않는다. 기록은 있으면 좋은 것이지 답하기 위한 전제 조건이 아니다.
 */

const PERMISSION_CODES = new Set([50001, 50013]);

/** discord.js Collection / Map / Array 를 배열로 바꾼다. */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === 'function') return [...value.values()];
  return [];
}

function isPermissionError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? err?.status);
  if (PERMISSION_CODES.has(code)) return true;
  return /missing access|missing permissions/i.test(String(err?.message ?? err));
}

/** Snowflake 비교. id 가 숫자가 아니면 문자열 비교로 대신한다. */
export function compareIds(a, b) {
  if (a === b) return 0;
  try {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  } catch {
    const x = String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
}

/** 두 id 중 더 새로운(큰) 것. 한쪽이 비었으면 다른 쪽. */
export function maxId(a, b) {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return compareIds(a, b) >= 0 ? a : b;
}

function formatTimestamp(msg) {
  const raw = msg?.createdTimestamp ?? (msg?.createdAt ? msg.createdAt.getTime() : null);
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return '????-??-??T??:??:??Z';
  return new Date(Number(raw)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function displayNameOf(msg) {
  return (
    msg?.member?.displayName
    ?? msg?.author?.globalName
    ?? msg?.author?.displayName
    ?? msg?.author?.username
    ?? msg?.author?.tag
    ?? 'unknown'
  );
}

function truncate(text, max) {
  const s = String(text ?? '');
  if (max > 0 && s.length > max) return `${s.slice(0, max)}…`;
  return s;
}

/** 메시지 하나를 한 줄로 만든다. 내용도 첨부도 없으면 null. */
export function formatMessageLine(msg, msgMaxChars) {
  const rawContent = (typeof msg?.cleanContent === 'string' && msg.cleanContent)
    ? msg.cleanContent
    : (msg?.content ?? '');
  const flat = String(rawContent).replace(/\s*\n\s*/g, ' ').trim();
  const attachments = toArray(msg?.attachments).map((a) => {
    const name = a?.name ?? 'file';
    const url = a?.url ?? '';
    return url ? ` [attachment: ${name} ${url}]` : ` [attachment: ${name}]`;
  });
  if (!flat && attachments.length === 0) return null;

  const kind = msg?.author?.bot ? 'bot' : 'user';
  const reply = msg?.reference?.messageId ? ` ↩ reply:${msg.reference.messageId}` : '';
  const head = `[${formatTimestamp(msg)}] ${displayNameOf(msg)} (id:${msg?.author?.id ?? '?'}, ${kind})${reply}`;
  return `${head}: ${truncate(flat, msgMaxChars)}${attachments.join('')}`;
}

/**
 * @param channel  트리거 메시지가 있던 채널(스레드면 그 스레드)
 * @param opts.botUserId         내 봇 id. 이어지는 세션의 증분에서 내 메시지는 뺀다
 * @param opts.triggerMessageId  지금 처리하는 메시지(중복이므로 항상 뺀다)
 * @param opts.sinceMessageId    이 id 이후만 가져온다(없으면 새 세션)
 * @returns {Promise<{text: string, count: number, newestId: string|null, error?: string}>}
 */
export async function fetchThreadContext(channel, opts = {}) {
  const {
    botUserId,
    triggerMessageId,
    sinceMessageId,
    maxMessages = 30,
    maxChars = 24000,
    msgMaxChars = 500,
  } = opts;

  const empty = { text: '', count: 0, newestId: null };
  if (!channel || maxMessages <= 0 || maxChars <= 0) return empty;
  if (typeof channel.messages?.fetch !== 'function') return empty;

  const collected = [];
  let newestId = null;
  const isThread = typeof channel.isThread === 'function' && (() => {
    try { return Boolean(channel.isThread()); } catch { return false; }
  })();

  try {
    if (sinceMessageId) {
      const fetched = toArray(await channel.messages.fetch({ after: sinceMessageId, limit: maxMessages }));
      collected.push(...fetched);
    } else {
      if (isThread && typeof channel.fetchStarterMessage === 'function') {
        // 스레드 시작 메시지(상위 채널의 메시지)는 맥락에 중요하다. 실패는 무시한다.
        const starter = await channel.fetchStarterMessage().catch(() => null);
        if (starter) collected.push(starter);
      }
      const fetchOpts = { limit: maxMessages };
      if (triggerMessageId) fetchOpts.before = triggerMessageId;
      const fetched = toArray(await channel.messages.fetch(fetchOpts));
      collected.push(...fetched);
    }
  } catch (err) {
    if (isPermissionError(err)) {
      console.warn(`[context] 기록을 읽을 권한이 없다 (${channel.id ?? '?'}): ${err?.message ?? err}`);
      return { ...empty, error: 'no-permission' };
    }
    console.warn(`[context] 기록 가져오기 실패 (${channel.id ?? '?'}): ${err?.message ?? err}`);
    return { ...empty, error: 'fetch-failed' };
  }

  // 본 메시지는 모두 watermark 를 옮긴다(걸러 낸 메시지도 포함. 다음 턴에 다시 읽지 않게).
  for (const m of collected) {
    if (m?.id) newestId = maxId(newestId, m.id);
  }

  const seen = new Set();
  const kept = [];
  for (const m of collected) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    if (triggerMessageId && m.id === triggerMessageId) continue;
    if (sinceMessageId && botUserId && m.author?.id === botUserId) continue;
    if (m.system) continue;
    kept.push(m);
  }

  kept.sort((a, b) => compareIds(a.id, b.id)); // 오래된 것 -> 새것

  const lines = [];
  for (const m of kept) {
    const line = formatMessageLine(m, msgMaxChars);
    if (line) lines.push(line);
  }

  // maxChars 상한: 새 메시지를 우선한다. 넘으면 가장 오래된 줄부터 버린다.
  let total = lines.reduce((sum, l) => sum + l.length + 1, 0) - 1;
  while (lines.length > 0 && total > maxChars) {
    total -= lines[0].length + 1;
    lines.shift();
  }

  return { text: lines.join('\n'), count: lines.length, newestId };
}
