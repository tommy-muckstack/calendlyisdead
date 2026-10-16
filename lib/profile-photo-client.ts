import { MAX_PHOTO_DATA_LENGTH, MAX_PHOTO_FILE_BYTES, PHOTO_TYPES } from "./profile";

/** Bound uploads before sending them to the app; no external storage service. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Choose a JPG, PNG, WebP or GIF image.");
  if (!file.size || file.size >= MAX_PHOTO_FILE_BYTES) throw new Error("Choose an image smaller than 5 MB.");
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (image.width < 90 || image.height < 90) throw new Error("Choose an image at least 90 × 90 pixels.");
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
    const result = canvas.toDataURL("image/png");
    if (!result.startsWith("data:image/png;base64,") || result.length > MAX_PHOTO_DATA_LENGTH) throw new Error("This image could not be prepared. Try a different photo.");
    return result;
  } finally { image.close(); }
}
