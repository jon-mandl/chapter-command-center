import { supabase } from './supabase'

// Server-side bucket configuration (mirrored here so the client can give a
// clear validation message before attempting an upload that would be rejected).
// Keep this in sync with the bucket configuration in Supabase Storage.
export const STORAGE_BUCKETS = {
  documents: {
    name: 'documents',
    maxBytes: 50 * 1024 * 1024, // 50 MB
    allowedMimeTypes: new Set<string>([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/png',
      'image/jpeg',
      'image/gif'
    ])
  },
  grievanceDocuments: {
    name: 'grievance-documents',
    maxBytes: 50 * 1024 * 1024,
    allowedMimeTypes: new Set<string>([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/png',
      'image/jpeg'
    ])
  }
} as const

export type BucketKey = keyof typeof STORAGE_BUCKETS

export interface UploadValidationError {
  reason: 'size' | 'mime'
  message: string
}

export function validateUpload(file: File, bucket: BucketKey): UploadValidationError | null {
  const cfg = STORAGE_BUCKETS[bucket]
  if (file.size > cfg.maxBytes) {
    return {
      reason: 'size',
      message: `File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(cfg.maxBytes)}.`
    }
  }
  if (file.type && !cfg.allowedMimeTypes.has(file.type)) {
    return {
      reason: 'mime',
      message: `${file.type || 'This file type'} isn't allowed in this vault. Try a PDF, Office doc, image, CSV, or text file.`
    }
  }
  return null
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Build a deterministic-but-collision-resistant storage path. Files are
// grouped by chapter so that a single bucket can serve every chapter without
// path collisions, and the random UUID prefix means re-uploading the same
// filename later doesn't overwrite the prior copy.
//
// Caller is responsible for sanitising the displayed file name; this function
// only needs to produce a safe object key for storage.
export function buildStoragePath(prefix: string, originalName: string): string {
  const cleaned = originalName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 200) || 'file'
  const id = crypto.randomUUID()
  return `${prefix}/${id}-${cleaned}`
}

// Generate a short-lived signed URL for a private file. 15 minutes is enough
// for a click-and-download flow without leaving the URL valid for very long.
export async function createSignedDownloadUrl(
  bucket: BucketKey,
  path: string,
  expiresInSeconds = 60 * 15
): Promise<{ url: string | null; error: string | null }> {
  const cfg = STORAGE_BUCKETS[bucket]
  const { data, error } = await supabase.storage.from(cfg.name).createSignedUrl(path, expiresInSeconds)
  if (error || !data) return { url: null, error: error?.message ?? 'Could not generate download link.' }
  return { url: data.signedUrl, error: null }
}
