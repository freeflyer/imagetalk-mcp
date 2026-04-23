import { z } from "zod";

/**
 * Decimal-typed fields from the backend (`progress`, `*_images`) come over the
 * wire as JSON strings (Pydantic v2 + FastAPI default), e.g. `"100"`, `"0"`.
 * They are kept as strings here — coercing in the MCP layer would risk loss
 * of precision for large counters.
 */
const decimalString = z.string();

const isoDatetime = z.string();

export const catalogueSchema = z.object({
  id: z.string().uuid(),
  path_name: z.string(),
  status: z.string(),
  synchronize_allowed: z.boolean(),
  stop_allowed: z.boolean(),
  delete_allowed: z.boolean(),
  progress: decimalString.nullable(),
  new_images: decimalString.nullable(),
  updated_images: decimalString.nullable(),
  unindexed_images: decimalString.nullable(),
  failed_images: decimalString.nullable(),
  sync_started_at: isoDatetime.nullable(),
  sync_ended_at: isoDatetime.nullable(),
});

export const folderSchema = z.object({
  name: z.string(),
  path_name: z.string(),
});

export const imageSchema = z.object({
  id: z.string().uuid(),
  catalogue_id: z.string().uuid(),
  path_name: z.string(),
  status: z.string(),
  image_created_at: isoDatetime,
  image_updated_at: isoDatetime,
  description: z.string().optional(),
});

export const searchHitSchema = z.object({
  id: z.string().uuid(),
  score: z.number(),
  path_name: z.string(),
  description: z.string(),
});
