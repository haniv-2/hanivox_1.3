// Message builders for the Android TV Remote protocol v2 (pairing on 6467, remote on 6466).
// Written from the publicly documented protocol. It must still be confirmed on real TVs.
import { concat, hexToBytes, hexToUnsignedBytes } from './bytes.ts';
import { fieldBytes, fieldString, fieldVarint } from './pb.ts';
import { sha256 } from './sha256.ts';

export const PAIRING_PORT = 6467;
export const REMOTE_PORT = 6466;
export const STATUS_OK = 200;

// ---- Pairing ------------------------------------------------------------------------------

function pairingEnvelope(payload: Uint8Array): Uint8Array {
  return concat(fieldVarint(1, 2), fieldVarint(2, STATUS_OK), payload);
}

const HEX_6 = () => concat(fieldVarint(1, 3), fieldVarint(2, 6)); // encoding: hexadecimal, 6 symbols

export function pairingRequest(): Uint8Array {
  return pairingEnvelope(
    fieldBytes(10, concat(fieldString(1, 'androidtv-remote'), fieldString(2, 'Hanivox'))),
  );
}

export function pairingOption(): Uint8Array {
  // input encodings = [hex x6], preferred role = INPUT (the phone types the code)
  return pairingEnvelope(fieldBytes(20, concat(fieldBytes(1, HEX_6()), fieldVarint(3, 1))));
}

export function pairingConfiguration(): Uint8Array {
  return pairingEnvelope(fieldBytes(30, concat(fieldBytes(1, HEX_6()), fieldVarint(2, 1))));
}

export function pairingSecret(secret: Uint8Array): Uint8Array {
  return pairingEnvelope(fieldBytes(40, fieldBytes(1, secret)));
}

/**
 * SHA-256( clientModulus | clientExponent | serverModulus | serverExponent | code[1..] )
 * where code is the 6 hex characters shown on the TV, and code[1..] drops its first byte.
 */
export function computeSecret(
  clientModulusHex: string,
  clientExponentHex: string,
  serverModulusHex: string,
  serverExponentHex: string,
  code: string,
): Uint8Array {
  const codeBytes = hexToBytes(code);
  return sha256(
    concat(
      hexToUnsignedBytes(clientModulusHex),
      hexToUnsignedBytes(clientExponentHex),
      hexToUnsignedBytes(serverModulusHex),
      hexToUnsignedBytes(serverExponentHex),
      codeBytes.slice(1),
    ),
  );
}

// ---- Remote control -----------------------------------------------------------------------

const FEATURES = 622;

export function remoteConfigure(): Uint8Array {
  const deviceInfo = concat(
    fieldString(1, 'Hanivox'),
    fieldString(2, 'Hanivox'),
    fieldVarint(3, 1),
    fieldString(4, '1'),
    fieldString(5, 'com.hanivox.app'),
    fieldString(6, '1.0.0'),
  );
  return fieldBytes(1, concat(fieldVarint(1, FEATURES), fieldBytes(2, deviceInfo)));
}

export function remoteSetActive(): Uint8Array {
  return fieldBytes(2, fieldVarint(1, FEATURES));
}

export function remotePingResponse(val1: number): Uint8Array {
  return fieldBytes(9, fieldVarint(1, val1));
}

/** direction 3 = a normal short press */
export function remoteKey(keyCode: number, direction = 3): Uint8Array {
  return fieldBytes(10, concat(fieldVarint(1, keyCode), fieldVarint(2, direction)));
}

export function remoteLaunchLink(url: string): Uint8Array {
  return fieldBytes(90, fieldString(1, url));
}

// ---- Android key codes ----------------------------------------------------------------------

export const KEYCODE = {
  HOME: 3, BACK: 4, UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22, OK: 23,
  VOL_UP: 24, VOL_DOWN: 25, POWER: 26, MENU: 82, MUTE: 164,
  PLAY: 126, PAUSE: 127, STOP: 86, NEXT: 87, PREVIOUS: 88, CH_UP: 166, CH_DOWN: 167,
  TV: 170, TV_INPUT: 178, WAKEUP: 224,
  HDMI1: 243, HDMI2: 244, HDMI3: 245, HDMI4: 246, AV: 247,
} as const;
