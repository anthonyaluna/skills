import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function authorizeDashboard(req: IncomingMessage): number {
  const token = process.env.PIXEL_DASHBOARD_PASSWORD;
  if (!token || Buffer.byteLength(token) < 32) return 503;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return 403;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return 403;
  const expected = 'Basic ' + Buffer.from(`operator:${token}`).toString('base64');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(expected), digest(req.headers.authorization || '')) ? 200 : 401;
}

export function protectDashboard(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const status = authorizeDashboard(req);
  if (status === 200) return next();
  res.statusCode = status;
  if (status === 401) res.setHeader('WWW-Authenticate', 'Basic realm="Pixel dashboard"');
  res.end(status === 503 ? 'Set PIXEL_DASHBOARD_PASSWORD to a random value of at least 32 bytes.' : 'Access denied');
}
