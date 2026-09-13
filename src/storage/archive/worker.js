import { zipSync } from "fflate";
import { readArchiveEntries } from "./format.js";

globalThis.onmessage = ({ data }) => {
  try {
    const value = data.operation === "pack"
      ? zipSync(data.files, { level: 0 })
      : [...readArchiveEntries(data.bytes)];
    globalThis.postMessage({ ok: true, value });
  } catch (error) {
    globalThis.postMessage({ ok: false, code: error.code, message: error.message });
  }
};
