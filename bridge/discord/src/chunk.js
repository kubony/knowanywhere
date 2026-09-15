import { DISCORD_MESSAGE_LIMIT } from './config.js';

const FENCE = /^\s*```/;

/**
 * Discord 메시지 길이 제한에 맞게 텍스트를 나눈다.
 * - 가능하면 줄 경계에서 나눈다.
 * - 코드 블록 안에서 나뉘면 앞 조각은 fence 를 닫고 다음 조각이 다시 연다.
 */
export function chunkMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  const source = String(text ?? '').replace(/\s+$/, '');
  if (!source) return [];

  const chunks = [];
  let current = '';
  let fenceInfo = null; // 현재 조각에서 열려 있는 fence 의 여는 줄(예: "```js")
  let carryFence = null; // 다음 조각 첫머리에 다시 열 fence

  const flush = () => {
    if (!current) return;
    let out = current;
    if (fenceInfo) {
      out += '\n```';
      carryFence = fenceInfo;
    } else {
      carryFence = null;
    }
    chunks.push(out);
    current = carryFence ? carryFence : '';
    fenceInfo = carryFence;
  };

  const pushLine = (line) => {
    const candidate = current ? `${current}\n${line}` : line;
    const reserve = fenceInfo ? 4 : 0; // 닫는 fence 자리
    if (candidate.length + reserve <= limit) {
      current = candidate;
      return;
    }
    if (current) {
      flush();
      pushLine(line);
      return;
    }
    // 한 줄이 제한보다 길면 강제로 자른다
    let rest = line;
    while (rest.length > 0) {
      const reserveNow = fenceInfo ? 4 : 0;
      const room = limit - (current ? current.length + 1 : 0) - reserveNow;
      if (room <= 0) {
        flush();
        continue;
      }
      const piece = rest.slice(0, room);
      rest = rest.slice(room);
      current = current ? `${current}\n${piece}` : piece;
      if (rest.length > 0) flush();
    }
  };

  for (const line of source.split('\n')) {
    if (FENCE.test(line)) {
      if (fenceInfo) {
        // 닫는 fence
        pushLine(line);
        fenceInfo = null;
        continue;
      }
      pushLine(line);
      fenceInfo = line.trimEnd();
      continue;
    }
    pushLine(line);
  }

  if (current.trim() && current.trim() !== (carryFence ?? '').trim()) {
    chunks.push(fenceInfo ? `${current}\n\`\`\`` : current);
  }

  return chunks.filter((c) => c.trim().length > 0);
}
