import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

/**
 * 두 백엔드가 함께 쓰는 파일 기반 페르소나.
 *
 * PERSONA_FILE(기본 ./persona.md)을 프로세스당 한 번 읽고 캐시한다. 파일에 사람용 메모를 둘 수 있게
 * HTML 주석(<!-- ... -->)은 지우고, {{AGENT_NAME}} 은 AGENT_NAME 으로 바꾼다. 파일이 없으면 동봉된
 * persona.example.md 를 쓰고 경고를 남긴다. 그래서 막 clone 한 상태에서도 돈다.
 */

export const BUNDLED_PERSONA_FILE = fileURLToPath(new URL('../persona.example.md', import.meta.url));

export function renderPersona(raw, { agentName = config.agentName } = {}) {
  return String(raw ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replaceAll('{{AGENT_NAME}}', agentName)
    .trim();
}

export function loadPersona({ file = config.personaFile, agentName = config.agentName } = {}) {
  let source = file;
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    console.warn(`[persona] ${file} 이 없어서 동봉된 ${BUNDLED_PERSONA_FILE} 를 쓴다. ${file} 로 복사해서 고쳐 쓴다.`);
    source = BUNDLED_PERSONA_FILE;
    raw = fs.readFileSync(BUNDLED_PERSONA_FILE, 'utf8');
  }
  const text = renderPersona(raw, { agentName });
  if (!text) console.warn(`[persona] ${source} 가 비어 있다. 페르소나 없이 에이전트를 돌린다.`);
  return { text, source };
}

let cached = null;

/** 이 프로세스의 페르소나. 첫 호출에서 읽고(index.js 가 시작할 때 부른다) 이후에는 재사용한다. */
export function persona() {
  if (!cached) cached = loadPersona();
  return cached;
}
