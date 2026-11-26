import QRCode from 'qrcode';
import { forwardRef, useId, useMemo, type ReactElement } from 'react';
import {
  DEFAULT_BIO_QR_DESIGN,
  type BioQrDesignConfig,
} from '../utils/linksModel';
import { sanitizeDownloadFilename } from '../utils/qrPayloads';

export interface StylizedQrCodeProps {
  value: string;
  design?: Partial<BioQrDesignConfig>;
  centerImageUrl?: string;
  monogramText?: string;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

function isInsideFinderPattern(row: number, col: number, count: number): boolean {
  const topLeft = row < 7 && col < 7;
  const topRight = row < 7 && col >= count - 7;
  const bottomLeft = row >= count - 7 && col < 7;
  return topLeft || topRight || bottomLeft;
}

function renderFinderEye(
  originX: number,
  originY: number,
  cornerStyle: BioQrDesignConfig['cornerStyle'],
  fgColor: string,
  bgColor: string,
  keyPrefix: string
) {
  const outerRx = cornerStyle === 'dot' ? 3.5 : cornerStyle === 'rounded' ? 1.8 : 0;
  const midRx = cornerStyle === 'dot' ? 2.5 : cornerStyle === 'rounded' ? 1.15 : 0;
  const innerRx = cornerStyle === 'dot' ? 1.5 : cornerStyle === 'rounded' ? 0.75 : 0;

  return (
    <g key={keyPrefix}>
      <rect
        x={originX}
        y={originY}
        width={7}
        height={7}
        rx={outerRx}
        ry={outerRx}
        fill={fgColor}
      />
      <rect
        x={originX + 1}
        y={originY + 1}
        width={5}
        height={5}
        rx={midRx}
        ry={midRx}
        fill={bgColor}
      />
      <rect
        x={originX + 2}
        y={originY + 2}
        width={3}
        height={3}
        rx={innerRx}
        ry={innerRx}
        fill={fgColor}
      />
    </g>
  );
}

export const StylizedQrCode = forwardRef<SVGSVGElement, StylizedQrCodeProps>(
  function StylizedQrCode(
    {
      value,
      design,
      centerImageUrl = '',
      monogramText = 'VZ',
      size = 260,
      className = '',
      ariaLabel,
    },
    ref
  ) {
    const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

    const cfg: BioQrDesignConfig = {
      ...DEFAULT_BIO_QR_DESIGN,
      ...design,
    };

    const hasAvatarCenter =
      cfg.centerLogoMode === 'bio_avatar' && Boolean(centerImageUrl.trim());
    const hasMonogramCenter =
      cfg.centerLogoMode === 'monogram' ||
      (cfg.centerLogoMode === 'bio_avatar' && !centerImageUrl.trim() && Boolean(monogramText.trim()));
    const showCenterBadge = hasAvatarCenter || hasMonogramCenter;

    const qrMatrix = useMemo(() => {
      const safePayload = value.trim() || 'https://imy.li';
      try {
        const created = QRCode.create(safePayload, {
          errorCorrectionLevel: showCenterBadge ? 'H' : 'M',
        });
        return {
          count: created.modules.size,
          data: created.modules.data,
        };
      } catch {
        const fallback = QRCode.create('https://imy.li', {
          errorCorrectionLevel: 'M',
        });
        return {
          count: fallback.modules.size,
          data: fallback.modules.data,
        };
      }
    }, [value, showCenterBadge]);

    const { count, data } = qrMatrix;
    const quietZone = 3;
    const qrAreaSize = count + quietZone * 2;
    const hasFrameText =
      cfg.frameStyle !== 'none' && cfg.frameText.trim().length > 0;
    const cardPad = cfg.frameStyle === 'card' ? 2.4 : 0;
    const footerHeight =
      cfg.frameStyle === 'none' ? 0 : hasFrameText ? 6.2 : 1.6;

    const viewWidth = qrAreaSize + cardPad * 2;
    const viewHeight = qrAreaSize + cardPad * 2 + footerHeight;
    const qrOffsetX = cardPad + quietZone;
    const qrOffsetY = cardPad + quietZone;

    // Safe center cutout (~22% of matrix width, odd-aligned around center)
    const centerRadiusModules = showCenterBadge
      ? Math.max(2.6, Math.min(4.6, count * 0.135))
      : 0;
    const matrixCenter = count / 2;

    const modulesNodes = useMemo(() => {
      const nodes: ReactElement[] = [];
      for (let row = 0; row < count; row += 1) {
        for (let col = 0; col < count; col += 1) {
          if (!data[row * count + col]) continue;
          if (isInsideFinderPattern(row, col, count)) continue;

          if (showCenterBadge) {
            const dx = Math.abs(col + 0.5 - matrixCenter);
            const dy = Math.abs(row + 0.5 - matrixCenter);
            if (dx < centerRadiusModules && dy < centerRadiusModules) {
              continue;
            }
          }

          const x = qrOffsetX + col;
          const y = qrOffsetY + row;
          const key = `${row}-${col}`;

          if (cfg.dotStyle === 'dots') {
            nodes.push(
              <circle
                key={key}
                cx={x + 0.5}
                cy={y + 0.5}
                r={0.43}
                fill={cfg.fgColor}
              />
            );
          } else if (cfg.dotStyle === 'rounded') {
            nodes.push(
              <rect
                key={key}
                x={x + 0.05}
                y={y + 0.05}
                width={0.9}
                height={0.9}
                rx={0.28}
                ry={0.28}
                fill={cfg.fgColor}
              />
            );
          } else if (cfg.dotStyle === 'classy') {
            // Sleek diagonal-rounded leaf module
            const d = `M ${x + 0.38} ${y + 0.04} L ${x + 0.96} ${y + 0.04} L ${x + 0.96} ${y + 0.62} Q ${x + 0.96} ${y + 0.96} ${x + 0.62} ${y + 0.96} L ${x + 0.04} ${y + 0.96} L ${x + 0.04} ${y + 0.38} Q ${x + 0.04} ${y + 0.04} ${x + 0.38} ${y + 0.04} Z`;
            nodes.push(<path key={key} d={d} fill={cfg.fgColor} />);
          } else {
            nodes.push(
              <rect
                key={key}
                x={x}
                y={y}
                width={1.03}
                height={1.03}
                fill={cfg.fgColor}
              />
            );
          }
        }
      }
      return nodes;
    }, [
      count,
      data,
      showCenterBadge,
      matrixCenter,
      centerRadiusModules,
      qrOffsetX,
      qrOffsetY,
      cfg.dotStyle,
      cfg.fgColor,
    ]);

    const badgeBoxSize = centerRadiusModules * 2 - 0.6;
    const badgeX = qrOffsetX + matrixCenter - badgeBoxSize / 2;
    const badgeY = qrOffsetY + matrixCenter - badgeBoxSize / 2;
    const badgeInnerPad = Math.max(0.45, badgeBoxSize * 0.1);
    const badgeImgSize = badgeBoxSize - badgeInnerPad * 2;
    const initials = (monogramText || 'VZ').trim().slice(0, 2).toUpperCase() || 'VZ';

    const displayHeight = Math.round((size * viewHeight) / viewWidth);
    const labelText = cfg.frameText.trim().slice(0, 42);
    const labelFontSize =
      labelText.length > 26 ? 1.85 : labelText.length > 18 ? 2.15 : 2.55;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width={size}
        height={displayHeight}
        role="img"
        aria-label={ariaLabel || `QR Code for ${value}`}
        className={`block max-w-full h-auto select-none ${className}`}
      >
        <defs>
          <clipPath id={`qr-clip-${clipId}`}>
            <rect
              x={badgeX + badgeInnerPad}
              y={badgeY + badgeInnerPad}
              width={badgeImgSize}
              height={badgeImgSize}
              rx={badgeImgSize * 0.24}
              ry={badgeImgSize * 0.24}
            />
          </clipPath>
        </defs>

        {/* Outer Frame / Background */}
        {cfg.frameStyle === 'card' ? (
          <>
            <rect
              x={0}
              y={0}
              width={viewWidth}
              height={viewHeight}
              rx={3.2}
              ry={3.2}
              fill={cfg.frameColor}
            />
            <rect
              x={cardPad}
              y={cardPad}
              width={qrAreaSize}
              height={qrAreaSize}
              rx={2.1}
              ry={2.1}
              fill={cfg.bgColor}
            />
          </>
        ) : (
          <rect
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            rx={2.4}
            ry={2.4}
            fill={cfg.bgColor}
          />
        )}

        {/* Bottom Banner Bar (for bottom_bar style) */}
        {cfg.frameStyle === 'bottom_bar' && (
          <rect
            x={1.6}
            y={qrAreaSize - 0.2}
            width={viewWidth - 3.2}
            height={footerHeight - 1.1}
            rx={1.8}
            ry={1.8}
            fill={cfg.frameColor}
          />
        )}

        {/* Three 7x7 Finder Eyes */}
        {renderFinderEye(qrOffsetX, qrOffsetY, cfg.cornerStyle, cfg.fgColor, cfg.bgColor, 'eye-tl')}
        {renderFinderEye(
          qrOffsetX + count - 7,
          qrOffsetY,
          cfg.cornerStyle,
          cfg.fgColor,
          cfg.bgColor,
          'eye-tr'
        )}
        {renderFinderEye(
          qrOffsetX,
          qrOffsetY + count - 7,
          cfg.cornerStyle,
          cfg.fgColor,
          cfg.bgColor,
          'eye-bl'
        )}

        {/* QR Data Modules */}
        <g>{modulesNodes}</g>

        {/* Optional Center Bio Avatar or Monogram Badge (High ECC 'H') */}
        {showCenterBadge && (
          <g>
            <rect
              x={badgeX}
              y={badgeY}
              width={badgeBoxSize}
              height={badgeBoxSize}
              rx={badgeBoxSize * 0.26}
              ry={badgeBoxSize * 0.26}
              fill={cfg.bgColor}
            />
            {hasAvatarCenter ? (
              <image
                href={centerImageUrl}
                x={badgeX + badgeInnerPad}
                y={badgeY + badgeInnerPad}
                width={badgeImgSize}
                height={badgeImgSize}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#qr-clip-${clipId})`}
              />
            ) : (
              <>
                <rect
                  x={badgeX + badgeInnerPad}
                  y={badgeY + badgeInnerPad}
                  width={badgeImgSize}
                  height={badgeImgSize}
                  rx={badgeImgSize * 0.24}
                  ry={badgeImgSize * 0.24}
                  fill={cfg.fgColor}
                />
                <text
                  x={qrOffsetX + matrixCenter}
                  y={qrOffsetY + matrixCenter + badgeImgSize * 0.14}
                  textAnchor="middle"
                  fill={cfg.bgColor}
                  fontSize={badgeImgSize * 0.44}
                  fontWeight={700}
                  fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                >
                  {initials}
                </text>
              </>
            )}
          </g>
        )}

        {/* Optional Frame Label Text */}
        {hasFrameText && (
          <text
            x={viewWidth / 2}
            y={
              cfg.frameStyle === 'card'
                ? cardPad + qrAreaSize + footerHeight * 0.64
                : qrAreaSize + (footerHeight - 1.3) * 0.62
            }
            textAnchor="middle"
            fill={cfg.frameTextColor}
            fontSize={labelFontSize}
            fontWeight={700}
            letterSpacing="0.06em"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          >
            {labelText}
          </text>
        )}
      </svg>
    );
  }
);

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function serializeQrSvgWithEmbeddedImages(
  svgEl: SVGSVGElement
): Promise<string> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const images = Array.from(clone.querySelectorAll('image'));
  for (const imgEl of images) {
    const href = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href');
    if (href && !href.startsWith('data:')) {
      const dataUrl = await fetchImageAsDataUrl(href);
      if (dataUrl) {
        imgEl.setAttribute('href', dataUrl);
      } else {
        // Remove tainted external image if CORS blocks embedding so Canvas export never fails
        imgEl.remove();
      }
    }
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

export async function downloadQrSvg(
  svgEl: SVGSVGElement | null,
  rawFilename: string
): Promise<boolean> {
  if (!svgEl) return false;
  try {
    const svgString = await serializeQrSvgWithEmbeddedImages(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = sanitizeDownloadFilename(rawFilename, 'svg');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch {
    return false;
  }
}

export async function downloadQrPng(
  svgEl: SVGSVGElement | null,
  rawFilename: string,
  targetWidth = 1024
): Promise<boolean> {
  if (!svgEl) return false;
  try {
    const svgString = await serializeQrSvgWithEmbeddedImages(svgEl);
    const viewBoxAttr = svgEl.getAttribute('viewBox') || '0 0 100 100';
    const parts = viewBoxAttr.split(/\s+/).map(Number);
    const vbWidth = parts[2] || 100;
    const vbHeight = parts[3] || 100;
    const targetHeight = Math.max(1, Math.round((targetWidth * vbHeight) / vbWidth));

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('SVG render error'));
        el.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1)
      );
      if (!pngBlob) return false;

      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = sanitizeDownloadFilename(rawFilename, 'png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
      return true;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  } catch {
    return false;
  }
}
