/**
 * @file Deflate build JSON for planner share URLs (major.minor version shape).
 * @module src/planner/build-url-codec
 */

export async function compressBuildToUrlParam(jsonStr) {
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(jsonStr));
    writer.close();
    const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    return btoa(String.fromCharCode(...bytes))
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
