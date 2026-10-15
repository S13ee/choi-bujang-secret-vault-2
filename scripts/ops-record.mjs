// 12단계 제작 2: 1~11단계 정상·금지 요청 기록표를 만듭니다.
//   npm run ops:record                   같은 시험 목록으로 공개 HTTPS 주소에 실제 GET·HEAD 요청을 보내, 받은 응답만 표로 적습니다(실측).
//   npm run ops:record -- --from-bundle  제출 묶음(artifacts/submission.json)의 attackId·observed를 그대로 옮깁니다(새 요청 없음).
//                                        12단계 제출 묶음은 요청을 보내지 않으므로 이때는 모두 미실행입니다.
// 결과: artifacts/ops-records.json, artifacts/ops-records.md (Git 제외). 실제로 보낸 요청의 결과만 적고 보내지 않은 것은 미실행입니다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OPS_CATALOG } from '../src/ops-catalog.mjs';
import { buildRecordTable, recordTableMarkdown } from '../src/ops-records.mjs';

const root = resolve(import.meta.dirname, '..');
// --live는 이전 이름이라 받아 두지만 기본 동작과 같습니다.
const live = !process.argv.includes('--from-bundle');

try {
  const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
  let attempts;
  let commit;
  if (live) {
    const { runLiveChecks } = await import(pathToFileURL(join(root, 'src', 'attack-check.mjs')).href);
    if (config.step !== 12) throw new Error('실측 기록표는 aleph.config.json의 step이 12일 때만 씁니다.');
    attempts = await runLiveChecks(config);
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  } else {
    let submission;
    try {
      submission = JSON.parse(readFileSync(join(root, 'artifacts', 'submission.json'), 'utf8'));
    } catch {
      throw new Error('artifacts/submission.json이 없습니다. 먼저 npm run bundle을 실행하세요.');
    }
    if (submission.step !== 12) throw new Error('제출 묶음의 step이 12가 아닙니다.');
    attempts = submission.attackAttempts.map(({ attackId, observed }) => ({ attackId, observed }));
    commit = submission.commit;
  }
  const table = buildRecordTable({ catalog: OPS_CATALOG, attempts, source: live ? 'live' : 'bundle', commit,
    publicAppUrl: config.publicAppUrl, generatedAt: new Date().toISOString() });
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  writeFileSync(join(root, 'artifacts', 'ops-records.json'), `${JSON.stringify(table, null, 2)}\n`, 'utf8');
  writeFileSync(join(root, 'artifacts', 'ops-records.md'), recordTableMarkdown(table), 'utf8');
  const { counts } = table;
  process.stdout.write(`기록표 생성: artifacts/ops-records.json, artifacts/ops-records.md\n근거 ${table.source} · 커밋 ${String(commit).slice(0, 12)} · 행 ${counts.rows} · 실행 ${counts.executed} · 미실행 ${counts.notRun} · 기대 상태와 같음 ${counts.statusMatched} · 다름 ${counts.statusMismatched}\n`);
} catch (error) {
  process.stderr.write(`기록표 생성 중 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
