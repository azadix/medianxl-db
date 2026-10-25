/**
 * @file Deflate build JSON for planner share URLs (major.minor version shape).
 * @module src/planner/build-url-codec
 */

/** Avoid spreading a large Uint8Array into fromCharCode (stack / arg-count limits). */
const FROM_CHAR_CODE_CHUNK = 0x8000;

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBinaryString(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += FROM_CHAR_CODE_CHUNK) {
        const end = Math.min(i + FROM_CHAR_CODE_CHUNK, bytes.length);
        out += String.fromCharCode(...bytes.subarray(i, end));
    }
    return out;
}

export async function compressBuildToUrlParam(jsonStr) {
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(jsonStr));
    writer.close();
    const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    return btoa(bytesToBinaryString(bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function decompressBuildFromUrlParam(encoded) {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return JSON.parse(await new Response(stream.readable).text());
}

/**
 * Parse planner build version string (major.minor).
 * @param {string} versionString - Version string like "2.11"
 * @returns {{ major: number, minor: number }} Version object
 */
export function parseVersionString(versionString) {
  const parts = versionString.split('.');
  return {
    major: parseInt(parts[0]) || 0,
    minor: parseInt(parts[1]) || 0,
  };
}
