import { failure, fromThrown, success } from "./result.js";

const invalidArtwork = (message) =>
  failure("artwork-invalid", message, {
    recovery: "Choose a valid, non-empty browser-supported image and retry.",
    retryable: false,
  });

export function createBrowserArtworkDecoder(browser = globalThis) {
  return async (blob) => {
    if (!(blob instanceof Blob) || !blob.type?.toLowerCase().startsWith("image/")) {
      return invalidArtwork("Nightforge can only use image files as Scene artwork.");
    }
    if (blob.size <= 0) {
      return invalidArtwork("Nightforge cannot use an empty image as Scene artwork.");
    }

    try {
      if (typeof browser.createImageBitmap === "function") {
        const bitmap = await browser.createImageBitmap(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return dimensions.width > 0 && dimensions.height > 0
          ? success(dimensions)
          : invalidArtwork("Nightforge could not decode usable dimensions from that image.");
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
          return dimensions.width > 0 && dimensions.height > 0
            ? success(dimensions)
            : invalidArtwork("Nightforge could not decode usable dimensions from that image.");
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
