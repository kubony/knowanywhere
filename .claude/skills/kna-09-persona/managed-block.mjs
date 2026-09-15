#!/usr/bin/env node
// knowanywhere 관리 블록을 렌더링하고 적용한다 (Node >= 20, 의존성 없음).
//
//   node managed-block.mjs render --template <file> --values <json-file> --out <file>
//       {{KEY}} placeholder 를 JSON 객체의 값으로 바꾼다. 값이 없는 placeholder 가 있거나, 값 안에 다른
//       placeholder 가 들어 있으면 실패한다. 그 밖에는 아무것도 바꾸지 않는다.
//   node managed-block.mjs apply --block <file> --target <file> [--dry-run]
//       블록(첫 줄이 start 마커, 마지막 줄이 end 마커여야 한다)을 target 에 넣는다. 마커 구간이 있으면
//       교체하고, 없으면 끝에 덧붙이고, 파일이 없으면 만든다.
//       멱등이다. 내용이 같으면 "변경 없음"을 출력하고 아무것도 쓰지 않는다. 기존 target 을 쓰기 전에
//       <target>.bak-<YYYYMMDDTHHMMSSZ> 로 복사한다. 임시 파일에 쓰고 rename 하며, 파일 mode 를 유지한다.
//       target 의 마커가 짝이 없거나, 여러 번 나오거나, 순서가 틀리면 거부한다(exit 3, 아무것도 쓰지 않음).
//   node managed-block.mjs show --target <file>
//       현재 마커 구간을 출력한다. 없으면 "없음".
//
// 마커는 각각 한 줄을 차지해야 한다.
import fs from 'node:fs';
import path from 'node:path';

const START = '<!-- knowanywhere:start -->';
const END = '<!-- knowanywhere:end -->';
// 출력용 동작 이름. 내부 값(created/appended/replaced)은 그대로 둔다.
const ACTION_KO = { created: '생성함', appended: '덧붙임', replaced: '교체함' };

const die = (msg, code = 1) => { process.stderr.write(`managed-block: ${msg}\n`); process.exit(code); };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const expandHome = (p) => (p && p.startsWith('~/') ? path.join(process.env.HOME || '', p.slice(2)) : p);

function markerLines(text) {
  const lines = text.split('\n');
  const starts = [];
  const ends = [];
  lines.forEach((l, i) => {
    if (l.trim() === START) starts.push(i);
    if (l.trim() === END) ends.push(i);
  });
  return { lines, starts, ends };
}

function render({ template, values, out }) {
  if (!template || !values || !out) die('render 에는 --template, --values, --out 이 필요하다');
  const tpl = fs.readFileSync(expandHome(template), 'utf8');
  const vals = JSON.parse(fs.readFileSync(expandHome(values), 'utf8'));
  const missing = new Set();
  const rendered = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) => {
    const v = vals[key];
    if (v === undefined || v === null || String(v).trim() === '') { missing.add(key); return m; }
    const s = String(v);
    if (/\{\{[A-Z0-9_]+\}\}/.test(s)) die(`${key} 값 안에 placeholder 가 있다`);
    return s;
  });
  if (missing.size) die(`값이 없는 placeholder: ${[...missing].join(', ')}`);
  const target = expandHome(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, rendered);
  console.log(`렌더링함: ${target} (${rendered.split('\n').length}줄)`);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function apply({ block, target, dryRun }) {
  if (!block || !target) die('apply 에는 --block 과 --target 이 필요하다');
  let blk = fs.readFileSync(expandHome(block), 'utf8').replace(/\s+$/, '');
  const b = markerLines(blk);
  if (b.starts.length !== 1 || b.ends.length !== 1 || b.starts[0] !== 0 || b.ends[0] !== b.lines.length - 1) {
    die(`블록은 "${START}" 로 시작하고 "${END}" 로 끝나야 하며, 각 마커는 정확히 한 번씩 있어야 한다`, 3);
  }
  const file = expandHome(target);
  const exists = fs.existsSync(file);
  const before = exists ? fs.readFileSync(file, 'utf8') : '';
  let after;
  let action;
  if (!exists) {
    after = `${blk}\n`;
    action = 'created';
  } else {
    const t = markerLines(before);
    if (t.starts.length === 0 && t.ends.length === 0) {
      after = `${before.replace(/\s+$/, '')}${before.trim() ? '\n\n' : ''}${blk}\n`;
      action = 'appended';
    } else if (t.starts.length === 1 && t.ends.length === 1 && t.starts[0] < t.ends[0]) {
      const lines = [...t.lines.slice(0, t.starts[0]), ...blk.split('\n'), ...t.lines.slice(t.ends[0] + 1)];
      after = lines.join('\n');
      action = 'replaced';
    } else {
      die(`${file} 에 start 마커 ${t.starts.length}개, end 마커 ${t.ends.length}개가 있다(또는 순서가 틀렸다). 손으로 고친 뒤 다시 실행한다. 아무것도 쓰지 않았다.`, 3);
    }
  }
  if (after === before) { console.log(`변경 없음: ${file}`); return; }
  if (dryRun) { console.log(`dry-run: ${file} 을(를) ${ACTION_KO[action]} 예정 (아무것도 쓰지 않았다)`); return; }
  let backup = null;
  if (exists) {
    // 이전 백업은 절대 덮어쓰지 않는다. 같은 이름이 있으면 COPYFILE_EXCL 이 실패하므로 번호를 붙인다.
    const base = `${file}.bak-${stamp()}`;
    for (let n = 0; !backup; n++) {
      const candidate = n ? `${base}-${n}` : base;
      try { fs.copyFileSync(file, candidate, fs.constants.COPYFILE_EXCL); backup = candidate; }
      catch (err) { if (err.code !== 'EEXIST') throw err; }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = exists ? fs.statSync(file).mode & 0o777 : 0o644;
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, after, { mode });
  fs.renameSync(tmp, file);
  console.log(`${ACTION_KO[action]}: ${file}${backup ? ` (백업: ${backup})` : ''}`);
}

function show({ target }) {
  if (!target) die('show 에는 --target 이 필요하다');
  const file = expandHome(target);
  if (!fs.existsSync(file)) { console.log('없음 (파일이 없다)'); return; }
  const t = markerLines(fs.readFileSync(file, 'utf8'));
  if (t.starts.length === 1 && t.ends.length === 1 && t.starts[0] < t.ends[0]) {
    console.log(t.lines.slice(t.starts[0], t.ends[0] + 1).join('\n'));
  } else if (t.starts.length === 0 && t.ends.length === 0) {
    console.log('없음');
  } else {
    die(`마커가 잘못됐다: start ${t.starts.length}개, end ${t.ends.length}개`, 3);
  }
}

const args = parseArgs(process.argv.slice(2));
switch (args._[0]) {
  case 'render': render(args); break;
  case 'apply': apply(args); break;
  case 'show': show(args); break;
  default: die('사용법: managed-block.mjs render|apply|show (파일 머리 주석 참고)');
}
