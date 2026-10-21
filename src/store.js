import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import * as core from "@actions/core";
import { relativePath } from "./paths.js";

/**
 * An S3 client acting as the memory role. The role is assumed here, from the job's OIDC token, rather than by a preceding credentials step: credentials exported into the job's environment would be handed to the agent too.
 */
export async function connect({ role, region }) {
  const token = await core.getIDToken("sts.amazonaws.com");
  const sts = new STSClient({ region });
  const { Credentials } = await sts.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: role,
      RoleSessionName: `claude-code-memory-${process.env.GITHUB_RUN_ID || "local"}`,
      WebIdentityToken: token,
      DurationSeconds: 900,
    }),
  );
  return new S3Client({
    region,
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
}

/** Content hash of every object under the prefix, keyed by relative path. A single-part upload's ETag is its MD5, which is what `localHashes` computes. */
export async function remoteHashes(s3, bucket, prefix) {
  const hashes = new Map();
  let ContinuationToken;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const object of page.Contents ?? []) {
      hashes.set(relativePath(prefix, object.Key), object.ETag.replaceAll('"', ""));
    }
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return hashes;
}

/** Content hash of every file in the store directory, keyed by relative path. */
export function localHashes(directory) {
  const hashes = new Map();
  if (!fs.existsSync(directory)) {
    return hashes;
  }
  for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      const hash = createHash("md5").update(fs.readFileSync(file)).digest("hex");
      hashes.set(path.relative(directory, file).split(path.sep).join("/"), hash);
    }
  }
  return hashes;
}

/** Resolves a relative path inside the store, refusing one that would climb out of it. */
export function within(directory, relative) {
  const file = path.resolve(directory, relative);
  if (!file.startsWith(path.resolve(directory) + path.sep)) {
    throw new Error(`refusing a path outside the store: ${relative}`);
  }
  return file;
}

export async function read(s3, bucket, prefix, relative) {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${relative}` }),
  );
  return Buffer.from(await object.Body.transformToByteArray());
}

export async function write(s3, bucket, prefix, relative, body) {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${relative}`, Body: body }),
  );
}

export async function remove(s3, bucket, prefix, relative) {
  await s3.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: `${prefix}${relative}` }),
  );
}
