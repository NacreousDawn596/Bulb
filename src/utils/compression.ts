import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

export function compressJson(value: unknown): Buffer {
  const serialized = Buffer.from(JSON.stringify(value), "utf8");
  return brotliCompressSync(serialized, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 5,
    },
  });
}

export function decompressJson<T>(payload: Uint8Array): T {
  const decompressed = brotliDecompressSync(payload);
  return JSON.parse(decompressed.toString("utf8")) as T;
}
