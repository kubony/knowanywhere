import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/**
 * sessionKey(스레드 id / DM 채널 id) -> { sessionId, lastSeenMessageId } 를
 * 메모리와 sessions.json 에 보관한다.
 *
 * 옛 형식(값이 문자열 = sessionId)은 load() 에서 { sessionId: v } 로 옮긴다.
 */
export class SessionStore {
  constructor(file) {
    this.file = file;
    this.map = new Map();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const data = JSON.parse(raw);
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') {
          // 옛 형식을 옮긴다
          this.map.set(k, { sessionId: v });
        } else if (v && typeof v === 'object') {
          const entry = {};
          if (typeof v.sessionId === 'string') entry.sessionId = v.sessionId;
          if (typeof v.lastSeenMessageId === 'string') entry.lastSeenMessageId = v.lastSeenMessageId;
          if (entry.sessionId || entry.lastSeenMessageId) this.map.set(k, entry);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[sessions] ${this.file} 를 읽지 못했다: ${err.message}. 빈 상태로 시작한다.`);
      }
    }
    return this;
  }

  /** 에이전트 sessionId 문자열(없으면 undefined). */
  get(sessionKey) {
    return this.map.get(sessionKey)?.sessionId;
  }

  /** { sessionId, lastSeenMessageId } 항목 전체(없으면 undefined). */
  getMeta(sessionKey) {
    return this.map.get(sessionKey);
  }

  getLastSeen(sessionKey) {
    return this.map.get(sessionKey)?.lastSeenMessageId;
  }

  set(sessionKey, sessionId) {
    if (!sessionKey || !sessionId) return;
    const entry = this.map.get(sessionKey);
    if (entry?.sessionId === sessionId) return;
    this.map.set(sessionKey, { ...(entry ?? {}), sessionId });
    this.persist();
  }

  setLastSeen(sessionKey, messageId) {
    if (!sessionKey || !messageId) return;
    const entry = this.map.get(sessionKey);
    if (entry?.lastSeenMessageId === messageId) return;
    this.map.set(sessionKey, { ...(entry ?? {}), lastSeenMessageId: String(messageId) });
    this.persist();
  }

  /** sessionId 와 lastSeenMessageId 를 함께 지운다. */
  clear(sessionKey) {
    const had = this.map.delete(sessionKey);
    if (had) this.persist();
    return had;
  }

  persist() {
    const snapshot = Object.fromEntries(this.map);
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await fs.rename(tmp, this.file);
    }).catch((err) => {
      console.error(`[sessions] 저장 실패: ${err.message}`);
    });
    return this.writeChain;
  }

  flush() {
    return this.writeChain;
  }
}

export const sessions = new SessionStore(config.sessionsFile);
