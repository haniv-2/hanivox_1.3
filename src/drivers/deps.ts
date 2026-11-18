// Things the LG and Samsung drivers need from the outside world. The app passes real ones
// (realDeps.ts); tests pass fakes.
export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface Deps {
  ws: (url: string) => WebSocket;
  http: (url: string, init?: { method?: string }) => Promise<HttpResponse>;
  probe: (host: string, port: number) => Promise<boolean>;
  sendMagic: (host: string, packet: Uint8Array) => Promise<void>;
}
