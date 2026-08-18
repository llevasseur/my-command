// The doc-snippet invariant, and the construct model behind it.
//
// The allowed cases below are not guesses. Each was sent to a real Bash call from inside an
// isolated worktree and observed to run: an input redirect, an `&&` short-circuit, a bare
// `$(( ))`, an assignment the next command reads, two plain commands on separate lines, and a
// heredoc feeding stdin. The refused cases were observed to be refused. A change here that
// starts flagging one of the allowed shapes is wrong however many snippets it catches — the
// gate's own rule is that a false denial costs more than a missed violation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refusal, shellBlocks, substituted } from './check-doc-snippets.mjs';

/** @param {string} body */
const flagged = (body) => refusal(body) !== null;

test('a loop, a function, and a case branch are each refused as shell programs', () => {
  // The exact snippet /cp used to prescribe, and the exact reason it was refused every run.
  const ring = [
    'mkdir -p ~/.claude',
    'rm -f ~/.claude/cp-last.4.txt',
    'for i in 3 2 1; do',
    '  [ -f ~/.claude/cp-last.$i.txt ] && mv ~/.claude/cp-last.$i.txt ~/.claude/cp-last.$((i + 1)).txt',
    'done',
  ].join('\n');
  assert.equal(refusal(ring)?.reason, 'a loop (`for`) makes this a shell program, not a call');

  assert.match(String(refusal('cpagain() { pbcopy < ~/.claude/cp-last.txt; }')?.reason), /function definition/);
  assert.match(String(refusal('while read -r l; do echo "$l"; done')?.reason), /loop/);
  assert.match(String(refusal('case "$1" in a) echo a ;; esac')?.reason), /case branch/);
});

test('the shapes a worktree-isolated session actually runs are never flagged', () => {
  assert.equal(flagged('wc -c < package.json'), false);
  assert.equal(flagged('[ -f package.json ] && echo yes'), false);
  assert.equal(flagged('echo $((1 + 1))'), false);
  assert.equal(flagged('x=1; echo "x is $x"'), false);
  assert.equal(flagged('echo alpha\necho beta'), false);
  assert.equal(flagged('my-command-tools state --compact'), false);
});

test('a keyword inside a string or a comment is prose, not a construct', () => {
  assert.equal(flagged('echo "run the for loop yourself"'), false);
  assert.equal(flagged('git commit -m "case in point"'), false);
  assert.equal(flagged('rm -f ~/.claude/cp-last.4.txt # for the oldest entry'), false);
});

test('a placeholder is substituted before the shapes are judged', () => {
  // `<the sentence>` ends in `>`, which reads as a redirect and turned a stdin heredoc into a
  // "heredoc composes a file" report. A run substitutes a real value there before it runs.
  assert.equal(substituted("pbcopy <<'EOF'\n<the sentence>\nEOF"), "pbcopy <<'EOF'\nVALUE\nEOF");
  assert.equal(flagged("pbcopy <<'TEACHEOF'\n<the sentence>\nTEACHEOF"), false);
  assert.equal(flagged('npx -y skills add <owner/repo@skill> -g -y'), false);
});

test('a heredoc that genuinely composes a file is still refused', () => {
  assert.match(String(refusal("cat > out.txt <<'EOF'\nbody\nEOF")?.reason), /heredoc composes a file/);
});

test('the prose flags that read stdin are refused with the file flag named', () => {
  const found = refusal('my-command-tools commit --message - src/a.md');
  assert.match(String(found?.reason), /reads its prose from stdin/);
  assert.match(String(found?.fix), /--message-file/);
});

test('a foreground sleep is refused', () => {
  assert.match(String(refusal('sleep 5 && gh pr checks')?.reason), /waits in the foreground/);
});

test('the replacement /cp now prescribes is not refused', () => {
  // The prose and the invariant have to agree, or a run is told two different things by two
  // surfaces of one rule. Asserted by running the checker over the prescribed form itself.
  assert.equal(
    flagged('my-command-tools stash write --content-file /Users/you/.claude/cp-compose-20260816-142455-9f2c.txt'),
    false,
  );
  assert.equal(flagged('my-command-tools stash restore'), false);
  assert.equal(flagged('my-command-tools stash restore 2'), false);
});

test('fences are extracted with their language, indentation, and not-run marker', () => {
  const doc = [
    '# Doc',
    '',
    '```bash',
    'echo top level',
    '```',
    '',
    '- A nested step:',
    '',
    '  ```bash',
    '  echo nested',
    '  ```',
    '',
    '```js',
    'notShell()',
    '```',
    '',
    '<!-- not-run: shell config a human pastes into ~/.zshrc -->',
    '',
    '```bash',
    'cpagain() { pbcopy < ~/.claude/cp-last.txt; }',
    '```',
  ].join('\n');

  const blocks = shellBlocks('/repo/doc.md', doc);
  assert.equal(blocks.length, 3, 'the js fence is not shell');
  assert.equal(blocks[0].body, 'echo top level');
  // A nested fence has its own indentation removed, so the body is the command as run.
  assert.equal(blocks[1].body, 'echo nested');
  assert.equal(blocks[1].exempt, null);
  assert.equal(blocks[2].exempt, 'shell config a human pastes into ~/.zshrc');
});
