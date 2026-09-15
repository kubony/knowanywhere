/**
 * 봇끼리 메시지를 끝없이 주고받지 않게 막는 장치 두 개.
 *
 * 1) 연속 봇 트리거 카운터: 사람 메시지 없이 봇 메시지만으로 botMaxChainDepth 에 닿으면
 *    다음 봇 메시지는 무시한다.
 * 2) 메시지 id LRU: 같은 메시지를 두 번 받아도(재연결, 중복 이벤트) 한 번만 처리한다.
 */
import { config } from './config.js';

const RECENT_MAX = 500;

/** chainKey -> 마지막 사람 메시지 이후 연속으로 처리한 봇 메시지 수 */
const chainCounts = new Map();
/** 최근 처리한 메시지 id (삽입 순서 = LRU) */
const recentIds = new Set();

/** 이미 처리한 메시지면 true. 아니면 기록하고 false 를 돌려준다. */
export function markSeen(messageId) {
  if (!messageId) return false;
  if (recentIds.has(messageId)) return true;
  recentIds.add(messageId);
  if (recentIds.size > RECENT_MAX) {
    const oldest = recentIds.values().next().value;
    recentIds.delete(oldest);
  }
  return false;
}

export function chainDepth(chainKey) {
  return chainCounts.get(chainKey) ?? 0;
}

/** 사람 메시지를 처리했다. 체인을 끊는다. */
export function resetChain(chainKey) {
  chainCounts.delete(chainKey);
}

/**
 * 봇 메시지를 트리거로 받을지 정한다.
 * 받으면 카운터를 올리고 true, 한도에 닿았으면 카운터를 그대로 두고 false.
 */
export function allowBotTrigger(chainKey) {
  const limit = config.botMaxChainDepth;
  const depth = chainDepth(chainKey);
  if (depth >= limit) return false;
  chainCounts.set(chainKey, depth + 1);
  return true;
}

/** 테스트용: 모든 상태를 초기화한다. */
export function __resetBotChain() {
  chainCounts.clear();
  recentIds.clear();
}
