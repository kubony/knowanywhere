import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { AttachmentBuilder } from 'discord.js';
import { DISCORD_FILE_LIMIT_BYTES, DISCORD_MESSAGE_LIMIT } from './config.js';

export const SEND_FILE_TOOL = 'mcp__discord__send_file';

/**
 * 처리 중인 채널에 파일을 올리는 in-process MCP 서버를 만든다.
 * 채널을 클로저로 잡으므로 요청마다 새로 만든다.
 * 도구 설명과 결과 문구는 모델이 읽는 텍스트라서 영어로 둔다.
 */
export function createDiscordMcpServer({ channel, workspaceDir }) {
  const sendFile = tool(
    'send_file',
    'Upload a local file to the Discord channel. Use it to deliver files (images, documents, code, ...) to the user. Size limit 25 MB.',
    {
      file_path: z.string().describe('Absolute path of the file to upload, or a path relative to the working directory'),
      comment: z.string().optional().describe('Short note sent with the file (optional)'),
    },
    async (args) => {
      const target = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(workspaceDir, args.file_path);
      try {
        const stat = await fs.stat(target);
        if (!stat.isFile()) {
          return { content: [{ type: 'text', text: `${target} is not a file.` }], isError: true };
        }
        if (stat.size > DISCORD_FILE_LIMIT_BYTES) {
          return {
            content: [{
              type: 'text',
              text: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)} MB (limit 25 MB). Compress it or send part of it.`,
            }],
            isError: true,
          };
        }
        const attachment = new AttachmentBuilder(target, { name: path.basename(target) });
        const content = args.comment ? String(args.comment).slice(0, DISCORD_MESSAGE_LIMIT) : undefined;
        const sent = await channel.send({ content, files: [attachment] });
        return {
          content: [{ type: 'text', text: `Uploaded: ${path.basename(target)} (${stat.size} bytes, message ${sent.id})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Upload failed: ${err?.message ?? String(err)}` }],
          isError: true,
        };
      }
    },
  );

  return createSdkMcpServer({
    name: 'discord',
    version: '1.0.0',
    tools: [sendFile],
  });
}
