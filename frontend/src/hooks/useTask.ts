"use client";

import { useState, useCallback } from "react";
import { api, Task, TryOnTaskCreate, BackgroundTaskCreate, VideoTaskCreate } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";

interface UseTaskOptions {
  onSuccess?: (task: Task) => void;
  onError?: (error: string) => void;
}

export function useTask(options: UseTaskOptions = {}) {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTryOnTask = useCallback(
    async (data: TryOnTaskCreate) => {
      setIsLoading(true);
      setError(null);

      try {
        const newTask = await api.createTryOnTask(data);
        setTask(newTask);
        options.onSuccess?.(newTask);
        return newTask;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        options.onError?.(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const createBackgroundTask = useCallback(
    async (data: BackgroundTaskCreate) => {
      setIsLoading(true);
      setError(null);

      try {
        const newTask = await api.createBackgroundTask(data);
        setTask(newTask);
        options.onSuccess?.(newTask);
        return newTask;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        options.onError?.(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const createVideoTask = useCallback(
    async (data: VideoTaskCreate) => {
      setIsLoading(true);
      setError(null);

      try {
        const newTask = await api.createVideoTask(data);
        setTask(newTask);
        options.onSuccess?.(newTask);
        return newTask;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        options.onError?.(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setTask(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    task,
    isLoading,
    error,
    createTryOnTask,
    createBackgroundTask,
    createVideoTask,
    reset,
  };
}
