import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/**
 * cwd 는 상위 채널 단위다(workspace/<parentChannelId>/).
 * 같은 채널에서 시작한 스레드끼리 파일을 공유한다.
 */
export async function channelWorkspace(workspaceKey) {
  const dir = path.join(config.workspaceDir, workspaceKey);
  await fs.mkdir(path.join(dir, 'inbox'), { recursive: true });
  return dir;
}
