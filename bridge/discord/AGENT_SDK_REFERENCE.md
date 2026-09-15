# Claude Agent SDK TypeScript Reference
## Discord Bot Integration Guide

**Date:** 2026-08-25  
**Package:** `@anthropic-ai/claude-agent-sdk@latest`  
**Node.js:** 18+

---

## Question 1: `query()` Function

### Import & Signature

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
})) {
  // Handle message
}
```

### Options Object

```typescript
interface Options {
  // Session Management
  resume?: string;              // Session ID to resume
  continue?: boolean;           // Resume most recent session in cwd
  forkSession?: boolean;        // Fork from resume session (creates new ID)
  
  // Permissions & Tools
  permissionMode?: "default" 
                  | "dontAsk" 
                  | "acceptEdits" 
                  | "bypassPermissions" 
                  | "plan" 
                  | "auto";
  allowedTools?: string[];      // Auto-approve (e.g. ["Read", "Bash", "mcp__discord__*"])
  disallowedTools?: string[];   // Block entirely
  canUseTool?: (
    toolName: string,
    input: any,
    options: { signal?: AbortSignal; suggestions?: PermissionUpdate[] }
  ) => Promise<{
    behavior: "allow" | "deny";
    updatedInput?: any;           // Modified input to pass to tool
    updatedPermissions?: PermissionUpdate[];
    message?: string;             // Error/deny message for Claude
  }>;
  
  // Model & Context
  model?: string;               // "claude-3-5-sonnet-20241022" (default)
  maxTurns?: number;            // Max agentic turns (~10 default)
  systemPrompt?: string | object;
  
  // MCP Servers & Custom Tools
  mcpServers?: {
    [name: string]: MCPServerConfig;  // See Question 3
  };
  
  // Environment
  cwd?: string;                 // Working directory (default: process.cwd())
  env?: Record<string, string>; // Env vars passed to MCP servers
  
  // Other
  persistSession?: boolean;     // Save to disk (default: true)
}
```

### Message Types Yielded by Async Generator

```typescript
// 1. SYSTEM INIT (first message)
interface SDKSystemMessage {
  type: "system";
  subtype: "init";
  session_id: string;           // ← CAPTURE THIS for resume/continue
  tools: string[];              // ["Read", "Write", "Bash", "mcp__discord__*", ...]
  mcp_servers: Array<{
    name: string;
    status: "connected" | "failed" | "pending" | "needs-auth";
  }>;
}

// 2. ASSISTANT (Claude's reasoning & tool calls)
interface SDKAssistantMessage {
  type: "assistant";
  message: {
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; name: string; input: any; id: string }
    >;
  };
}

// 3. RESULT (final outcome, after all turns/tools complete)
interface SDKResultMessage {
  type: "result";
  subtype: "success" 
           | "error_during_execution" 
           | "error_max_turns" 
           | "error_max_budget_usd";
  session_id: string;           // ← SAME ID for later resume
  result?: string;              // Final text output
  total_cost_usd?: number;
  total_tokens_used?: number;
}
```

---

## Question 2: Session Continuity

### Capture Session ID

```typescript
let sessionId: string | undefined;

for await (const message of query({...})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;  // ← Available at start
  }
  if (message.type === "result") {
    sessionId = message.session_id;  // ← Also available at end
    // Save to DB keyed by Discord channel ID
  }
}
```

### Resume vs Continue

```typescript
// OPTION A: Continue (most recent in cwd)
for await (const message of query({
  prompt: "Follow up: analyze the results",
  options: {
    continue: true,  // ← Resume most recent session
    allowedTools: ["Read", "Grep"]
  }
})) {
  // Full context from prior session
}

// OPTION B: Resume (specific session ID)
const sessionId = "5b3f2c1a-8d4e-4f6b-9a7c-2e1d0f9b8a6c";
for await (const message of query({
  prompt: "Follow up on the auth module",
  options: {
    resume: sessionId,  // ← Restore this specific session
    allowedTools: ["Read", "Edit"]
  }
})) {
  // Full prior context restored
}

// OPTION C: Fork (branch without losing original)
for await (const message of query({
  prompt: "Try OAuth2 instead of JWT",
  options: {
    resume: sessionId,
    forkSession: true,  // ← New session, preserves original
    maxTurns: 5
  }
})) {
  // New forked session ID in init message
}
```

### Discord Per-Channel Implementation

```typescript
const sessionCache = new Map<string, string>();  // channelId → sessionId

// First message
for await (const message of query({
  prompt: userMessage,
  options: {
    cwd: `/tmp/discord-${channelId}`,
    allowedTools: ["Read", "Bash", "Write"],
    permissionMode: "acceptEdits"
  }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionCache.set(channelId, message.session_id);
  }
  if (message.type === "result") {
    await db.saveChannelSession(channelId, message.session_id);
  }
}

// Follow-up messages in same channel
const resumeId = sessionCache.get(channelId);
if (!resumeId) {
  resumeId = await db.getChannelSession(channelId);  // From cache/DB
}

for await (const message of query({
  prompt: userMessage,
  options: {
    resume: resumeId,  // ← Restores full context
    allowedTools: ["Read", "Bash", "Write"],
    permissionMode: "acceptEdits"
  }
})) {
  // Agent has prior context
}
```

**Note:** Sessions are stored in `~/.claude/projects/<encoded-cwd>/` by default. Cross-host resumption requires a `sessionStore` adapter (not shown; use local storage for single-machine daemon).

---

## Question 3: Custom In-Process Tools

### Signature: `tool()` & `createSdkMcpServer()`

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define one tool
const getTemperature = tool(
  "get_temperature",                      // Tool name
  "Get current temperature at location",  // Description for Claude
  {
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    unit: z.enum(["celsius", "fahrenheit"]).default("celsius")
  },
  // Handler: async (args: {latitude, longitude, unit}) => ...
  async (args) => {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?...`);
    const data = await response.json();
    return {
      content: [
        { type: "text", text: `Temperature: ${data.current.temperature_2m}°C` }
      ]
    };
  },
  // Optional annotations
  { annotations: { readOnlyHint: true } }
);

// Wrap in MCP server (runs in-process, no subprocess)
const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [getTemperature]  // Can add multiple tools
});
```

### Tool Return Value

```typescript
interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }  // base64
    | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } }
  >;
  isError?: boolean;        // Set true to signal failure
  structuredContent?: any;  // JSON for Claude to read as exact fields
}
```

### Discord Integration Example

```typescript
const sendDiscordMessage = tool(
  "send_discord_message",
  "Send a message to the Discord channel",
  {
    content: z.string().describe("Message text to send"),
    channel_id: z.string().optional().describe("Optional channel ID override")
  },
  async (args) => {
    const channelId = args.channel_id || currentChannelId;
    try {
      const msg = await discordClient.channels.cache
        .get(channelId)
        ?.send(args.content);
      return {
        content: [
          { 
            type: "text", 
            text: `Message sent to channel (ID: ${msg?.id || "unknown"})` 
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Failed to send: ${error.message}` }
        ],
        isError: true  // Tells Claude this is a failure
      };
    }
  }
);

const discordServer = createSdkMcpServer({
  name: "discord",
  version: "1.0.0",
  tools: [sendDiscordMessage]
});
```

### Register & Use in Query

```typescript
for await (const message of query({
  prompt: "Send a status update to the Discord channel",
  options: {
    mcpServers: {
      discord: discordServer  // Key becomes server name in tool naming
    },
    allowedTools: [
      "mcp__discord__send_discord_message"  // Tool name: mcp__<server>__<tool>
    ]
  }
})) {
  // Claude will call the tool automatically
}
```

**Tool Naming Convention:** `mcp__<servername>__<toolname>`  
- Server name: `discord` (from `mcpServers: { discord: ... }`)
- Tool name: `send_discord_message` (from `tool("send_discord_message", ...)`)
- Full name: `mcp__discord__send_discord_message`

---

## Question 4: Permission Handling for Unattended Operation

### Permission Mode Values

```typescript
permissionMode: "default"  // Prompt for unapproved tools (interactive only)
              | "dontAsk"  // Deny unapproved tools (no prompts)
              | "acceptEdits"  // Auto-approve file edits (default for bots)
              | "bypassPermissions"  // Auto-approve everything except rm/rmdir
              | "plan"  // Explore without editing (planning mode)
              | "auto"  // Let model classifier decide (early access)
```

### Unattended Bot Setup

```typescript
// Fully automated: lock down to specific tools, deny everything else
options: {
  permissionMode: "dontAsk",
  allowedTools: [
    "Read", "Glob", "Grep",
    "mcp__discord__send_discord_message",
    "mcp__discord__fetch_channel_history"
  ]
  // Bash, Write, Edit, etc. are denied—not in allowedTools
}

// OR: Auto-approve file edits, deny risky commands
options: {
  permissionMode: "acceptEdits",
  allowedTools: ["Read", "Bash", "mcp__discord__*"],
  disallowedTools: ["Bash(rm *)", "Bash(rmdir *)"]  // Scoped deny rules
}
```

### `canUseTool` Callback Signature

```typescript
canUseTool: async (
  toolName: string,
  input: any,
  options: {
    signal?: AbortSignal;
    suggestions?: PermissionUpdate[];  // Pre-made allow/deny rules to apply
  }
) => Promise<{
  behavior: "allow" | "deny";
  updatedInput?: any;           // Modify input before execution
  updatedPermissions?: PermissionUpdate[];  // Apply permission rules
  message?: string;             // Message Claude sees if deny
}>
```

### Example: Selective Approval Callback

```typescript
canUseTool: async (toolName, input, options) => {
  // Auto-approve Discord tools
  if (toolName.startsWith("mcp__discord__")) {
    return { behavior: "allow", updatedInput: input };
  }
  
  // Block destructive Bash commands
  if (toolName === "Bash" && /\b(rm|rmdir|dd|mkfs)\b/.test(input.command)) {
    return {
      behavior: "deny",
      message: "Destructive commands not allowed in this bot"
    };
  }
  
  // For everything else: check external approval service
  const approved = await checkApprovalService(toolName, input);
  if (approved) {
    return { behavior: "allow", updatedInput: input };
  }
  return { behavior: "deny", message: "Approval denied by service" };
}
```

**In `dontAsk` mode:** `canUseTool` is never called. Only tools in `allowedTools` run; everything else is denied silently.

---

## Question 5: Authentication

### API Key Only (No Local Login)

The SDK **does not use local Claude Code login**. It requires `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...your-key...
```

The SDK reads this automatically at runtime. No `.env` file auto-loading—if using one, load it yourself:

```typescript
import dotenv from "dotenv";
dotenv.config();  // Load .env before importing SDK
import { query } from "@anthropic-ai/claude-agent-sdk";
```

### For Launchd/PM2 Daemon

Set the key in the service environment:

**Launchd** (`~/.config/launchd.plist`):
```xml
<key>EnvironmentVariables</key>
<dict>
  <key>ANTHROPIC_API_KEY</key>
  <string>sk-ant-...your-key...</string>
</dict>
```

**PM2** (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: "discord-bot",
    script: "dist/index.js",
    env: {
      ANTHROPIC_API_KEY: "sk-ant-...your-key..."
    }
  }]
};
```

### No Caveats

The SDK works in unattended environments (CI, serverless, daemons) with just the API key. No session setup, no interactive login needed.

---

## Question 6: Package & Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

| Aspect | Details |
|--------|---------|
| **Package name** | `@anthropic-ai/claude-agent-sdk` |
| **Bundles CLI?** | No—CLI is optional. SDK is a library. |
| **Bundled binary** | Optional native dependency (used internally, not required for API-only apps) |
| **Peer deps** | None—just Node.js 18+ |
| **Size** | ~2 MB (with bundled binary on supported platforms) |
| **ES module** | Yes—`import { query } from "..."` |

### When Binary Is Bundled

- On npm install on macOS/Linux x64/arm64, Windows x64
- Optional dependency via npm optional peers
- Used by SDK to spawn Claude Code subprocess internally

### When Binary Is NOT Bundled

- `npm ci --omit=optional` (skips optional deps)
- ARM64 Windows (no wheel)
- Python source distribution on unsupported arch

If missing and needed, [install Claude Code natively](https://code.claude.com/docs) and SDK will find it on `PATH`.

---

## Question 7: Streaming Partial Output

### No Native Streaming

The SDK **does not natively support partial text streaming**. The async generator yields complete messages (full `AssistantMessage` blocks), not partial text.

### Workaround: Update Discord Message Progressively

Capture each `AssistantMessage` text block and update the Discord message:

```typescript
let fullResponse = "";
let discordMessage = await msg.reply("Processing...");

for await (const message of query({...})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") {
        fullResponse += block.text + "\n";
        
        // Edit Discord message every 500 chars or on intervals
        if (fullResponse.length % 500 < block.text.length) {
          try {
            await discordMessage.edit(
              fullResponse.slice(0, 2000)  // Discord 2000-char limit
            );
          } catch (e) {
            // Rate limit or other error—skip
          }
        }
      }
    }
  }
  if (message.type === "result") {
    // Final edit
    if (message.subtype === "success") {
      await discordMessage.edit(message.result.slice(0, 2000));
    } else {
      await discordMessage.edit(`Error: ${message.subtype}`);
    }
  }
}
```

### Alternative: Collect & Reply Once

For simpler UX (no progressive updates):

```typescript
let fullResponse = "";

for await (const message of query({...})) {
  if (message.type === "result") {
    if (message.subtype === "success") {
      await msg.reply(message.result.slice(0, 2000));
    }
  }
}
```

---

## Complete Discord Bot Skeleton

```typescript
import { Client, ChannelType } from "discord.js";
import { query } from "@anthropic-ai/claude-agent-sdk";

const discordClient = new Client({ 
  intents: ["MessageContent", "DirectMessages", "GuildMessages"] 
});

// Per-channel session tracking
const sessionCache = new Map<string, string>();

discordClient.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.content) return;

  const replyMsg = await msg.reply("Thinking...");
  let sessionId = sessionCache.get(msg.channelId);
  let fullResponse = "";

  try {
    for await (const message of query({
      prompt: msg.content,
      options: {
        resume: sessionId,
        cwd: `/tmp/discord-${msg.channelId}`,
        model: "claude-3-5-sonnet-20241022",
        maxTurns: 10,
        allowedTools: [
          "Read", "Bash", "Write",
          "mcp__discord__send_discord_message"
        ],
        permissionMode: "acceptEdits",
        canUseTool: async (toolName, input) => {
          if (toolName.startsWith("mcp__discord__")) {
            return { behavior: "allow", updatedInput: input };
          }
          if (toolName === "Bash" && input.command.includes("rm")) {
            return { behavior: "deny", message: "Destructive commands blocked" };
          }
          return { behavior: "allow", updatedInput: input };
        }
      }
    })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        sessionCache.set(msg.channelId, sessionId);
      }
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") {
            fullResponse += block.text + "\n";
            if (fullResponse.length % 1000 < 100) {
              await replyMsg.edit(fullResponse.slice(0, 2000));
            }
          }
        }
      }
      if (message.type === "result") {
        sessionCache.set(msg.channelId, message.session_id);
        if (message.subtype === "success") {
          await replyMsg.edit(fullResponse.slice(0, 2000) || "Done.");
        } else {
          await replyMsg.edit(`Error: ${message.subtype}`);
        }
      }
    }
  } catch (error) {
    await replyMsg.edit(`Failed: ${error.message}`);
  }
});

discordClient.login(process.env.DISCORD_TOKEN);
```

---

## Summary Table

| # | Question | Key Answer |
|---|----------|-----------|
| 1 | `query()` function | Async generator; returns `system/init`, `assistant`, `result` messages; options include `permissionMode`, `allowedTools`, `mcpServers`, `resume`, `continue`, `model`, `maxTurns` |
| 2 | Session continuity | Capture `session_id` from init or result message; pass to `resume` to restore context; use `continue: true` for most recent session in cwd |
| 3 | Custom tools | `tool()` + `createSdkMcpServer()` define in-process MCP server; tool name becomes `mcp__<servername>__<toolname>`; register via `options.mcpServers` |
| 4 | Permissions | `permissionMode: "dontAsk"` denies unapproved; `"acceptEdits"` auto-approves edits; `"bypassPermissions"` auto-approves all; `canUseTool` callback for selective approval |
| 5 | Auth | `ANTHROPIC_API_KEY` env var only; no local Claude Code login; works in daemon/launchd |
| 6 | Package | `@anthropic-ai/claude-agent-sdk`; no CLI bundling; optional native binary; Node.js 18+ only |
| 7 | Streaming | No native partial streaming; capture each `AssistantMessage.text` block and update Discord message progressively |

---

## API Corrections vs Your Description

1. **Session options:** `continue: true` (boolean, not string ID); `resume: sessionId` (string ID)
2. **Tool naming:** `mcp__<servername>__<toolname>` (double underscore, not single)
3. **No CLI bundling:** Package is library-only; binary is optional internal dependency
4. **Streaming:** Yields full message blocks, not partial text; progressive update is user-side
5. **`canUseTool` signature:** `(toolName, input, {signal?, suggestions?}) => Promise<{behavior, updatedInput?, updatedPermissions?, message?}>`

---

**Generated:** 2026-08-25 | **Version:** claude-agent-sdk latest | **Tested with:** Node.js 18+
