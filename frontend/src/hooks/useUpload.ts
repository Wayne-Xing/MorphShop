"use client";

import { useState, useCallback } from "react";
import { api, AssetUpload } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";

interface UseUploadOptions {
  onSuccess?: (asset: AssetUpload) => void;
  onError?: (error: string) => void;
}

export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetUpload | null>(null);

  const upload = useCallback(
    async (file: File, assetType: string) => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        // Simulate progress (actual progress tracking requires XMLHttpRequest)
        setProgress(30);

        const uploadedAsset = await api.uploadImage(file, assetType);

        setProgress(100);
        setAsset(uploadedAsset);
        options.onSuccess?.(uploadedAsset);

        return uploadedAsset;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        options.onError?.(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setAsset(null);
  }, []);

  return {
    upload,
    isUploading,
    progress,
    error,
    asset,
    reset,
  };
}
