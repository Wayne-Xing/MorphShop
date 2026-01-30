"use client";

import useSWR from "swr";
import { api, TaskStatus } from "@/lib/api";

const fetcher = async (taskId: number): Promise<TaskStatus> => {
  return api.getTaskStatus(taskId);
};

interface UseTaskPollingOptions {
  /** Enable polling when true */
  enabled?: boolean;
  /** Callback when task completes successfully */
  onSuccess?: (data: TaskStatus) => void;
  /** Callback when task fails */
  onError?: (error: Error) => void;
}

export function useTaskPolling(
  taskId: number | null,
  options: UseTaskPollingOptions = {}
) {
  const { enabled = true, onSuccess, onError } = options;

  const shouldPoll = enabled && taskId !== null;

  const { data, error, isLoading, mutate } = useSWR(
    shouldPoll ? ["task-status", taskId] : null,
    () => fetcher(taskId!),
    {
      // Poll every 2 seconds while task is running
      refreshInterval: (data) => {
        if (!data) return 2000;
        if (data.status === "running" || data.status === "queued") {
          return 2000;
        }
        return 0; // Stop polling when complete or failed
      },
      // Keep previous data while revalidating
      revalidateOnFocus: false,
      dedupingInterval: 1000,
      onSuccess: (data) => {
        if (data.status === "success" && onSuccess) {
          onSuccess(data);
        }
      },
      onError: (err) => {
        if (onError) {
          onError(err);
        }
      },
    }
  );

  const isRunning = data?.status === "running" || data?.status === "queued";
  const isComplete = data?.status === "success";
  const isFailed = data?.status === "failed";

  return {
    data,
    error,
    isLoading,
    isRunning,
    isComplete,
    isFailed,
    progress: data?.progress_percent ?? 0,
    resultUrl: data?.result_url,
    errorMessage: data?.error_message,
    estimatedTime: data?.estimated_time,
    refresh: mutate,
  };
}

export function useMultipleTaskPolling(taskIds: number[]) {
  return taskIds.map((id) => useTaskPolling(id));
}
