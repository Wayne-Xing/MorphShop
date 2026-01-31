"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  label: string;
  description?: string;
  /** Selected local file (for immediate preview before upload completes) */
  file?: File | null;
  value?: { id: number; url: string; filename: string } | null;
  onChange: (file: File | null) => void;
  onUploadComplete?: (asset: { id: number; url: string; filename: string }) => void;
  onClearValue?: () => void;
  isUploading?: boolean;
  error?: string;
  accept?: string;
  maxSize?: number; // bytes
}

export function ImageUploader({
  label,
  description,
  file,
  value,
  onChange,
  onUploadComplete,
  onClearValue,
  isUploading = false,
  error,
  accept = "image/jpeg,image/png,image/webp",
  maxSize = 10 * 1024 * 1024, // 10MB
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  // Keep preview URL in sync with selected file (immediate preview before upload completes).
  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const validateFile = (file: File): string | null => {
    if (!accept.split(",").some((type) => file.type === type.trim())) {
      return "Invalid file type. Please upload JPEG, PNG, or WebP.";
    }
    if (file.size > maxSize) {
      return `File too large. Maximum size is ${formatFileSize(maxSize)}.`;
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      setLocalError(null);
      onChange(file);
    },
    [onChange, maxSize, accept]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    onChange(null);
    onClearValue?.();
    setLocalError(null);
  }, [onChange, onClearValue]);

  const displayError = error || localError;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {localPreviewUrl || value ? (
        <div className="relative rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-md bg-muted">
              <img
                src={localPreviewUrl ?? value!.url}
                alt={file?.name ?? value?.filename ?? "selected"}
                className="h-full w-full object-cover"
                width={80}
                height={80}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file?.name ?? value?.filename}</p>
              <p className="text-xs text-muted-foreground">
                {isUploading ? "Uploading..." : localPreviewUrl ? "Selected" : "Uploaded"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            isUploading && "pointer-events-none opacity-50"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isUploading}
          />

          <div className="flex flex-col items-center gap-2">
            {isUploading ? (
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="h-10 w-10 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">
                {isUploading ? "Uploading..." : "Drop image here or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG, or WebP up to {formatFileSize(maxSize)}
              </p>
            </div>
          </div>
        </div>
      )}

      {displayError && (
        <p className="text-sm text-destructive">{displayError}</p>
      )}
    </div>
  );
}
