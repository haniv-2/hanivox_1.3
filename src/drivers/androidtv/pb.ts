// Minimal protobuf encoder/decoder, just enough for the Android TV Remote protocol.
import { asciiBytes, concat } from './bytes.ts';

export type PbValue = number | Uint8Array;
export type PbFields = Map<number, PbValue[]>;

function varint(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
  return Uint8Array.from(out);
}

export function fieldVarint(num: number, value: number): Uint8Array {
  return concat(varint(num * 8), varint(value));
}

export function fieldBytes(num: number, bytes: Uint8Array): Uint8Array {
  return concat(varint(num * 8 + 2), varint(bytes.length), bytes);
}

export function fieldString(num: number, s: string): Uint8Array {
  return fieldBytes(num, asciiBytes(s));
}

/** Prefix a message with its length, as the TV expects on the wire. */
export function frame(message: Uint8Array): Uint8Array {
  return concat(varint(message.length), message);
}

export function decode(buf: Uint8Array): PbFields {
  const fields: PbFields = new Map();
  let pos = 0;
  const readVarint = (): number => {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (pos >= buf.length) throw new Error('Truncated message');
      const b = buf[pos++];
      result += (b & 0x7f) * scale;
      if ((b & 0x80) === 0) return result;
      scale *= 0x80;
    }
  };
  const add = (num: number, value: PbValue) => {
    const list = fields.get(num);
    if (list) list.push(value);
    else fields.set(num, [value]);
  };
  while (pos < buf.length) {
    const tag = readVarint();
    const num = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) add(num, readVarint());
    else if (wire === 2) {
      const len = readVarint();
      if (pos + len > buf.length) throw new Error('Truncated message');
      add(num, buf.slice(pos, pos + len));
      pos += len;
    } else if (wire === 1) {
      add(num, buf.slice(pos, pos + 8));
      pos += 8;
    } else if (wire === 5) {
      add(num, buf.slice(pos, pos + 4));
      pos += 4;
    } else throw new Error(`Unsupported wire type ${wire}`);
  }
  return fields;
}

export function firstNumber(fields: PbFields, num: number): number | undefined {
  const v = fields.get(num)?.[0];
  return typeof v === 'number' ? v : undefined;
}

export function firstBytes(fields: PbFields, num: number): Uint8Array | undefined {
  const v = fields.get(num)?.[0];
  return v instanceof Uint8Array ? v : undefined;
}

/** Collects incoming bytes and returns each complete length-prefixed message. */
export class FrameReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    this.buf = concat(this.buf, chunk);
    const messages: Uint8Array[] = [];
    for (;;) {
      let pos = 0;
      let len = 0;
      let scale = 1;
      let complete = false;
      while (pos < this.buf.length) {
        const b = this.buf[pos++];
        len += (b & 0x7f) * scale;
        if ((b & 0x80) === 0) {
          complete = true;
          break;
        }
        scale *= 0x80;
      }
      if (!complete || this.buf.length < pos + len) break;
      messages.push(this.buf.slice(pos, pos + len));
      this.buf = this.buf.slice(pos + len);
    }
    return messages;
  }
}
