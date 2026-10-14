import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';
import { buildOpsSummary } from './ops-summary.mjs';

// 2단계부터 메모는 public에 복사하지 않고 api/notes.js가 Supabase에서 읽습니다.
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
await mkdir(resolve(root, 'public'), { recursive: true });
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
} else {
  console.log('로컬 빌드: 공개 메모 파일과 aleph.json을 만들지 않습니다.');
}
// 12단계: 작전실 화면 요약(판정기 규칙·탐지 규칙·복구 버전)을 저장소 파일에서 읽어 public/ops-summary.json에 씁니다(Git 제외).
await writeFile(resolve(root, 'public', 'ops-summary.json'),
  `${JSON.stringify(await buildOpsSummary(root, process.env), null, 2)}
`, 'utf8');
console.log('작전실 요약을 public/ops-summary.json에 기록했습니다.');
