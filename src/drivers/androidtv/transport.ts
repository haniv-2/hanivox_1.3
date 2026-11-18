// The sessions talk to the TV through this tiny interface. The app plugs in a native TLS
// implementation; tests plug in a Node one.

export interface TlsConn {
  serverModulusHex: string;
  serverExponentHex: string;
  onData(cb: (data: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  /** Call after registering onData/onClose. Data is not delivered before this. */
  start(): void;
  write(data: Uint8Array): Promise<void>;
  close(): void;
}

export interface TlsTransport {
  clientCert(): Promise<{ modulusHex: string; exponentHex: string }>;
  open(host: string, port: number): Promise<TlsConn>;
}
