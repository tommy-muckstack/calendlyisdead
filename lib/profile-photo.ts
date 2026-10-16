import sharp from "sharp";
import { MAX_PHOTO_DATA_LENGTH } from "./profile";

/** Store only decoded, re-encoded pixels. Never persist SVG, EXIF or an upload URL. */
export async function normalizeProfilePhoto(data: string): Promise<string> {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || data.length > MAX_PHOTO_DATA_LENGTH) throw new Error("invalid_photo");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) throw new Error("invalid_photo");
  const image = sharp(bytes, { limitInputPixels: 25_000_000, autoOrient: true });
  const metadata = await image.metadata();
  if (metadata.format !== match[1] || (metadata.width ?? 0) < 90 || (metadata.height ?? 0) < 90) throw new Error("invalid_photo");
  const png = await image.resize(256, 256, { fit: "cover", position: "centre" }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
