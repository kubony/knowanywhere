// SDK 스모크 테스트: query() 가 도는지, 어떤 인증을 쓰는지 확인한다. Discord 는 필요 없다.
// 로컬 `claude` 로그인이나 ANTHROPIC_API_KEY 로 아주 작은 실제 모델 호출을 한 번 한다.
import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
console.log(`[smoke] ANTHROPIC_API_KEY 있음: ${hasKey}`);
console.log(`[smoke] cwd: ${process.cwd()}`);

const t0 = Date.now();
try {
  for await (const message of query({
    prompt: 'What is 1+1? Answer with the number only.',
    options: {
      maxTurns: 2,
      permissionMode: 'dontAsk',
      allowedTools: [],
      stderr: (d) => process.stderr.write(`[cli-stderr] ${d}`),
    },
  })) {
    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`[smoke] init session_id=${message.session_id} model=${message.model ?? 'n/a'}`);
    } else if (message.type === 'assistant') {
      for (const block of message.message.content ?? []) {
        if (block.type === 'text') console.log(`[smoke] assistant: ${block.text}`);
      }
    } else if (message.type === 'result') {
      console.log(`[smoke] result subtype=${message.subtype} is_error=${message.is_error}`);
      console.log(`[smoke] result text: ${message.result ?? '(없음)'}`);
      console.log(`[smoke] cost_usd=${message.total_cost_usd} turns=${message.num_turns}`);
    }
  }
  console.log(`[smoke] 완료 (${Date.now() - t0}ms)`);
} catch (err) {
  console.error(`[smoke] 실패: ${err?.message ?? err}`);
  process.exitCode = 1;
}
