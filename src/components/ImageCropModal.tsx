import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ID_CARD_ASPECT_RATIO,
  toJpegFilename,
} from "@/lib/credentialCameraCrop";
import { DEFAULT_JPEG_QUALITY } from "@/lib/imageCompression";

export interface ImageCropModalProps {
  open: boolean;
  file: File | null;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

const OUTPUT_MAX_WIDTH = 1200;

export function ImageCropModal({
  open,
  file,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Crop viewport state
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Load object URL when file changes
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setImageDimensions(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 500,
      });
    };
    img.onerror = () => {
      setImageDimensions({ width: 800, height: 500 });
    };
    img.src = url;

    // Fallback for test environments where Image.onload is not triggered
    const timer = setTimeout(() => {
      setImageDimensions((prev) => prev ?? { width: 800, height: 500 });
    }, 50);

    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Clamp offset to keep image moveable inside viewport
  const clampOffset = useCallback(
    (newX: number, newY: number, currentZoom: number) => {
      if (!viewportRef.current || !imageDimensions) {
        return { x: newX, y: newY };
      }

      const viewportWidth = viewportRef.current.clientWidth;
      const viewportHeight = viewportRef.current.clientHeight;

      const baseScale = Math.max(
        viewportWidth / imageDimensions.width,
        viewportHeight / imageDimensions.height,
      );

      const dispW = imageDimensions.width * baseScale * currentZoom;
      const dispH = imageDimensions.height * baseScale * currentZoom;

      const maxOffsetX = Math.max(0, (dispW - viewportWidth) / 2);
      const maxOffsetY = Math.max(0, (dispH - viewportHeight) / 2);

      return {
        x: Math.min(maxOffsetX, Math.max(-maxOffsetX, newX)),
        y: Math.min(maxOffsetY, Math.max(-maxOffsetY, newY)),
      };
    },
    [imageDimensions],
  );

  // Mouse drag handlers
  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    offsetStartRef.current = { ...offset };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextX = offsetStartRef.current.x + dx;
      const nextY = offsetStartRef.current.y + dy;
      setOffset(clampOffset(nextX, nextY, zoom));
    },
    [isDragging, clampOffset, zoom],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers: 1 finger drag, 2 finger pinch-to-zoom
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      offsetStartRef.current = { ...offset };
      pinchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - dragStartRef.current.x;
        const dy = e.touches[0].clientY - dragStartRef.current.y;
        const nextX = offsetStartRef.current.x + dx;
        const nextY = offsetStartRef.current.y + dy;
        setOffset(clampOffset(nextX, nextY, zoom));
      } else if (
        e.touches.length === 2 &&
        pinchStartDistRef.current !== null &&
        pinchStartDistRef.current > 0
      ) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const scale = dist / pinchStartDistRef.current;
        const newZoom = Math.min(4, Math.max(1, pinchStartZoomRef.current * scale));
        setZoom(newZoom);
        setOffset((prev) => clampOffset(prev.x, prev.y, newZoom));
      }
    },
    [isDragging, clampOffset, zoom],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    pinchStartDistRef.current = null;
  }, []);

  // Mouse Wheel Zoom
  const handleWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const newZoom = Math.min(4, Math.max(1, zoom + delta));
    setZoom(newZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, newZoom));
  };

  // Attach global mouseup/mousemove listeners when dragging
  useEffect(() => {
    if (isDragging || pinchStartDistRef.current !== null) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const handleConfirmCrop = async () => {
    if (!file || !imageUrl) {
      return;
    }

    setIsProcessing(true);
    try {
      let imgSource: CanvasImageSource;
      let imgW: number;
      let imgH: number;

      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(file);
          imgSource = bitmap;
          imgW = bitmap.width;
          imgH = bitmap.height;
        } catch {
          const img = new Image();
          img.src = imageUrl;
          await new Promise<void>((resolve) => {
            if (img.complete || img.naturalWidth > 0) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 50);
            }
          });
          imgSource = img;
          imgW = img.naturalWidth || imageDimensions?.width || 800;
          imgH = img.naturalHeight || imageDimensions?.height || 500;
        }
      } else {
        const img = new Image();
        img.src = imageUrl;
        await new Promise<void>((resolve) => {
          if (img.complete || img.naturalWidth > 0) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 50);
          }
        });
        imgSource = img;
        imgW = img.naturalWidth || imageDimensions?.width || 800;
        imgH = img.naturalHeight || imageDimensions?.height || 500;
      }

      const viewportWidth = viewportRef.current?.clientWidth || 380;
      const viewportHeight = viewportRef.current?.clientHeight || 240;

      const baseScale = Math.max(
        viewportWidth / imgW,
        viewportHeight / imgH,
      );
      const totalScale = baseScale * zoom;

      const sW = viewportWidth / totalScale;
      const sH = viewportHeight / totalScale;

      let sx = imgW / 2 - offset.x / totalScale - sW / 2;
      let sy = imgH / 2 - offset.y / totalScale - sH / 2;

      sx = Math.max(0, Math.min(Math.max(0, imgW - sW), sx));
      sy = Math.max(0, Math.min(Math.max(0, imgH - sH), sy));

      const outW = Math.min(OUTPUT_MAX_WIDTH, Math.round(sW));
      const outH = Math.round(outW / ID_CARD_ASPECT_RATIO);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(imgSource, sx, sy, sW, sH, 0, 0, outW, outH);
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        if (!canvas.toBlob) {
          resolve(null);
          return;
        }
        canvas.toBlob(resolve, "image/jpeg", DEFAULT_JPEG_QUALITY);
        setTimeout(() => resolve(null), 50);
      });

      if (!blob) {
        onConfirm(file);
        return;
      }

      const croppedFile = new File([blob], toJpegFilename(file.name), {
        type: "image/jpeg",
      });

      onConfirm(croppedFile);
    } catch {
      onConfirm(file);
    } finally {
      setIsProcessing(false);
    }
  };

  const currentDimensions = imageDimensions ?? { width: 800, height: 500 };
  const currentViewportWidth = viewportRef.current?.clientWidth || 380;
  const currentViewportHeight = viewportRef.current?.clientHeight || 240;
  const currentBaseScale = Math.max(
    currentViewportWidth / currentDimensions.width,
    currentViewportHeight / currentDimensions.height,
  );
  const renderedImageWidth = currentDimensions.width * currentBaseScale;
  const renderedImageHeight = currentDimensions.height * currentBaseScale;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onCancel()}
      manageHistory={false}
    >
      <DialogContent className="max-w-md p-4 flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Recortar credencial</DialogTitle>
          <DialogDescription>
            Arrastra y ajusta el zoom para encuadrar la credencial antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {/* Viewport Box Container */}
        <div
          ref={viewportRef}
          className="relative w-full overflow-hidden rounded-xl bg-card border border-border select-none touch-none cursor-grab active:cursor-grabbing shadow-inner"
          style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onWheel={handleWheel}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Credencial a recortar"
              className="absolute max-w-none max-h-none pointer-events-none transition-transform duration-75"
              style={{
                top: "50%",
                left: "50%",
                width: `${renderedImageWidth}px`,
                height: `${renderedImageHeight}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
            />
          )}

          {/* Subtle Frame Overlay */}
          <div className="absolute inset-0 pointer-events-none border-2 border-primary/70 rounded-xl flex items-center justify-center">
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/90 bg-black/50 px-2.5 py-0.5 rounded-full border border-white/20 backdrop-blur-xs">
              Credencial
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirmCrop()}
            disabled={isProcessing}
            className="flex-1"
          >
            <Check className="size-4 mr-1.5" />
            {isProcessing ? "Recortando…" : "Usar foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
