"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResultPreviewProps {
  title: string;
  imageUrl: string;
  isVideo?: boolean;
  onDownload?: () => void;
}

export function ResultPreview({
  title,
  imageUrl,
  isVideo = false,
  onDownload,
}: ResultPreviewProps) {
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }

    // Default download behavior
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = title.toLowerCase().replace(/\s+/g, "-");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="aspect-square relative bg-muted">
        {isVideo ? (
          <video
            src={imageUrl}
            controls
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
          />
        )}
      </div>

      <div className="p-4 flex items-center justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={imageUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ResultGalleryProps {
  results: Array<{
    id: string;
    title: string;
    imageUrl: string;
    isVideo?: boolean;
  }>;
}

export function ResultGallery({ results }: ResultGalleryProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No results yet. Complete the workflow to see your generated content.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((result) => (
        <ResultPreview
          key={result.id}
          title={result.title}
          imageUrl={result.imageUrl}
          isVideo={result.isVideo}
        />
      ))}
    </div>
  );
}
