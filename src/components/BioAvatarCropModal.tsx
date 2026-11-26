import {
  Check,
  Loader2,
  Move,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  AVATAR_OUTPUT_SIZE,
  clampAvatarCropOffsets,
  encodeCroppedAvatarToAvif,
  formatBytesCompact,
  type EncodedAvatarResult,
} from '../utils/avatarEncoder';

interface BioAvatarCropModalProps {
  isOpen: boolean;
  lang: Language;
  imageFile: File | null;
  scopeLabel: string;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: (result: EncodedAvatarResult) => Promise<void> | void;
  onConfirmDirectServer: (rawFile: File) => Promise<void> | void;
}

const VIEWPORT_SIZE = 280;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function BioAvatarCropModal({
  isOpen,
  lang,
  imageFile,
  scopeLabel,
  uploading,
  onCancel,
  onConfirm,
  onConfirmDirectServer,
}: BioAvatarCropModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(
    null
  );
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const [encoding, setEncoding] = useState(false);
  const [encodedPreview, setEncodedPreview] =
    useState<EncodedAvatarResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
  } | null>(null);

  // Load object URL for selected File and clean up on close/change
  useEffect(() => {
    if (!isOpen || !imageFile) {
      setObjectUrl(null);
      setNaturalDims(null);
      setPreviewUnavailable(false);
      setEncodedPreview(null);
      setErrorMsg(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setObjectUrl(url);
    setNaturalDims(null);
    setPreviewUnavailable(false);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setEncodedPreview(null);
    setErrorMsg(null);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isOpen, imageFile]);

  // Close on Escape key when not uploading
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, uploading, onCancel]);

  const computeClamped = useCallback(
    (nextZoom: number, nextX: number, nextY: number) => {
      if (!naturalDims) {
        return {
          offsetX: 0,
          offsetY: 0,
          drawWidth: VIEWPORT_SIZE,
          drawHeight: VIEWPORT_SIZE,
        };
      }
      return clampAvatarCropOffsets(
        naturalDims.w,
        naturalDims.h,
        VIEWPORT_SIZE,
        nextZoom,
        nextX,
        nextY
      );
    },
    [naturalDims]
  );

  // Debounced live AVIF/WebP compression estimator
  useEffect(() => {
    if (!isOpen || !naturalDims || !imageRef.current) return;
    let cancelled = false;
    setEncoding(true);
    setErrorMsg(null);

    const timer = window.setTimeout(async () => {
      try {
        if (!imageRef.current) return;
        const result = await encodeCroppedAvatarToAvif(
          imageRef.current,
          {
            zoom,
            offsetX,
            offsetY,
            viewportSize: VIEWPORT_SIZE,
          },
          AVATAR_OUTPUT_SIZE
        );
        if (!cancelled) {
          setEncodedPreview(result);
        }
      } catch (err) {
        if (!cancelled) {
          setEncodedPreview(null);
          setErrorMsg(
            err instanceof Error
              ? err.message
              : lang === 'id'
                ? 'Pratinjau crop browser tidak tersedia. Gunakan tombol "Konversi Langsung di Server" di bawah.'
                : 'Browser crop preview unavailable. Use "Direct Server AVIF Convert" below.'
          );
        }
      } finally {
        if (!cancelled) {
          setEncoding(false);
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, naturalDims, zoom, offsetX, offsetY, lang]);

  if (!isOpen || !imageFile) return null;

  const clamped = computeClamped(zoom, offsetX, offsetY);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imageRef.current = img;
    setPreviewUnavailable(false);
    setNaturalDims({
      w: img.naturalWidth || img.width || 1,
      h: img.naturalHeight || img.height || 1,
    });
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleZoomChange = (rawZoom: number) => {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(rawZoom.toFixed(2))));
    const next = computeClamped(nextZoom, offsetX, offsetY);
    setZoom(nextZoom);
    setOffsetX(next.offsetX);
    setOffsetY(next.offsetY);
  };

  const handleReset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!naturalDims || uploading) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: clamped.offsetX,
      baseOffsetY: clamped.offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const next = computeClamped(
      zoom,
      drag.baseOffsetX + dx,
      drag.baseOffsetY + dy
    );
    setOffsetX(next.offsetX);
    setOffsetY(next.offsetY);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStartRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleConfirmClick = async () => {
    if (!imageRef.current || uploading) return;
    try {
      setEncoding(true);
      const freshResult =
        encodedPreview ||
        (await encodeCroppedAvatarToAvif(
          imageRef.current,
          {
            zoom,
            offsetX: clamped.offsetX,
            offsetY: clamped.offsetY,
            viewportSize: VIEWPORT_SIZE,
          },
          AVATAR_OUTPUT_SIZE
        ));
      setEncoding(false);
      await onConfirm(freshResult);
    } catch (err) {
      setEncoding(false);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : lang === 'id'
            ? 'Gagal memproses gambar.'
            : 'Failed to process image.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bio-avatar-crop-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#252A36] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="bio-avatar-crop-title"
              className="text-sm font-bold text-slate-900 dark:text-white font-display"
            >
              {lang === 'id'
                ? 'Konverter Gambar AVIF & Crop Opsional'
                : 'Server AVIF Converter & Optional Crop'}
            </h2>
            <div className="text-[11px] font-mono text-slate-500 truncate">
              {scopeLabel} · {imageFile.name} ({formatBytesCompact(imageFile.size)})
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E2430] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Crop Viewport or Direct Server Conversion Notice */}
        <div className="p-5 space-y-4">
          {previewUnavailable ? (
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2 text-xs text-slate-700 dark:text-slate-200">
              <div className="font-semibold text-blue-800 dark:text-blue-300">
                {lang === 'id'
                  ? 'Pratinjau format mentah tidak didukung browser ini — siap dikonversi otomatis di server!'
                  : 'Raw format preview is unsupported in this browser — ready for automatic server AVIF conversion!'}
              </div>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                {lang === 'id'
                  ? 'Klik "Konversi Server -> AVIF" di bawah untuk langsung mengirim file asli ke Cloudflare Images agar otomatis dipotong tengah 1:1, diubah menjadi AVIF ringan, dan disimpan ke R2.'
                  : 'Click "Server Convert -> AVIF" below to upload the raw file directly to Cloudflare Images for automatic center crop, AVIF encoding, and R2 storage.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center space-y-2.5">
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  className={`relative overflow-hidden rounded-2xl border-2 border-slate-300 dark:border-[#32394A] bg-slate-950 select-none touch-none ${
                    dragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
                >
                  {objectUrl && (
                    <img
                      src={objectUrl}
                      alt="Crop source"
                      draggable={false}
                      onLoad={handleImageLoad}
                      onError={() => {
                        setPreviewUnavailable(true);
                        setNaturalDims(null);
                      }}
                      className="pointer-events-none select-none max-w-none absolute left-1/2 top-1/2"
                      style={{
                        width: clamped.drawWidth,
                        height: clamped.drawHeight,
                        transform: `translate(-50%, -50%) translate(${clamped.offsetX}px, ${clamped.offsetY}px)`,
                      }}
                    />
                  )}

                  {/* Subtle 1:1 crop frame guide */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-3 rounded-2xl border border-dashed border-white/45"
                  />
                </div>

                <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Move className="w-3 h-3" />
                  <span>
                    {lang === 'id'
                      ? 'Opsional: geser/zoom untuk crop manual, atau langsung konversi AVIF di server'
                      : 'Optional: drag/zoom to crop manually, or convert directly on server to AVIF'}
                  </span>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Zoom
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {zoom.toFixed(2)}×
                    </span>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={uploading || (zoom === 1 && offsetX === 0 && offsetY === 0)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoom - 0.15)}
                    disabled={uploading || zoom <= MIN_ZOOM}
                    aria-label="Zoom out"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2A303E] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={zoom}
                    disabled={uploading}
                    onChange={(e) => handleZoomChange(Number(e.target.value))}
                    aria-label="Zoom level"
                    className="flex-1 accent-blue-600 cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoom + 0.15)}
                    disabled={uploading || zoom >= MAX_ZOOM}
                    aria-label="Zoom in"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2A303E] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Live Output Metadata Bar */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-500">
                {lang === 'id'
                  ? 'Target Penyimpanan Cloudflare R2'
                  : 'Cloudflare R2 Storage Target'}
              </div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                AVIF · Cloudflare Images / Edge R2
              </div>
            </div>

            <div className="text-right font-mono tabular-nums">
              {encoding ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{lang === 'id' ? 'Menghitung...' : 'Sizing...'}</span>
                </span>
              ) : encodedPreview ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Check className="w-3.5 h-3.5" />
                  <span>{formatBytesCompact(encodedPreview.byteSize)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">
                  {formatBytesCompact(imageFile.size)}
                </span>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#232732] bg-slate-50/70 dark:bg-[#0E1117] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void onConfirmDirectServer(imageFile)}
            disabled={uploading}
            className="min-h-[38px] px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {lang === 'id'
                ? 'Langsung Server -> AVIF'
                : 'Direct Server -> AVIF'}
            </span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={uploading}
              className="min-h-[38px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#202634] border border-slate-200 dark:border-[#2A303E] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {lang === 'id' ? 'Batal' : 'Cancel'}
            </button>

            {!previewUnavailable && (
              <button
                type="button"
                onClick={() => void handleConfirmClick()}
                disabled={uploading || encoding || !naturalDims || Boolean(errorMsg)}
                className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{lang === 'id' ? 'Mengunggah...' : 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'id' ? 'Crop & Unggah AVIF' : 'Crop & Upload AVIF'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
