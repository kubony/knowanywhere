#!/usr/bin/env node
// knowanywhere state 도우미. .knowanywhere/state.json 을 원자적으로 읽고 쓴다.
// 비밀이 아닌 값만 다룬다. 비밀값처럼 보이는 키나 값은 거부한다.
// 스키마: docs/state.md. Node >= 20 필요. 의존성 없음.
//
// 사용법 (어디서 실행해도 경로는 레포 루트 기준으로 잡힌다):
//   node .claude/skills/kna-status/state.mjs status [--json]
//   node .claude/skills/kna-status/state.mjs next
//   node .claude/skills/kna-status/state.mjs get [dot.path]
//   node .claude/skills/kna-status/state.mjs init
//   node .claude/skills/kna-status/state.mjs set '<deep-merge 할 JSON 객체>'
//   node .claude/skills/kna-status/state.mjs step <id> <pending|done|skipped>
//   node .claude/skills/kna-status/state.mjs mode <fresh|join>
//   node .claude/skills/kna-status/state.mjs agent-add '{"name":"로제","machine":"macbook","kind":"claude","sessions_collection":"로제 Sessions"}'
//   node .claude/skills/kna-status/state.mjs path
//
// `next` 출력("03 kna-03-vm" 또는 "complete")과 `status --json` 의 키는 다른 스킬이 읽으므로
// 형식을 바꾸지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = path.join(REPO, '.knowanywhere');
const FILE = path.join(DIR, 'state.json');
const VERSION = 1;

export const STEPS = [
  ['00', 'kna-00-start'],
  ['01', 'kna-01-gcp-account'],
  ['02', 'kna-02-budget'],
  ['03', 'kna-03-vm'],
  ['04', 'kna-04-dns'],
  ['05', 'kna-05-google-oauth'],
  ['06', 'kna-06-outline-deploy'],
  ['07', 'kna-07-mcp-connect'],
  ['08', 'kna-08-collections'],
  ['09', 'kna-09-persona'],
  ['10', 'kna-10-discord'],
  ['11', 'kna-11-backups'],
  ['12', 'kna-12-add-agent'],
];
const FRESH_ONLY = ['01', '02', '03', '04', '05', '06', '11'];
const ON_DEMAND = ['12']; // next 로 고르지 않는다. 에이전트나 머신을 추가할 때만 실행한다.
const STATUSES = ['pending', 'done', 'skipped'];
const KINDS = ['claude', 'codex', 'hermes'];

// 비밀값 검사. 이 파일 자체에 실제 접두사 문자열이 들어가지 않도록 패턴을 쪼개 썼다.
const SECRET_KEY = /(secret|token|passw|private|api_?key|hmac|credential)/i;
const SECRET_VALUE = [
  /sk-an[t]-/, /\bsk-[A-Za-z0-9]{20,}/, /ol_ap[i]_/, /ol_a[t]_/, /GOCSP[X]-/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bGOOG[0-9A-Z]{10,}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bxox[abpr]-/,
  /[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/, // Discord bot token 형태
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
];

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const die = (msg, code = 1) => { process.stderr.write(`state.mjs: ${msg}\n`); process.exit(code); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function load() {
  if (!fs.existsSync(FILE)) return null;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { die(`${FILE} 를 해석할 수 없다: ${e.message}`); }
}

function save(state) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  // 이전 버전이 0644 로 만든 파일은 먼저 0600 으로 좁힌다. 아래 쓰기가 실패해도 옛 파일이 0644 로 남지 않게 한다.
  if (fs.existsSync(FILE)) fs.chmodSync(FILE, 0o600);
  const tmp = `${FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  // umask 가 mode 를 더 좁힐 수는 있어도 넓히지는 못하므로, 명시적으로 0600 을 맞춘다.
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, FILE);
}

function fresh() {
  const steps = {};
  for (const [id] of STEPS) steps[id] = { status: 'pending', at: null };
  return { version: VERSION, created_at: now(), steps, agents: [] };
}

function guard(value, where = '') {
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      const p = where ? `${where}.${k}` : k;
      if (SECRET_KEY.test(k)) die(`거부: 키 "${p}" 가 비밀값 이름처럼 보인다. 비밀값은 state 에 쓰지 않는다.`, 2);
      guard(v, p);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => guard(v, `${where}[${i}]`));
  } else if (typeof value === 'string' && SECRET_VALUE.some((re) => re.test(value))) {
    die(`거부: "${where}" 의 값이 비밀값처럼 보인다(값은 출력하지 않는다). 비밀값은 state 에 쓰지 않는다.`, 2);
  }
}

// gcp.budget 은 null 이거나 {"amount": 양수, "currency": "KRW" 같은 ISO 4217 코드} 여야 한다(docs/state.md).
function checkBudget(patch) {
  if (!isObj(patch.gcp) || !('budget' in patch.gcp)) return;
  const b = patch.gcp.budget;
  if (b === null) return;
  const ok = isObj(b) && typeof b.amount === 'number' && b.amount > 0
    && typeof b.currency === 'string' && /^[A-Z]{3}$/.test(b.currency);
  if (!ok) die('gcp.budget 은 null 이거나 {"amount": 양수, "currency": "USD"} 모양이어야 한다');
}

function merge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(target[k])) merge(target[k], v);
    else target[k] = v;
  }
  return target;
}

function getPath(obj, dot) {
  if (!dot) return obj;
  return dot.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function nextStep(state) {
  if (!state) return STEPS[0];
  for (const [id, skill] of STEPS) {
    if (ON_DEMAND.includes(id)) continue;
    const st = state.steps?.[id]?.status ?? 'pending';
    if (state.mode === 'join' && FRESH_ONLY.includes(id)) continue;
    if (st === 'pending') return [id, skill];
  }
  return null;
}

function requireState() {
  const s = load();
  if (!s) die('state 파일이 아직 없다. 먼저 kna-00-start 단계를 실행한다(그 단계가 "init" 을 실행한다).');
  return s;
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'path':
    console.log(FILE);
    break;
  case 'init': {
    if (load()) { console.log(`이미 있음: ${FILE} (건드리지 않았다)`); break; }
    save(fresh());
    console.log(`생성함: ${FILE}`);
    break;
  }
  case 'get': {
    const s = requireState();
    const v = getPath(s, args[0]);
    console.log(v === undefined ? 'null' : JSON.stringify(v, null, 2));
    break;
  }
  case 'set': {
    if (!args[0]) die('set 에는 JSON 객체 인자가 필요하다');
    let patch;
    try { patch = JSON.parse(args[0]); } catch (e) { die(`JSON 이 올바르지 않다: ${e.message}`); }
    if (!isObj(patch)) die('set 에는 JSON 객체가 필요하다');
    guard(patch);
    checkBudget(patch);
    const s = merge(requireState(), patch);
    // gcp.budget 이 옛 키 gcp.budget_usd 를 대신한다. 새 키를 쓰면 옛 키를 지운다.
    if (isObj(patch.gcp) && 'budget' in patch.gcp && isObj(s.gcp)) delete s.gcp.budget_usd;
    save(s);
    console.log(JSON.stringify(patch, null, 2));
    break;
  }
  case 'step': {
    const [id, status] = args;
    if (!STEPS.some(([i]) => i === id)) die(`알 수 없는 단계 id "${id}" (00..12 중 하나)`);
    if (!STATUSES.includes(status)) die(`status 는 ${STATUSES.join('|')} 중 하나여야 한다`);
    const s = requireState();
    s.steps = s.steps || {};
    s.steps[id] = { status, at: status === 'pending' ? null : now() };
    save(s);
    console.log(JSON.stringify({ steps: { [id]: s.steps[id] } }, null, 2));
    break;
  }
  case 'mode': {
    const [m] = args;
    if (!['fresh', 'join'].includes(m)) die('mode 는 fresh 또는 join 이어야 한다');
    const s = requireState();
    const prev = s.mode;
    s.mode = m;
    s.steps = s.steps || {};
    for (const id of FRESH_ONLY) {
      const cur = s.steps[id] || { status: 'pending', at: null };
      if (m === 'join' && cur.status === 'pending') s.steps[id] = { status: 'skipped', at: now() };
      else if (m === 'fresh' && prev === 'join' && cur.status === 'skipped') s.steps[id] = { status: 'pending', at: null };
      else s.steps[id] = cur;
    }
    save(s);
    console.log(JSON.stringify({ mode: m, steps: Object.fromEntries(FRESH_ONLY.map((id) => [id, s.steps[id]])) }, null, 2));
    break;
  }
  case 'agent-add': {
    let a;
    try { a = JSON.parse(args[0] || ''); } catch (e) { die(`JSON 이 올바르지 않다: ${e.message}`); }
    for (const k of ['name', 'machine', 'kind', 'sessions_collection']) if (!a?.[k]) die(`agent 에 "${k}" 가 필요하다`);
    if (!KINDS.includes(a.kind)) die(`kind 는 ${KINDS.join('|')} 중 하나여야 한다`);
    guard(a, 'agents[]');
    const s = requireState();
    s.agents = (s.agents || []).filter((x) => !(x.name === a.name && x.machine === a.machine));
    s.agents.push({ name: a.name, machine: a.machine, kind: a.kind, sessions_collection: a.sessions_collection });
    save(s);
    console.log(JSON.stringify({ agents: s.agents }, null, 2));
    break;
  }
  case 'next': {
    const n = nextStep(load());
    console.log(n ? `${n[0]} ${n[1]}` : 'complete');
    break;
  }
  case 'status': {
    const s = load();
    const n = nextStep(s);
    if (args.includes('--json')) {
      console.log(JSON.stringify({ file: FILE, exists: !!s, mode: s?.mode ?? null,
        agent: s?.agent?.name ?? null, language: s?.language ?? null,
        steps: STEPS.map(([id, skill]) => ({ id, skill, status: s?.steps?.[id]?.status ?? 'pending',
          at: s?.steps?.[id]?.at ?? null, on_demand: ON_DEMAND.includes(id) })),
        next: n ? { id: n[0], skill: n[1] } : null }, null, 2));
      break;
    }
    if (!s) { console.log(`state 파일 없음 (${FILE}). 첫 실행이다. 다음 단계: 00 kna-00-start`); break; }
    console.log(`state: ${FILE}`);
    console.log(`mode: ${s.mode ?? '-'}   agent: ${s.agent?.name ?? '-'}   language: ${s.language ?? '-'}`);
    console.log('');
    console.log('id  skill                    status     at');
    for (const [id, skill] of STEPS) {
      const st = s.steps?.[id]?.status ?? 'pending';
      const label = ON_DEMAND.includes(id) && st === 'pending' ? 'on-demand' : st;
      console.log(`${id}  ${skill.padEnd(23)}  ${label.padEnd(9)}  ${s.steps?.[id]?.at ?? '-'}`);
    }
    console.log('');
    console.log(`다음: ${n ? `${n[0]} ${n[1]}` : '완료 (다른 에이전트나 머신을 추가하려면 kna-12-add-agent)'}`);
    break;
  }
  default:
    die('사용법: state.mjs <status [--json]|next|get [path]|init|set JSON|step ID STATUS|mode fresh|join|agent-add JSON|path>');
}
