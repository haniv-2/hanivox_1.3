import type { Deps } from './deps';
import { probePort, sendMagic } from './net';

async function http(url: string, init?: { method?: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { method: init?.method ?? 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const realDeps: Deps = {
  ws: (url) => new WebSocket(url),
  http,
  probe: (host, port) => probePort(host, port),
  sendMagic,
};
