import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PrivateImageUpload = {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  body: Buffer;
};

let cachedClient: S3Client | undefined;
let cachedConfigurationKey: string | undefined;

function getStorage() {
  const bucket = process.env.RECEPTION_S3_BUCKET;
  const region = process.env.RECEPTION_S3_REGION;
  const endpoint = process.env.RECEPTION_S3_ENDPOINT;
  const accessKeyId = process.env.RECEPTION_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RECEPTION_S3_SECRET_ACCESS_KEY;

  if (!bucket || !region) {
    throw new Error("RECEPTION_STORAGE_NOT_CONFIGURED");
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("RECEPTION_STORAGE_CREDENTIALS_INCOMPLETE");
  }

  const forcePathStyle = process.env.RECEPTION_S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint);
  const configurationKey = JSON.stringify([bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle]);
  if (!cachedClient || cachedConfigurationKey !== configurationKey) {
    cachedConfigurationKey = configurationKey;
    cachedClient = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  return { bucket, client: cachedClient };
}

export async function uploadPrivateImage(image: PrivateImageUpload) {
  const { bucket, client } = getStorage();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: image.objectKey,
    Body: image.body,
    ContentType: image.mimeType,
    ContentLength: image.sizeBytes,
  }));
}

export async function deletePrivateImages(objectKeys: string[]) {
  if (!objectKeys.length) return;
  const { bucket, client } = getStorage();
  await Promise.all(objectKeys.map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
}

export async function createPrivateImageUrl(objectKey: string) {
  const { bucket, client } = getStorage();
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: "inline",
  }), { expiresIn: 300 });
}
