import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { Logger } from "./logger";
import { retry } from "../utils/retry";

function streamToBytes(body: unknown): Promise<Uint8Array> {
  if (body && typeof body === "object" && "transformToByteArray" in body) {
    return (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  }

  if (body && typeof body === "object" && "transformToWebStream" in body) {
    const stream = (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
    return new Response(stream).bytes();
  }

  throw new Error("Unsupported R2 response body.");
}

export class R2Service {
  private readonly client: S3Client;

  constructor(private readonly logger: Logger) {
    this.client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async putObject(key: string, body: Uint8Array, contentType: string, contentEncoding?: string): Promise<void> {
    await retry(
      async () => {
        await this.client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
            ContentEncoding: contentEncoding,
          }),
        );
      },
      {
        attempts: 4,
        baseDelayMs: 1_000,
        onRetry: (error, attempt, delayMs) => {
          this.logger.warn("R2 upload retry scheduled", {
            key,
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        }),
      );

      return await streamToBytes(response.Body);
    } catch (error) {
      if (error instanceof NoSuchKey || (error instanceof Error && error.name === "NoSuchKey")) {
        return null;
      }
      throw error;
    }
  }
}
