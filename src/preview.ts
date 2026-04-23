import sharp from "sharp";

export interface PreviewOptions {
  /** Longest side in pixels. The image is scaled so both dimensions fit within this box. No upscaling. */
  maxSize?: number;
  /** JPEG quality, 1–100. Lower = smaller file, worse quality. */
  quality?: number;
}

export interface Preview {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Produce a small JPEG preview of an image, suitable for inline rendering in MCP
 * tool results without hitting the ~1 MB response-size soft limit that some
 * clients apply. Defaults (512px, q=70) typically yield 20–80 KB of bytes.
 */
export async function makePreview(input: Buffer, opts: PreviewOptions = {}): Promise<Preview> {
  const maxSize = opts.maxSize ?? 512;
  const quality = opts.quality ?? 70;

  const pipeline = sharp(input, { failOn: "none" })
    .rotate() // honour EXIF orientation
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, chromaSubsampling: "4:2:0" });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}
