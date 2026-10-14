// Packaging starter only. Implement server-side authentication, official
// NVD/CISA retrieval, six-hour caching, and a fetched-at timestamp.
import { withRequestLog } from '../src/request-log.mjs';

function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(501).json({ error: 'THREAT_INTEL_NOT_IMPLEMENTED' });
}

// 11단계 탐색: 요청 모양만 [req11] 로그로 남기고 응답은 그대로입니다.
export default withRequestLog(handler);
