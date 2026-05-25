import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from './supabase';

export const SWIFT_INSIGHTS_VIDEOS_BUCKET = 'swift-insights-videos';
export const SWIFT_INSIGHTS_THUMBNAILS_BUCKET = 'swift-insights-thumbnails';
export const AVATARS_BUCKET = 'avatars';

// 50 MB max upload size for videos
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
// 60 seconds max video duration (in milliseconds)
export const MAX_VIDEO_DURATION_MS = 60 * 1000;
// 8 MB max for thumbnails (generous; Supabase handles compression)
export const MAX_THUMB_BYTES = 8 * 1024 * 1024;

/**
 * React-Native–safe base64 → ArrayBuffer decoder.
 * `atob` is available in Hermes/JSC.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function inferContentType(uri: string, fallback: string): string {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return fallback;
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/webm': 'webm',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[contentType] || 'bin';
}

function uniqueFilename(prefix: string, ext: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}.${ext}`;
}

export type UploadResult = {
  publicUrl: string;
  path: string;
};

export async function uploadFileToSupabase(params: {
  uri: string;
  bucket: string;
  fallbackContentType: string;
  prefix: string;
}): Promise<UploadResult> {
  const { uri, bucket, fallbackContentType, prefix } = params;

  const contentType = inferContentType(uri, fallbackContentType);
  const ext = extensionFor(contentType);
  const path = uniqueFilename(prefix, ext);

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const arrayBuffer = base64ToArrayBuffer(base64);

  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Failed to retrieve public URL after upload.');
  return { publicUrl: data.publicUrl, path };
}

export async function uploadVideoToSupabase(uri: string): Promise<UploadResult> {
  return uploadFileToSupabase({
    uri,
    bucket: SWIFT_INSIGHTS_VIDEOS_BUCKET,
    fallbackContentType: 'video/mp4',
    prefix: 'video',
  });
}

export async function uploadThumbnailToSupabase(uri: string): Promise<UploadResult> {
  return uploadFileToSupabase({
    uri,
    bucket: SWIFT_INSIGHTS_THUMBNAILS_BUCKET,
    fallbackContentType: 'image/jpeg',
    prefix: 'thumb',
  });
}

/**
 * Upload profile avatar image for a specific user.
 * Storage path is under the avatars bucket:
 *   {userId}/avatar-{timestamp}.{ext}
 */
export async function uploadAvatarToSupabase(params: {
  uri: string;
  userId: string;
}): Promise<UploadResult> {
  const { uri, userId } = params;

  const contentType = inferContentType(uri, 'image/jpeg');
  const ext = extensionFor(contentType);
  const ts = Date.now();
  const path = `${userId}/avatar-${ts}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const arrayBuffer = base64ToArrayBuffer(base64);

  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, arrayBuffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Failed to retrieve public URL after avatar upload.');
  return { publicUrl: data.publicUrl, path };
}

/**
 * Generates a JPEG thumbnail from the first frame (or a small offset) of a local video URI.
 */
export async function generateVideoThumbnail(videoUri: string): Promise<string> {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: 500, // 0.5s offset usually yields a clean frame
    quality: 0.8,
  });
  return uri;
}

export async function getFileSize(uri: string): Promise<number | null> {
  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    if (info?.exists && typeof info.size === 'number') return info.size;
    return null;
  } catch {
    return null;
  }
}
