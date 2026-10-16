/**
 * In-browser ZIP generation using fflate (vendored).
 * Memory-bound: large bulk exports may fail on low-RAM devices.
 */
import { zipSync, strToU8 } from "../vendor/fflate.js";

/**
 * @param {{ name: string; data: Uint8Array | ArrayBuffer | Blob }[]} files
 * @returns {Promise<Blob>}
 */
export async function createZip(files) {
  /** @type {Record<string, Uint8Array>} */
  const entries = {};
  for (const f of files) {
    let data;
    if (f.data instanceof Blob) {
      data = new Uint8Array(await f.data.arrayBuffer());
    } else if (f.data instanceof ArrayBuffer) {
      data = new Uint8Array(f.data);
    } else {
      data = f.data;
    }
    entries[f.name] = data;
  }
  const zipped = zipSync(entries, { level: 0 }); // store; video already compressed
  return new Blob([zipped], { type: "application/zip" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke for Safari
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
