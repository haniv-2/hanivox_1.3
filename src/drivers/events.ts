type Callback = (host: string) => void;
const callbacks = new Set<Callback>();

/** Called when a TV connection drops on its own (TV switched off, Wi-Fi lost, ...). */
export function onHostLost(cb: Callback): () => void {
  callbacks.add(cb);
  return () => { callbacks.delete(cb); };
}

export function notifyHostLost(host: string): void {
  callbacks.forEach((cb) => cb(host));
}

type CredentialCallback = (deviceId: string, credential: string) => void;
const credentialCallbacks = new Set<CredentialCallback>();

/** Called when a TV hands out a pairing key that should be remembered. */
export function onCredential(cb: CredentialCallback): () => void {
  credentialCallbacks.add(cb);
  return () => { credentialCallbacks.delete(cb); };
}

export function notifyCredential(deviceId: string, credential: string): void {
  credentialCallbacks.forEach((cb) => cb(deviceId, credential));
}
