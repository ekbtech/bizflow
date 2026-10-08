import type { PrivateImageUpload } from "@/lib/private-image-storage";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageCount = 5;
const maxImageSize = 5 * 1024 * 1024;
const maxTotalImageSize = 15 * 1024 * 1024;

export class PrivateImageValidationError extends Error {}

function hasValidHeader(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function safeFileName(name: string) {
  return name.replace(/[^\w.-]/g, "_").slice(0, 255) || "vehicle-image";
}

export async function preparePrivateImages(entries: FormDataEntryValue[], objectPrefix: string): Promise<PrivateImageUpload[]> {
  if (entries.some((entry) => typeof entry !== "string" && !(entry instanceof File))) {
    throw new PrivateImageValidationError("Photo attachments must be valid image files.");
  }
  const photos = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (photos.length > maxImageCount) {
    throw new PrivateImageValidationError(`A maximum of ${maxImageCount} images can be attached.`);
  }
  if (photos.some((photo) => !acceptedMimeTypes.has(photo.type) || photo.size > maxImageSize)) {
    throw new PrivateImageValidationError("Each photo must be a JPEG, PNG, or WebP image no larger than 5 MB.");
  }
  if (photos.reduce((total, photo) => total + photo.size, 0) > maxTotalImageSize) {
    throw new PrivateImageValidationError("Photo attachments must total 15 MB or less.");
  }

  const uploads: PrivateImageUpload[] = [];
  for (const photo of photos) {
    const bytes = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
    if (!hasValidHeader(photo.type, bytes)) {
      throw new PrivateImageValidationError("A selected photo does not match its declared image format.");
    }
    const extension = photo.type === "image/jpeg" ? "jpg" : photo.type === "image/png" ? "png" : "webp";
    uploads.push({
      objectKey: `${objectPrefix}/${crypto.randomUUID()}.${extension}`,
      fileName: safeFileName(photo.name),
      mimeType: photo.type,
      sizeBytes: photo.size,
      body: Buffer.from(await photo.arrayBuffer()),
    });
  }
  return uploads;
}
