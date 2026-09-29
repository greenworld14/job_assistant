(function (root) {
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid ZIP/DOCX file.');
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const entries = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen)).replace(/\\/g, '/');
      entries[name] = { method, compSize, localOffset };
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return {
      names: Object.keys(entries),
      async file(name) {
        const e = entries[name];
        if (!e) return null;
        const lo = e.localOffset;
        if (view.getUint32(lo, true) !== 0x04034b50) throw new Error('Corrupt ZIP entry: ' + name);
        const start = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true);
        const data = bytes.subarray(start, start + e.compSize);
        if (e.method === 0) return data;
        if (e.method === 8) return inflateRaw(data);
        throw new Error('Unsupported ZIP compression method ' + e.method);
      },
      async text(name) {
        const d = await this.file(name);
        return d ? new TextDecoder('utf-8').decode(d) : null;
      }
    };
  }

  root.MiniZip = { readZip };
})(typeof self !== 'undefined' ? self : globalThis);
