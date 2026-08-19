import { failure, fromThrown, success } from "./result.js";

const invalidArtwork = (message) =>
  failure("artwork-invalid", message, {
    recovery: "Choose a valid, non-empty browser-supported image and retry.",
    retryable: false,
  });

export const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;
export const MAX_ARTWORK_DIMENSION = 16_384;
export const MAX_ARTWORK_PIXELS = 40_000_000;

export const MAX_PORTRAIT_BYTES = 6 * 1024 * 1024;
export const MAX_PORTRAIT_DIMENSION = 4_096;
export const MAX_PORTRAIT_PIXELS = 8_000_000;

const oversizedArtwork = (message, subject) =>
  failure("artwork-too-large", message, {
    recovery: `Resize or compress the image, then retry. The previous ${subject} was preserved.`,
    retryable: false,
  });

const validateDimensions = ({ width, height }, limits) => {
  if (width <= 0 || height <= 0) {
    return invalidArtwork("Nightforge could not decode usable dimensions from that image.");
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    return oversizedArtwork(`${limits.label} cannot exceed ${limits.maxDimension.toLocaleString()} pixels on either side.`, limits.subject);
  }
  if (width * height > limits.maxPixels) {
    return oversizedArtwork(`${limits.label} cannot exceed ${limits.maxPixels.toLocaleString()} decoded pixels.`, limits.subject);
  }
  return success({ width, height });
};

export const SCENE_ARTWORK_LIMITS = Object.freeze({
  label: "Scene artwork",
  subject: "Scene artwork",
  sizeLabel: "25 MiB",
  maxBytes: MAX_ARTWORK_BYTES,
  maxDimension: MAX_ARTWORK_DIMENSION,
  maxPixels: MAX_ARTWORK_PIXELS,
});

export const HERO_PORTRAIT_LIMITS = Object.freeze({
  label: "A hero portrait",
  subject: "portrait",
  sizeLabel: "6 MiB",
  maxBytes: MAX_PORTRAIT_BYTES,
  maxDimension: MAX_PORTRAIT_DIMENSION,
  maxPixels: MAX_PORTRAIT_PIXELS,
});

export function createBrowserArtworkDecoder(browser = globalThis, limits = SCENE_ARTWORK_LIMITS) {
  return async (blob) => {
    if (!(blob instanceof Blob) || !blob.type?.toLowerCase().startsWith("image/")) {
      return invalidArtwork(`Nightforge can only use image files as ${limits.subject}.`);
    }
    if (blob.size <= 0) {
      return invalidArtwork(`Nightforge cannot use an empty image as ${limits.subject}.`);
    }
    if (blob.size > limits.maxBytes) {
      return oversizedArtwork(`${limits.label} cannot exceed ${limits.sizeLabel}.`, limits.subject);
    }

    try {
      if (typeof browser.createImageBitmap === "function") {
        const bitmap = await browser.createImageBitmap(blob);
        try {
          return validateDimensions({ width: bitmap.width, height: bitmap.height }, limits);
        } finally {
          bitmap.close?.();
        }
      }

      if (browser.Image && browser.URL?.createObjectURL) {
        const objectUrl = browser.URL.createObjectURL(blob);
        try {
          const dimensions = await new Promise((resolve, reject) => {
            const image = new browser.Image();
            image.onload = () => resolve({
              width: image.naturalWidth || image.width,
              height: image.naturalHeight || image.height,
            });
            image.onerror = () => reject(new Error("The browser rejected the image data."));
            image.src = objectUrl;
          });
          return validateDimensions(dimensions, limits);
        } finally {
          browser.URL.revokeObjectURL?.(objectUrl);
        }
      }

      return failure(
        "artwork-decoder-unavailable",
        `This browser cannot validate ${limits.subject}.`,
        {
          recovery: "Use a current browser with image decoding enabled and retry.",
          retryable: true,
        },
      );
    } catch (error) {
      return fromThrown(
        "artwork-decode-failed",
        `Nightforge could not decode that ${limits.subject}.`,
        error,
        `The previous ${limits.subject} was preserved. Choose another image or retry.`,
      );
    }
  };
}
