const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function getByteSize(value: string) {
  return textEncoder.encode(value).length;
}

export function encodeUtf8(value: string) {
  return textEncoder.encode(value);
}

export function decodeUtf8(bytes: Uint8Array) {
  return textDecoder.decode(bytes);
}
