import path from 'node:path';
import process from 'node:process';

function parseIdList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function parseNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const workspaceDir = path.resolve(process.env.WORKSPACE_DIR || './workspace');
// claude = Claude Agent SDK, codex = 로컬 codex CLI
const backend = process.env.AGENT_BACKEND || 'claude';

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  allowedChannelIds: parseIdList(process.env.ALLOWED_CHANNEL_IDS),
  allowedUserIds: parseIdList(process.env.ALLOWED_USER_IDS),
  workspaceDir,
  sessionsFile: path.resolve(process.env.SESSIONS_FILE || './sessions.json'),
  permissionMode: process.env.PERMISSION_MODE || 'bypassPermissions',
  model: process.env.CLAUDE_MODEL || undefined,
  // 기본 모델이 과부하(529)일 때 CLI 가 바꿔 쓰는 모델(--fallback-model). 빈 문자열이면 끈다.
  fallbackModel: process.env.CLAUDE_FALLBACK_MODEL === undefined ? 'claude-sonnet-5' : (process.env.CLAUDE_FALLBACK_MODEL.trim() || undefined),
  // CLI 의 API 재시도 횟수(기본 10 -> 3). 529 마다 열한 번씩 재시도하면 요청 하나가 몇 분씩 걸린다.
  claudeMaxRetries: parseNumber(process.env.CLAUDE_CODE_MAX_RETRIES, 3),
  maxTurns: Number(process.env.MAX_TURNS || 50),
  // 요청(job) 하나의 최대 실행 시간. 넘으면 에이전트 실행을 중단하고 스레드에 알린다.
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS || 1800000),

  // ── 스레드 기록 컨텍스트 ──
  threadContextEnabled: parseBool(process.env.THREAD_CONTEXT_ENABLED, true),
  threadContextMaxMessages: parseNumber(process.env.THREAD_CONTEXT_MAX_MESSAGES, 30),
  threadContextMaxChars: parseNumber(process.env.THREAD_CONTEXT_MAX_CHARS, 24000),
  threadContextMsgMaxChars: parseNumber(process.env.THREAD_CONTEXT_MSG_MAX_CHARS, 500),

  // ── 봇 간 대화 정책 ──
  // 'mention_only' = 다른 봇이 나를 명시적으로 멘션할 때만 답한다 / 'never' = 봇은 항상 무시한다
  respondToBots: (process.env.RESPOND_TO_BOTS || 'mention_only').trim(),
  // 이 봇을 부를 수 있는 봇 계정 id. 비어 있으면 어떤 봇도 부를 수 없다.
  allowedBotIds: parseIdList(process.env.ALLOWED_BOT_IDS),
  // 이 봇에 준 역할 id. 역할 멘션을 나에 대한 멘션으로 칠 때 쓴다.
  botRoleIds: parseIdList(process.env.BOT_ROLE_IDS),
  // 사람 메시지 없이 연속으로 받아 줄 봇 트리거 수(루프 방지)
  botMaxChainDepth: parseNumber(process.env.BOT_MAX_CHAIN_DEPTH, 2),

  backend,
  agentName: process.env.AGENT_NAME || (backend === 'codex' ? 'Codex' : 'Claude'),
  // prompt 앞에 붙는 페르소나 파일(src/persona.js 참고). 상대 경로는 프로세스 cwd 기준이다.
  personaFile: path.resolve(process.env.PERSONA_FILE || './persona.md'),

  // ── codex 백엔드 ──
  codexBin: process.env.CODEX_BIN || 'codex',
  codexModel: process.env.CODEX_MODEL || undefined,
  codexSandbox: process.env.CODEX_SANDBOX || 'danger-full-access',
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT || undefined,
  codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 1800000),
};

export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
