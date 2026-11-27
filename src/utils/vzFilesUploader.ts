/**
 * Client-side uploader for VZ Files (https://files.vz.gay), powered by VikingFile API
 * via same-origin proxy endpoints (/api/vzfiles/*) mirroring github.com/nabhan-rp/vzfiles.
 *
 * Used in VZ Mail Composer for files > 10 MB (zero R2 storage footprint).
 */

import { apiFetch, getApiAuthToken } from './apiAuthClient';
import { buildVzFilesShareUrl } from './mailExternalLinks';

export interface VzFilesUploadResult {
  hash: string;
  shareUrl: string;
  filename: string;
  sizeBytes: number;
}

export interface VzFilesUploadProgress {
  percent: number;
  stage: 'preparing' | 'uploading' | 'finalizing';
  detail: string;
}

interface GetUploadUrlResponse {
  uploadId?: string;
  key?: string;
  partSize?: number;
  urls?: string[];
  error?: string;
}

interface CompleteUploadResponse {
  hash?: string;
  url?: string;
  name?: string;
  error?: string;
}

function putPartDirectWithProgress(
  url: string,
  chunk: Blob,
  onChunkProgress: (loadedBytes: number) => void
): Promise<{ ok: boolean; etag?: string }> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onChunkProgress(ev.loaded);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const rawEtag =
            xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '';
          const etag = rawEtag.replace(/^"|"$/g, '').trim();
          if (etag) {
            onChunkProgress(chunk.size);
            resolve({ ok: true, etag });
            return;
          }
        }
        resolve({ ok: false });
      };
      xhr.onerror = () => resolve({ ok: false });
      xhr.onabort = () => resolve({ ok: false });
      xhr.send(chunk);
    } catch {
      resolve({ ok: false });
    }
  });
}

async function putPartViaProxyWithProgress(
  targetUrl: string,
  chunk: Blob,
  onChunkProgress: (loadedBytes: number) => void
): Promise<{ ok: boolean; etag?: string; error?: string }> {
  const authToken = await getApiAuthToken();
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/vzfiles/upload-part', true);
      xhr.setRequestHeader('x-target-url', targetUrl);
      if (authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      }
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onChunkProgress(ev.loaded);
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as {
            etag?: string;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && data.etag) {
            onChunkProgress(chunk.size);
            resolve({ ok: true, etag: String(data.etag).replace(/^"|"$/g, '') });
            return;
          }
          resolve({
            ok: false,
            error: data.error || `HTTP ${xhr.status}`,
          });
        } catch {
          resolve({ ok: false, error: `HTTP ${xhr.status}` });
        }
      };
      xhr.onerror = () => resolve({ ok: false, error: 'Network error' });
      xhr.send(chunk);
    } catch (err) {
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : 'Proxy upload failed',
      });
    }
  });
}

async function legacySingleUpload(
  file: File,
  onProgress?: (p: VzFilesUploadProgress) => void
): Promise<VzFilesUploadResult> {
  onProgress?.({
    percent: 15,
    stage: 'uploading',
    detail: `Mengunggah ${file.name} via VZ Files...`,
  });

  const authToken = await getApiAuthToken();
  const result = await new Promise<{ ok: boolean; hash?: string; error?: string }>(
    (resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/vzfiles/legacy-upload', true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name || 'upload.bin'));
      if (authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      }
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.min(95, Math.max(15, Math.round((ev.loaded / ev.total) * 90)));
          onProgress?.({
            percent: pct,
            stage: 'uploading',
            detail: `Mengunggah ke VZ Files (${pct}%)...`,
          });
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as {
            hash?: string;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && data.hash) {
            resolve({ ok: true, hash: String(data.hash) });
            return;
          }
          resolve({ ok: false, error: data.error || `HTTP ${xhr.status}` });
        } catch {
          resolve({ ok: false, error: `HTTP ${xhr.status}` });
        }
      };
      xhr.onerror = () => resolve({ ok: false, error: 'Gagal terhubung ke VZ Files.' });
      xhr.send(file);
    }
  );

  if (!result.ok || !result.hash) {
    throw new Error(result.error || 'Upload ke VZ Files gagal.');
  }

  onProgress?.({
    percent: 100,
    stage: 'finalizing',
    detail: 'Selesai! Tautan files.vz.gay siap disisipkan.',
  });

  return {
    hash: result.hash,
    shareUrl: buildVzFilesShareUrl(result.hash),
    filename: file.name || 'upload.bin',
    sizeBytes: file.size,
  };
}

/**
 * Uploads any file directly to VZ Files (https://files.vz.gay / VikingFile)
 * and returns the canonical share URL `https://files.vz.gay/?f=<hash>`.
 */
export async function uploadFileToVzFiles(
  file: File,
  onProgress?: (p: VzFilesUploadProgress) => void
): Promise<VzFilesUploadResult> {
  if (!file || file.size <= 0) {
    throw new Error('File kosong tidak dapat diunggah ke VZ Files.');
  }

  onProgress?.({
    percent: 4,
    stage: 'preparing',
    detail: 'Menyiapkan slot unggahan di VZ Files (files.vz.gay)...',
  });

  // 1. Request multipart presigned URLs from VikingFile via same-origin proxy
  let initData: GetUploadUrlResponse | null = null;
  try {
    const initRes = await apiFetch('/api/vzfiles/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: file.size }),
    });
    if (initRes.ok) {
      initData = (await initRes.json().catch(() => null)) as GetUploadUrlResponse | null;
    }
  } catch {
    initData = null;
  }

  // Fallback to legacy single upload if multipart init unavailable and file <= 20 MB (safe for Worker 128 MB RAM limit)
  if (
    !initData ||
    !initData.uploadId ||
    !initData.key ||
    !Array.isArray(initData.urls) ||
    initData.urls.length === 0
  ) {
    if (file.size <= 20 * 1024 * 1024) {
      return legacySingleUpload(file, onProgress);
    }
    throw new Error(
      initData?.error ||
        'Gagal meminta URL unggahan VZ Files. Anda dapat mengunggah manual melalui https://files.vz.gay lalu menempel tautannya.'
    );
  }

  const partSize =
    Number.isFinite(initData.partSize) && (initData.partSize as number) > 0
      ? (initData.partSize as number)
      : Math.ceil(file.size / initData.urls.length);
  const totalParts = initData.urls.length;
  const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
  let uploadedBaseBytes = 0;

  // 2. Upload each chunk (tries direct PUT first, auto-falls back to same-origin proxy if CORS hides ETag)
  let preferProxy = false;
  for (let i = 0; i < totalParts; i += 1) {
    const start = i * partSize;
    const end = Math.min(file.size, start + partSize);
    const chunk = file.slice(start, end);
    const targetUrl = initData.urls[i];

    const reportPartProgress = (loadedInPart: number) => {
      const totalLoaded = Math.min(file.size, uploadedBaseBytes + loadedInPart);
      const pct = Math.min(95, Math.max(5, Math.round((totalLoaded / file.size) * 90) + 4));
      onProgress?.({
        percent: pct,
        stage: 'uploading',
        detail:
          totalParts > 1
            ? `Mengunggah bagian ${i + 1}/${totalParts} ke VZ Files (${pct}%)...`
            : `Mengunggah ke VZ Files (${pct}%)...`,
      });
    };

    let etag: string | undefined;
    if (!preferProxy) {
      const direct = await putPartDirectWithProgress(targetUrl, chunk, reportPartProgress);
      if (direct.ok && direct.etag) {
        etag = direct.etag;
      } else {
        preferProxy = true;
      }
    }

    if (!etag) {
      const relayed = await putPartViaProxyWithProgress(
        targetUrl,
        chunk,
        reportPartProgress
      );
      if (!relayed.ok || !relayed.etag) {
        throw new Error(
          relayed.error ||
            `Gagal mengunggah bagian ${i + 1}/${totalParts} ke VZ Files.`
        );
      }
      etag = relayed.etag;
    }

    uploadedBaseBytes += chunk.size;
    completedParts.push({
      PartNumber: i + 1,
      ETag: etag,
    });
  }

  // 3. Complete multipart upload
  onProgress?.({
    percent: 97,
    stage: 'finalizing',
    detail: 'Menyelesaikan tautan berbagi files.vz.gay...',
  });

  const completeRes = await apiFetch('/api/vzfiles/complete-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: initData.key,
      uploadId: initData.uploadId,
      name: file.name || 'upload.bin',
      user: '',
      parts: completedParts,
    }),
  });
  const completeData = (await completeRes.json().catch(() => null)) as
    | CompleteUploadResponse
    | null;

  if (!completeRes.ok || !completeData?.hash) {
    throw new Error(
      completeData?.error ||
        'Gagal menyelesaikan unggahan VZ Files. Coba lagi atau unggah lewat https://files.vz.gay.'
    );
  }

  onProgress?.({
    percent: 100,
    stage: 'finalizing',
    detail: 'Tautan VZ Files siap disisipkan!',
  });

  return {
    hash: completeData.hash,
    shareUrl: buildVzFilesShareUrl(completeData.hash),
    filename: file.name || 'upload.bin',
    sizeBytes: file.size,
  };
}
