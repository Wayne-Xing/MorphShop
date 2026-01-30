"use client";

import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn, formatDuration } from "@/lib/utils";

interface TaskProgressProps {
  status: "pending" | "queued" | "running" | "success" | "failed";
  progress: number;
  resultUrl?: string | null;
  errorMessage?: string | null;
  estimatedTime?: number | null;
  taskType: "try_on" | "background" | "video";
}

const taskTypeLabels = {
  try_on: "Virtual Try-On",
  background: "Background Change",
  video: "Video Generation",
};

export function TaskProgress({
  status,
  progress,
  resultUrl,
  errorMessage,
  estimatedTime,
  taskType,
}: TaskProgressProps) {
  const label = taskTypeLabels[taskType];

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{label}</h3>
        <StatusBadge status={status} />
      </div>

      {(status === "running" || status === "queued") && (
        <>
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{progress}% complete</span>
            {estimatedTime && estimatedTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ~{formatDuration(estimatedTime)} remaining
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground animate-pulse-gentle">
            AI is processing your image...
          </p>
        </>
      )}

      {status === "success" && resultUrl && (
        <div className="space-y-3">
          <div className="relative aspect-square w-full max-w-md mx-auto overflow-hidden rounded-lg bg-muted">
            {taskType === "video" ? (
              <video
                src={resultUrl}
                controls
                className="h-full w-full object-contain"
              />
            ) : (
              <img
                src={resultUrl}
                alt="Result"
                className="h-full w-full object-contain"
                loading="lazy"
              />
            )}
          </div>
          <div className="flex justify-center">
            <a
              href={resultUrl}
              download
              className="text-sm text-primary hover:underline"
            >
              Download result
            </a>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-md bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Processing failed
              </p>
              {errorMessage && (
                <p className="text-sm text-muted-foreground mt-1">
                  {errorMessage}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Please try again or contact support if the issue persists.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
          <span>Waiting to start...</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "queued" | "running" | "success" | "failed";
}) {
  const config = {
    pending: {
      icon: Clock,
      label: "Pending",
      className: "text-muted-foreground bg-muted",
    },
    queued: {
      icon: Clock,
      label: "Queued",
      className: "text-yellow-600 bg-yellow-50",
    },
    running: {
      icon: Loader2,
      label: "Processing",
      className: "text-blue-600 bg-blue-50",
    },
    success: {
      icon: CheckCircle,
      label: "Complete",
      className: "text-green-600 bg-green-50",
    },
    failed: {
      icon: XCircle,
      label: "Failed",
      className: "text-destructive bg-destructive/10",
    },
  };

  const { icon: Icon, label, className } = config[status];
  const isSpinning = status === "running";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      <Icon className={cn("h-3 w-3", isSpinning && "animate-spin")} />
      {label}
    </span>
  );
}
