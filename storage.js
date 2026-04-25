import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.BUCKET_NAME || "icy-cherry-6455";

export const storage = {
  async put(key, body, contentType = "application/octet-stream") {
    try {
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
      return { url: `${process.env.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev"}/${BUCKET}/${key}` };
    } catch (err) {
      return { error: err.message };
    }
  },

  async get(key) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return { body: Buffer.concat(chunks), contentType: res.ContentType };
    } catch (err) {
      return { error: err.message };
    }
  },

  async list(prefix = "") {
    try {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 1000 }));
      return { objects: (res.Contents || []).map(o => ({ key: o.Key, size: o.Size, modified: o.LastModified })) };
    } catch (err) {
      return { error: err.message };
    }
  },

  async del(key) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      return { deleted: true };
    } catch (err) {
      return { error: err.message };
    }
  },
};
