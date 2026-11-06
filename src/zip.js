/* Native browser ZIP reader for Instagram relationship exports.
 * Only reads stored (0) and DEFLATE (8) entries. No remote code or dependencies.
 * ZIP64, encrypted, multivolume, and unsafe oversized archives are rejected.
 */
const MAX_ZIP_BYTES = 75 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

function zipError(message) { return new Error(message); }
const u16 = (v, i) => v.getUint16(i, true);
const u32 = (v, i) => v.getUint32(i, true);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function expand(bytes, compression, expectedLength) {
  if (expectedLength > MAX_FILE_BYTES) throw zipError('A relationship file exceeds the 40 MB safety limit.');
  if (compression === 0) return bytes;
  if (compression !== 8) throw zipError('This ZIP uses an unsupported compression method.');
  if (typeof DecompressionStream !== 'function') throw zipError('Your browser cannot decompress ZIP files. Update Safari or Chrome and retry.');
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const parts = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES || total > expectedLength) {
        await reader.cancel();
        throw zipError('A relationship file expanded beyond its declared safe size.');
      }
      parts.push(value);
    }
    const result = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { result.set(part, at); at += part.byteLength; }
    return result;
  } catch (error) {
    if (error?.message?.includes('safe size')) throw error;
    throw zipError('A relationship file could not be decompressed. The ZIP may be damaged.');
  }
}

function findEndOfCentralDirectory(bytes, v) {
  for (let at = bytes.byteLength - 22; at >= Math.max(0, bytes.byteLength - 65557); at--) {
    if (u32(v, at) === 0x06054b50) {
      const commentLength = u16(v, at + 20);
      if (at + 22 + commentLength === bytes.byteLength) return at;
    }
  }
  throw zipError('Invalid ZIP: central directory not found.');
}

export async function readZipEntries(file) {
  if (!file || !/\.zip$/i.test(file.name ?? '')) throw zipError('Choose the original Instagram ZIP file.');
  if (file.size > MAX_ZIP_BYTES) throw zipError('ZIP is larger than 75 MB. Export only Followers and following.');
  if (file.size < 22) throw zipError('Invalid or empty ZIP file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(bytes, view);
  if (u16(view, end + 4) || u16(view, end + 6)) throw zipError('Multi-part ZIP archives are not supported.');
  const count = u16(view, end + 10);
  const offset = u32(view, end + 16);
  const dirLength = u32(view, end + 12);
  if (count === 65535 || offset === 0xffffffff || dirLength === 0xffffffff) throw zipError('ZIP64 archives are not supported.');
  if (count > MAX_FILES) throw zipError('ZIP contains too many files. Export only your followers and following.');
  if (offset + dirLength > end) throw zipError('Invalid ZIP directory.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pos = offset;
  let cumulative = 0;
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || u32(view, pos) !== 0x02014b50) throw zipError('Invalid ZIP file index.');
    const flags = u16(view, pos + 8);
    const method = u16(view, pos + 10);
    const checksum = u32(view, pos + 16);
    const packed = u32(view, pos + 20);
    const unpacked = u32(view, pos + 24);
    const nameLen = u16(view, pos + 28);
    const extraLen = u16(view, pos + 30);
    const commentLen = u16(view, pos + 32);
    const localAt = u32(view, pos + 42);
    const next = pos + 46 + nameLen + extraLen + commentLen;
    if (next > end) throw zipError('ZIP filename index is invalid.');
    let name;
    try { name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen)); }
    catch { throw zipError('ZIP contains an invalid filename.'); }
    pos = next;
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    const base = name.split('/').pop()?.toLowerCase() ?? '';
    const matched = /^(followers|following)(?:_\d+)?\.(json|html)$/.exec(base);
    if (!matched) continue;
    if ((flags & 1) !== 0) throw zipError('Encrypted ZIP files cannot be read.');
    if (method !== 0 && method !== 8) throw zipError('Unsupported compression for ' + base + '.');
    if (unpacked > MAX_FILE_BYTES || packed > MAX_FILE_BYTES) throw zipError('A relationship file is too large for safe processing.');
    cumulative += unpacked;
    if (cumulative > MAX_TOTAL_BYTES) throw zipError('Relationship data exceeds the 80 MB safety limit.');
    if (localAt + 30 > bytes.length || u32(view, localAt) !== 0x04034b50) throw zipError('ZIP has an invalid file header.');
    const localFlags = u16(view, localAt + 6);
    const localMethod = u16(view, localAt + 8);
    if (localMethod !== method || (localFlags & 1)) throw zipError('ZIP file header mismatch.');
    const start = localAt + 30 + u16(view, localAt + 26) + u16(view, localAt + 28);
    if (start + packed > bytes.length) throw zipError('ZIP file is truncated.');
    entries.push({
      name,
      kind: matched[1],
      format: matched[2].toUpperCase(),
      async text() {
        const unpackedBytes = await expand(bytes.subarray(start, start + packed), method, unpacked);
        if (unpackedBytes.length !== unpacked || crc32(unpackedBytes) !== checksum) throw zipError('ZIP integrity check failed for ' + base + '.');
        try { return decoder.decode(unpackedBytes); }
        catch { throw zipError('Cannot decode text in ' + base + '.'); }
      },
    });
  }
  return entries;
}