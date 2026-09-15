import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from './config.js';
import { sessions } from './sessions.js';
import { channelWorkspace } from './workspace.js';
import { createDiscordMcpServer } from './discord-mcp.js';
import { persona } from './persona.js';

export { channelWorkspace };

// 페르소나는 system prompt 가 아니라 user prompt 맨 앞에 넣는다.
// 구독(OAuth) 인증에서는 Claude Code 기본값과 다른 system prompt(`append` 포함)를 주면 모든 요청이
// HTTP 529 overloaded_error 로 실패한다(SDK 0.3.259, 2026-08-30 부터 관찰).
// 매 턴 붙이므로 resume 이 실패해 새 세션으로 다시 시도해도 페르소나가 빠지지 않는다.
// 텍스트는 PERSONA_FILE 에서 온다(src/persona.js 참고).
const PERSONA_SEPARATOR = '\n\n---\n\n';

export function personaHeader(agentName = config.agentName) {
  return `[Persona for ${agentName}: follow these instructions]`;
}

export function withPersona(prompt, { text = persona().text, agentName = config.agentName } = {}) {
  if (!text) return prompt;
  return `${personaHeader(agentName)}\n${text}${PERSONA_SEPARATOR}${prompt}`;
}

function buildOptions({ cwd, channel, resumeId }) {
  const options = {
    cwd,
    maxTurns: config.maxTurns,
    permissionMode: config.permissionMode,
    // `append` 를 넣으면 OAuth 인증에서 529 가 난다. 페르소나는 withPersona() 로 prompt 에 넣는다.
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    mcpServers: { discord: createDiscordMcpServer({ channel, workspaceDir: cwd }) },
    // 주의: 여기에 MCP 도구 이름(SEND_FILE_TOOL)을 넣으면 OAuth 인증에서 systemPrompt append 와 같은 529 가 난다
    // (2026-09-03 확인: 내장 도구만 넣으면 되고, MCP 도구를 더하면 overloaded_error 11/11).
    // 기본 permissionMode(bypassPermissions)에서는 도구가 승인 없이 돌기 때문에 목록에 없어도 send_file 이 된다.
    allowedTools: [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite',
    ],
    stderr: (data) => process.stderr.write(`[claude] ${data}`),
    // options.env 는 자식 프로세스 환경을 통째로 바꾸므로 process.env 를 펼쳐 넣는다.
    // CLAUDE_CODE_MAX_RETRIES 는 CLI 가 읽는다. 529 재시도 폭주(기본 10회)를 줄인다.
    env: { ...process.env, CLAUDE_CODE_MAX_RETRIES: String(config.claudeMaxRetries) },
  };
  // 기본 모델이 과부하면 CLI 가 이 모델로 바꾼다(다음 턴은 다시 기본 모델에서 시작한다).
  if (config.fallbackModel) options.fallbackModel = config.fallbackModel;
  // bypassPermissions 는 SDK 에서 명시적 확인 플래그가 필요하다.
  if (config.permissionMode === 'bypassPermissions') {
    options.allowDangerouslySkipPermissions = true;
  }
  if (config.model) options.model = config.model;
  if (resumeId) options.resume = resumeId;
  return options;
}

/**
 * 사용자 메시지 하나를 Claude 로 처리한다.
 * channel:      답과 파일 업로드가 가는 곳(스레드면 그 스레드)
 * sessionKey:   Claude 세션 키. 스레드 id 또는 DM 채널 id
 * workspaceKey: cwd 키. 상위 채널 id
 * onText: assistant 텍스트 블록마다 불린다(진행 표시)
 * abortController: 호출자가 abort() 하면 도는 query 가 멈춘다(SDK 가 AbortController 를 받는다)
 * 반환: { text, sessionId, subtype, isError, costUsd, turns }
 */
export async function runClaude({ channel, sessionKey, workspaceKey, prompt, onText, onTool, abortController }) {
  const cwd = await channelWorkspace(workspaceKey ?? sessionKey);
  const resumeId = sessions.get(sessionKey);
  const options = buildOptions({ cwd, channel, resumeId });
  if (abortController) options.abortController = abortController;
  const fullPrompt = withPersona(prompt);

  let sessionId = resumeId;
  let collected = '';
  let finalResult = null;

  const run = async (opts) => {
    collected = '';
    for await (const message of query({ prompt: fullPrompt, options: opts })) {
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        sessions.set(sessionKey, sessionId);
      } else if (message.type === 'assistant') {
        for (const block of message.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            collected += (collected ? '\n' : '') + block.text;
            onText?.(block.text);
          } else if (block.type === 'tool_use') {
            onTool?.(block.name);
          }
        }
      } else if (message.type === 'result') {
        sessionId = message.session_id;
        sessions.set(sessionKey, sessionId);
        finalResult = message;
      }
    }
  };

  try {
    await run(options);
  } catch (err) {
    // 저장된 세션이 없어졌거나 깨졌다. 새 세션으로 한 번 다시 시도한다.
    const msg = err?.message ?? String(err);
    if (resumeId && /session|resume/i.test(msg)) {
      console.warn(`[claude] resume 실패 (${msg}). 새 세션으로 다시 시도한다.`);
      sessions.clear(sessionKey);
      const fresh = buildOptions({ cwd, channel, resumeId: undefined });
      if (abortController) fresh.abortController = abortController;
      await run(fresh);
    } else {
      throw err;
    }
  }

  const text = (finalResult?.subtype === 'success' && finalResult.result) || collected;
  return {
    text: text?.trim() ?? '',
    sessionId,
    subtype: finalResult?.subtype ?? 'unknown',
    isError: Boolean(finalResult?.is_error) || finalResult?.subtype !== 'success',
    costUsd: finalResult?.total_cost_usd,
    turns: finalResult?.num_turns,
  };
}
