import { failure, fromThrown, success } from "./result.js";

const invalidArtwork = (message) =>
  failure("artwork-invalid", message, {
    recovery: "Choose a valid, non-empty browser-supported image and retry.",
    retryable: false,
  });

export const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;
export const MAX_ARTWORK_DIMENSION = 16_384;
export const MAX_ARTWORK_PIXELS = 40_000_000;

const oversizedArtwork = (message) =>
  failure("artwork-too-large", message, {
    recovery: "Resize or compress the image, then retry. The previous Scene artwork was preserved.",
    retryable: false,
  });

const validateDimensions = ({ width, height }) => {
  if (width <= 0 || height <= 0) {
    return invalidArtwork("Nightforge could not decode usable dimensions from that image.");
  }
  if (width > MAX_ARTWORK_DIMENSION || height > MAX_ARTWORK_DIMENSION) {
    return oversizedArtwork(`Scene artwork cannot exceed ${MAX_ARTWORK_DIMENSION.toLocaleString()} pixels on either side.`);
  }
  if (width * height > MAX_ARTWORK_PIXELS) {
    return oversizedArtwork(`Scene artwork cannot exceed ${MAX_ARTWORK_PIXELS.toLocaleString()} decoded pixels.`);
  }
  return success({ width, height });
};

export function createBrowserArtworkDecoder(browser = globalThis) {
  return async (blob) => {
    if (!(blob instanceof Blob) || !blob.type?.toLowerCase().startsWith("image/")) {
      return invalidArtwork("Nightforge can only use image files as Scene artwork.");
    }
    if (blob.size <= 0) {
      return invalidArtwork("Nightforge cannot use an empty image as Scene artwork.");
    }
    if (blob.size > MAX_ARTWORK_BYTES) {
      return oversizedArtwork("Scene artwork cannot exceed 25 MiB.");
    }

    try {
      if (typeof browser.createImageBitmap === "function") {
        const bitmap = await browser.createImageBitmap(blob);
        try {
          return validateDimensions({ width: bitmap.width, height: bitmap.height });
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
          return validateDimensions(dimensions);
        } finally {
          browser.URL.revokeObjectURL?.(objectUrl);
        }
      }

      return failure(
        "artwork-decoder-unavailable",
        "This browser cannot validate Scene artwork.",
        {
          recovery: "Use a current browser with image decoding enabled and retry.",
          retryable: true,
        },
      );
    } catch (error) {
      return fromThrown(
        "artwork-decode-failed",
        "Nightforge could not decode that Scene artwork.",
        error,
        "The current Scene and its previous artwork were preserved. Choose another image or retry.",
      );
    }
  };
}
