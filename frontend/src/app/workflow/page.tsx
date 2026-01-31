"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Download,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from "lucide-react";

import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { ImageUploader } from "@/components/workflow/ImageUploader";
import { useProject } from "@/hooks/useProjects";
import { useI18n } from "@/lib/i18n";
import { api, Asset, AssetBrief, Project, Task } from "@/lib/api";
import { dedupeAssets, getErrorMessage, triggerBrowserDownload } from "@/lib/utils";

type StepKey = "try_on" | "background" | "video";
const BASE_STEP_ORDER: StepKey[] = ["try_on", "background", "video"];
const STEP_OUTPUT_TYPE: Record<StepKey, "image" | "video"> = {
  try_on: "image",
  background: "image",
  video: "video",
};
const STEP_PERSON_INPUT_TYPE: Record<StepKey, "image"> = {
  try_on: "image",
  background: "image",
  video: "image",
};

function AssetPreview({
  label,
  hint,
  asset,
  emptyText = "暂无内容",
}: {
  label: string;
  hint?: string;
  asset: AssetBrief | null | undefined;
  emptyText?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      {asset ? (
        <div className="overflow-hidden rounded-lg border bg-muted/30">
          <img
            src={asset.file_url}
            alt={asset.display_name ?? asset.original_filename}
            className="h-56 w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function RecentAssetPicker({
  assets,
  onPick,
}: {
  assets: Asset[] | undefined;
  onPick: (assetId: number) => void;
}) {
  if (!assets?.length) return null;
  const unique = dedupeAssets(assets).filter((a) => a.mime_type?.startsWith("image/"));
  const thumbs = unique.slice(0, 8);
  const placeholders = Math.max(0, 8 - thumbs.length);
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground mb-2">
        最近 7 天素材（点击选择）
      </div>
      <div className="grid grid-cols-4 grid-rows-2 gap-2">
        {thumbs.map((a) => (
          <button
            key={a.id}
            type="button"
            className="group relative aspect-square overflow-hidden rounded-md border hover:border-primary"
            onClick={() => onPick(a.id)}
            title={a.display_name ?? a.original_filename}
          >
            <img src={a.file_url} alt={a.original_filename} className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10" />
          </button>
        ))}
        {Array.from({ length: placeholders }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="aspect-square rounded-md border border-dashed bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}

function RecentVideoPicker({
  assets,
  onPick,
}: {
  assets: Asset[] | undefined;
  onPick: (assetId: number) => void;
}) {
  if (!assets?.length) return null;
  const unique = dedupeAssets(assets).filter((a) => a.mime_type?.startsWith("video/"));
  const thumbs = unique.slice(0, 8);
  const placeholders = Math.max(0, 8 - thumbs.length);
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground mb-2">
        最近 7 天素材（点击选择）
      </div>
      <div className="grid grid-cols-4 grid-rows-2 gap-2">
        {thumbs.map((a) => (
          <button
            key={a.id}
            type="button"
            className="group relative aspect-square overflow-hidden rounded-md border hover:border-primary"
            onClick={() => onPick(a.id)}
            title={a.display_name ?? a.original_filename}
          >
            <video
              src={a.file_url}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10" />
          </button>
        ))}
        {Array.from({ length: placeholders }).map((_, idx) => (
          <div
            key={`empty-video-${idx}`}
            className="aspect-square rounded-md border border-dashed bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { locale } = useI18n();

  const projectIdRaw = searchParams.get("project");
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;

  const { project, isLoading: projectLoading, updateProject, refresh: refreshProject } = useProject(projectId);

  const { data: tasks, mutate: refreshTasks } = useSWR<Task[]>(
    project?.id ? ["project-tasks", project.id] : null,
    () => api.getProjectTasks(project!.id),
    {
      refreshInterval: (latest) => {
        const hasActive = (latest ?? []).some((t) =>
          ["pending", "queued", "running"].includes(t.status)
        );
        return hasActive ? 2000 : 0;
      },
      revalidateOnFocus: false,
    }
  );

  const enabledSteps = useMemo(() => {
    const p = project;
    if (!p) return [] as StepKey[];
    const enabled: Record<StepKey, boolean> = {
      try_on: !!p.enable_try_on,
      background: !!p.enable_background,
      video: !!p.enable_video,
    };

    const configured = (p.workflow_steps ?? []).filter((s) =>
      ["try_on", "background", "video"].includes(s)
    ) as StepKey[];

    const order = configured.length ? configured : BASE_STEP_ORDER;
    const out: StepKey[] = [];
    const seen = new Set<StepKey>();
    for (const s of order) {
      if (enabled[s] && !seen.has(s)) {
        out.push(s);
        seen.add(s);
      }
    }
    // Ensure we never "lose" newly enabled steps if workflow_steps is stale.
    for (const s of BASE_STEP_ORDER) {
      if (enabled[s] && !seen.has(s)) {
        out.push(s);
        seen.add(s);
      }
    }
    return out;
  }, [project]);

  const startStepKey = useMemo(() => {
    return enabledSteps[0] ?? null;
  }, [enabledSteps]);

  const hasActiveTask = useMemo(() => {
    return (tasks ?? []).some((t) => ["pending", "queued", "running"].includes(t.status));
  }, [tasks]);

  const isBusy = useMemo(() => {
    if (!project) return false;
    // hasActiveTask covers RunningHub polling; pipeline_active covers the tiny gaps between steps.
    return hasActiveTask || !!project.pipeline_active;
  }, [hasActiveTask, project]);
  const prevBusyRef = useRef(false);
  const leftCardRefs = useRef<Record<StepKey, HTMLDivElement | null>>({
    try_on: null,
    background: null,
    video: null,
  });
  const rightCardRefs = useRef<Record<StepKey, HTMLDivElement | null>>({
    try_on: null,
    background: null,
    video: null,
  });
  const resizeObserversRef = useRef<Record<StepKey, ResizeObserver | null>>({
    try_on: null,
    background: null,
    video: null,
  });

  useEffect(() => {
    if (!project?.id || !isBusy) return;
    const id = setInterval(() => {
      refreshProject();
      refreshTasks();
    }, 2000);
    return () => clearInterval(id);
  }, [isBusy, project?.id, refreshProject, refreshTasks]);

  useEffect(() => {
    if (prevBusyRef.current && !isBusy) {
      refreshProject();
      refreshTasks();
    }
    prevBusyRef.current = isBusy;
  }, [isBusy, refreshProject, refreshTasks]);

  const syncCardHeight = useCallback((step: StepKey) => {
    const left = leftCardRefs.current[step];
    const right = rightCardRefs.current[step];
    if (!left || !right) return;
    const height = left.getBoundingClientRect().height;
    if (!height) return;
    right.style.height = `${height}px`;
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      enabledSteps.forEach((step) => syncCardHeight(step));
      return;
    }

    (Object.values(resizeObserversRef.current) ?? []).forEach((obs) => obs?.disconnect());
    resizeObserversRef.current = {
      try_on: null,
      background: null,
      video: null,
    };

    enabledSteps.forEach((step) => {
      const left = leftCardRefs.current[step];
      if (!left) return;
      const obs = new ResizeObserver(() => syncCardHeight(step));
      obs.observe(left);
      resizeObserversRef.current[step] = obs;
      syncCardHeight(step);
    });

    return () => {
      (Object.values(resizeObserversRef.current) ?? []).forEach((obs) => obs?.disconnect());
    };
  }, [enabledSteps, syncCardHeight]);

  const stepLabel: Record<StepKey, string> = useMemo(() => {
    if (locale === "zh") {
      return {
        try_on: "换装",
        background: "换背景",
        video: "视频-动作迁移",
      };
    }
    return {
      try_on: "Try-on",
      background: "Background",
      video: "Video Motion Transfer",
    };
  }, [locale]);

  const latestByType = useMemo(() => {
    const m: Partial<Record<StepKey, Task>> = {};
    for (const t of tasks ?? []) {
      const k = t.task_type as StepKey;
      if (!m[k] || new Date(t.created_at) > new Date(m[k]!.created_at)) m[k] = t;
    }
    return m;
  }, [tasks]);

  const stepResult = useMemo<Record<StepKey, AssetBrief | null | undefined>>(
    () => ({
      try_on: project?.try_on_result,
      background: project?.background_result,
      video: project?.video_result,
    }),
    [project?.try_on_result, project?.background_result, project?.video_result]
  );

  const [modelFile, setModelFile] = useState<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [videoSkipSeconds, setVideoSkipSeconds] = useState(0);
  const [videoDuration, setVideoDuration] = useState(10);
  const [videoFps, setVideoFps] = useState(30);
  const [videoWidth, setVideoWidth] = useState(720);
  const [videoHeight, setVideoHeight] = useState(1280);
  const lastUploadKeyRef = useRef<Record<string, string | undefined>>({});

  const getFileKey = useCallback((file: File) => {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }, []);

  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const setUploadingFlag = useCallback((key: string, val: boolean) => {
    setUploading((prev) => ({ ...prev, [key]: val }));
  }, []);

  const uploadAndBind = useCallback(
    async (
      file: File,
      assetType: string,
      projectField: "model_image_id" | "clothing_image_id" | "background_image_id" | "reference_video_id",
      kind: "image" | "video" = "image"
    ) => {
      if (!project) return;
      setUploadingFlag(projectField, true);
      try {
        const uploaded =
          kind === "video"
            ? await api.uploadVideo(file, assetType)
            : await api.uploadImage(file, assetType);
        await updateProject({ [projectField]: uploaded.id } as any);
        await refreshProject();
        toast({ title: "素材已更新" });
      } catch (err) {
        toast({ title: "上传失败", description: getErrorMessage(err), variant: "destructive" });
      } finally {
        setUploadingFlag(projectField, false);
      }
    },
    [project, refreshProject, setUploadingFlag, toast, updateProject]
  );

  // Auto-upload on file select, but keep local preview while uploading.
  useEffect(() => {
    if (!modelFile) {
      lastUploadKeyRef.current.model_image_id = undefined;
      return;
    }
    const key = getFileKey(modelFile);
    if (lastUploadKeyRef.current.model_image_id === key) return;
    lastUploadKeyRef.current.model_image_id = key;
    uploadAndBind(modelFile, "model_image", "model_image_id");
  }, [modelFile, uploadAndBind, getFileKey]);
  useEffect(() => {
    if (!clothingFile) {
      lastUploadKeyRef.current.clothing_image_id = undefined;
      return;
    }
    const key = getFileKey(clothingFile);
    if (lastUploadKeyRef.current.clothing_image_id === key) return;
    lastUploadKeyRef.current.clothing_image_id = key;
    uploadAndBind(clothingFile, "clothing_image", "clothing_image_id");
  }, [clothingFile, uploadAndBind, getFileKey]);
  useEffect(() => {
    if (!backgroundFile) {
      lastUploadKeyRef.current.background_image_id = undefined;
      return;
    }
    const key = getFileKey(backgroundFile);
    if (lastUploadKeyRef.current.background_image_id === key) return;
    lastUploadKeyRef.current.background_image_id = key;
    uploadAndBind(backgroundFile, "background_image", "background_image_id");
  }, [backgroundFile, uploadAndBind, getFileKey]);
  useEffect(() => {
    if (!referenceVideoFile) {
      lastUploadKeyRef.current.reference_video_id = undefined;
      return;
    }
    const key = getFileKey(referenceVideoFile);
    if (lastUploadKeyRef.current.reference_video_id === key) return;
    lastUploadKeyRef.current.reference_video_id = key;
    uploadAndBind(referenceVideoFile, "reference_video", "reference_video_id", "video");
  }, [referenceVideoFile, uploadAndBind, getFileKey]);

  useEffect(() => {
    if (!project) return;
    setVideoSkipSeconds(project.video_skip_seconds ?? 0);
    setVideoDuration(project.video_duration ?? 10);
    setVideoFps(project.video_fps ?? 30);
    setVideoWidth(project.video_width ?? 720);
    setVideoHeight(project.video_height ?? 1280);
  }, [
    project?.id,
    project?.video_skip_seconds,
    project?.video_duration,
    project?.video_fps,
    project?.video_width,
    project?.video_height,
  ]);

  const { data: recentModelAssets } = useSWR<Asset[]>(
    project ? ["assets", "model_image"] : null,
    () => api.getAssets({ days: 7, asset_type: ["model_image"] }),
    { revalidateOnFocus: false }
  );
  const { data: recentClothingAssets } = useSWR<Asset[]>(
    project ? ["assets", "clothing_image"] : null,
    () => api.getAssets({ days: 7, asset_type: ["clothing_image"] }),
    { revalidateOnFocus: false }
  );
  const { data: recentBackgroundAssets } = useSWR<Asset[]>(
    project ? ["assets", "background_image"] : null,
    () => api.getAssets({ days: 7, asset_type: ["background_image"] }),
    { revalidateOnFocus: false }
  );
  const { data: recentReferenceVideos } = useSWR<Asset[]>(
    project ? ["assets", "reference_video"] : null,
    () => api.getAssets({ days: 7, asset_type: ["reference_video"] }),
    { revalidateOnFocus: false }
  );

  const selectExisting = useCallback(
    async (
      assetId: number,
      projectField: "model_image_id" | "clothing_image_id" | "background_image_id" | "reference_video_id"
    ) => {
      try {
        await updateProject({ [projectField]: assetId } as any);
        await refreshProject();
      } catch (err) {
        toast({ title: "更新失败", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [refreshProject, toast, updateProject]
  );

  const clearProjectField = useCallback(
    async (projectField: "model_image_id" | "clothing_image_id" | "background_image_id" | "reference_video_id") => {
      try {
        await updateProject({ [projectField]: null } as any);
        await refreshProject();
      } catch (err) {
        toast({ title: "更新失败", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [refreshProject, toast, updateProject]
  );

  const persistVideoParams = useCallback(
    async (patch: Partial<{
      video_skip_seconds: number;
      video_duration: number;
      video_fps: number;
      video_width: number;
      video_height: number;
    }>) => {
      try {
        await updateProject(patch as any);
        await refreshProject();
      } catch (err) {
        toast({ title: "更新失败", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [refreshProject, toast, updateProject]
  );

  const upstreamProviderByStep = useMemo(() => {
    const out: Record<
      StepKey,
      { step: StepKey; asset: AssetBrief | null | undefined } | null
    > = {
      try_on: null,
      background: null,
      video: null,
    };
    enabledSteps.forEach((step, idx) => {
      const inputType = STEP_PERSON_INPUT_TYPE[step];
      if (!inputType) return;
      for (let i = idx - 1; i >= 0; i--) {
        const prev = enabledSteps[i];
        if (STEP_OUTPUT_TYPE[prev] !== inputType) continue;
        out[step] = { step: prev, asset: stepResult[prev] };
        break;
      }
    });
    return out;
  }, [enabledSteps, stepResult]);

  const getPersonSourceInfo = useCallback(
    (step: StepKey) => {
      const upstream = upstreamProviderByStep[step];
      if (upstream) {
        const upstreamLabel = stepLabel[upstream.step];
        return {
          hasUpstream: true,
          upstreamStep: upstream.step,
          asset: upstream.asset,
          hint:
            locale === "zh"
              ? `来自上游：${upstreamLabel} 输出`
              : `From upstream ${upstreamLabel} result`,
          emptyText:
            locale === "zh"
              ? `等待${upstreamLabel}结果生成`
              : `Waiting for ${upstreamLabel} result`,
        };
      }
      return {
        hasUpstream: false,
        upstreamStep: null as StepKey | null,
        asset: project?.model_image ?? null,
        hint: locale === "zh" ? "来自人物图" : "From model image",
        emptyText:
          locale === "zh"
            ? "请先上传人物图"
            : "Please upload a model image first",
      };
    },
    [locale, project?.model_image, stepLabel, upstreamProviderByStep]
  );

  const personSourceModeByStep = useMemo(() => {
    if (!project) return {} as Record<StepKey, "upstream" | "model_image">;
    const out = {} as Record<StepKey, "upstream" | "model_image">;
    enabledSteps.forEach((step) => {
      const hasUpstream = !!upstreamProviderByStep[step];
      if (!hasUpstream) {
        out[step] = "model_image";
        return;
      }
      if (step === "background") {
        const raw = project.background_person_source ?? "try_on_result";
        out[step] = raw === "model_image" ? "model_image" : "upstream";
        return;
      }
      if (step === "try_on") {
        out[step] = project.try_on_person_source === "model_image" ? "model_image" : "upstream";
        return;
      }
      out[step] = project.video_person_source === "model_image" ? "model_image" : "upstream";
    });
    return out;
  }, [enabledSteps, project, upstreamProviderByStep]);

  const setPersonSourceMode = useCallback(
    async (step: StepKey, mode: "upstream" | "model_image") => {
      if (!project) return;
      try {
        if (step === "background") {
          await updateProject({
            background_person_source: mode === "upstream" ? "try_on_result" : "model_image",
          } as any);
        } else if (step === "try_on") {
          await updateProject({ try_on_person_source: mode } as any);
        } else if (step === "video") {
          await updateProject({ video_person_source: mode } as any);
        }
        await refreshProject();
      } catch (err) {
        toast({ title: "更新失败", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [project, refreshProject, toast, updateProject]
  );

  const validateBeforeRun = useCallback(
    (mode: "pipeline" | "single", step?: StepKey) => {
      if (!project) return "项目未加载";
      const stepsToCheck =
        mode === "pipeline"
          ? enabledSteps
          : [step ?? startStepKey].filter(Boolean) as StepKey[];
      if (!stepsToCheck.length) return "未启用任何工作流";

      for (const s of stepsToCheck) {
        const upstream = upstreamProviderByStep[s];
        const hasUpstream = !!upstream;
        const upstreamReady = upstream?.asset;
        const sourceMode = personSourceModeByStep[s] ?? "model_image";

        if (sourceMode === "upstream") {
          if (!hasUpstream) return "当前步骤无可用上游来源";
          if (mode === "single" && !upstreamReady) {
            return `请先完成上游：${stepLabel[upstream!.step]}`;
          }
        } else {
          if (uploading.model_image_id) return "人物图正在上传，请稍后";
          if (!project.model_image) return "请先上传/选择人物图";
        }

        if (s === "try_on") {
          if (uploading.clothing_image_id) return "服装图正在上传，请稍后";
          if (!project.clothing_image) return "请先上传/选择服装图";
        }

        if (s === "background") {
          if (uploading.background_image_id) return "背景图正在上传，请稍后";
          if (!project.background_image) return "请先上传/选择背景图";
        }

        if (s === "video") {
          if (uploading.reference_video_id) return "参考视频正在上传，请稍等";
          if (!project.reference_video) return "请先上传/选择参考视频";
          if (videoDuration <= 0 || videoFps <= 0 || videoWidth <= 0 || videoHeight <= 0) {
            return "请修正视频参数";
          }
        }
      }

      return null;
    },
    [
      enabledSteps,
      project,
      startStepKey,
      stepLabel,
      upstreamProviderByStep,
      uploading,
      personSourceModeByStep,
      videoDuration,
      videoFps,
      videoWidth,
      videoHeight,
    ]
  );

  const runPipeline = useCallback(async () => {
    if (!project) return;
    if (isBusy) {
      toast({ title: "请等待当前任务完成" });
      return;
    }
    const err = validateBeforeRun("pipeline", startStepKey ?? undefined);
    if (err) {
      toast({ title: "无法执行", description: err, variant: "destructive" });
      return;
    }
    try {
      if (enabledSteps.includes("video")) {
        await updateProject({
          video_skip_seconds: videoSkipSeconds,
          video_duration: videoDuration,
          video_fps: videoFps,
          video_width: videoWidth,
          video_height: videoHeight,
        } as any);
      }
      await api.startPipeline(project.id, { start_step: startStepKey ?? undefined, chain: true });
      toast({ title: "已开始执行工作流（顺序执行）" });
      refreshProject();
      refreshTasks();
    } catch (e) {
      toast({ title: "启动失败", description: getErrorMessage(e), variant: "destructive" });
    }
  }, [project, isBusy, refreshProject, refreshTasks, startStepKey, toast, validateBeforeRun, enabledSteps, updateProject, videoSkipSeconds, videoDuration, videoFps, videoWidth, videoHeight]);

  const cancelPipeline = useCallback(async () => {
    if (!project) return;
    try {
      await api.cancelPipeline(project.id);
      toast({ title: "已请求停止：当前任务结束后不再继续下一步" });
      refreshProject();
    } catch (e) {
      toast({ title: "停止失败", description: getErrorMessage(e), variant: "destructive" });
    }
  }, [project, refreshProject, toast]);

  const runSingleStep = useCallback(
    async (step: StepKey) => {
      if (!project) return;
      if (isBusy) {
        toast({ title: "请等待当前任务完成" });
        return;
      }
      const err = validateBeforeRun("single", step);
      if (err) {
        toast({ title: "无法执行", description: err, variant: "destructive" });
        return;
      }
      try {
        if (step === "video") {
          await updateProject({
            video_skip_seconds: videoSkipSeconds,
            video_duration: videoDuration,
            video_fps: videoFps,
            video_width: videoWidth,
            video_height: videoHeight,
          } as any);
        }
        await api.startPipeline(project.id, { start_step: step, chain: false });
        toast({ title: `已开始执行：${step}` });
        refreshProject();
        refreshTasks();
      } catch (e) {
        toast({ title: "启动失败", description: getErrorMessage(e), variant: "destructive" });
      }
    },
    [project, isBusy, refreshProject, refreshTasks, toast, validateBeforeRun, updateProject, videoSkipSeconds, videoDuration, videoFps, videoWidth, videoHeight]
  );

  const downloadResult = useCallback(
    async (asset: AssetBrief) => {
      try {
        const { blob, filename } = await api.downloadAsset(asset.id);
        triggerBrowserDownload(blob, filename ?? asset.original_filename ?? "result");
      } catch (e) {
        toast({ title: "下载失败", description: getErrorMessage(e), variant: "destructive" });
      }
    },
    [toast]
  );

  const stepStatusText = (p: Project, step: StepKey): string => {
    if (p.pipeline_active && p.pipeline_current_step === step) return "执行中";
    const t = latestByType[step];
    if (t) return t.status;
    if (stepResult[step]) return "success";
    return "未执行";
  };

  const stepProgress01 = useCallback(
    (step: StepKey): number => {
      const res = stepResult[step];
      if (res) return 1;
      const t = latestByType[step];
      if (!t) return 0;
      if (["pending", "queued"].includes(t.status)) return 0;
      if (t.status === "running") return Math.min(1, Math.max(0, (t.progress_percent ?? 0) / 100));
      return 0;
    },
    [latestByType, stepResult]
  );

  const overallProgressPercent = useMemo(() => {
    const steps = enabledSteps;
    if (!steps.length) return 0;
    const sum = steps.reduce((acc, s) => acc + stepProgress01(s), 0);
    return Math.round((sum / steps.length) * 100);
  }, [enabledSteps, stepProgress01]);

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-10">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            加载中…
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-10">
          <Card>
            <CardHeader>
              <CardTitle>项目不存在或无权限</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push("/dashboard")}>返回 工作台</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <div>
              <div className="text-lg font-semibold">{project.name}</div>
              <div className="text-xs text-muted-foreground">
                工作流：{enabledSteps.map((s) => stepLabel[s]).join(" / ") || "未选择"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={runPipeline} disabled={!startStepKey}>
              <PlayCircle className="h-4 w-4 mr-2" />
              全部启动
            </Button>
            <Button
              variant="secondary"
              onClick={cancelPipeline}
              disabled={!project.pipeline_active || project.pipeline_cancel_requested}
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              {project.pipeline_cancel_requested ? "已请求停止" : "全部停止"}
            </Button>
          </div>
        </div>

        {isBusy && (
          <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground">
                {project.pipeline_active
                  ? `当前执行：${project.pipeline_current_step ? stepLabel[project.pipeline_current_step as StepKey] : "准备中…"}`
                  : "当前有任务执行中…"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refreshProject();
                  refreshTasks();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
            </div>
            {project.pipeline_cancel_requested ? (
              <div className="mt-2 text-xs text-muted-foreground">
                已请求停止：当前任务结束后将不会继续下一步。
              </div>
            ) : null}
          </div>
        )}

        {!!enabledSteps.length && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">流程进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{enabledSteps.map((s) => stepLabel[s]).join(" → ")}</span>
                <span>{overallProgressPercent}%</span>
              </div>
              <Progress value={overallProgressPercent} />
            </CardContent>
          </Card>
        )}

        {project.pipeline_last_error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {project.pipeline_last_error}
          </div>
        )}

        <div className="space-y-6">
          {enabledSteps.map((step) => {
              const task = latestByType[step];
              const status = stepStatusText(project, step);
              const progress = task?.progress_percent ?? (stepResult[step] ? 100 : 0);
              const result = stepResult[step];
              const isRunning = task && ["pending", "queued", "running"].includes(task.status);

              const canRunStep = true;
              const isVideoResult = step === "video";
              const personInfo = getPersonSourceInfo(step);
              const showUpstreamPerson = personInfo.hasUpstream;
              const personSourceMode = personSourceModeByStep[step] ?? "model_image";
              const useUpstreamSource = showUpstreamPerson && personSourceMode === "upstream";

              return (
                <section key={step} className="grid gap-4 lg:grid-cols-[420px_1fr] lg:items-stretch">
                  <Card
                    className="h-fit"
                    ref={(el) => {
                      leftCardRefs.current[step] = el;
                      if (el) syncCardHeight(step);
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="text-base">{stepLabel[step]} · 输入</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {step === "try_on" ? (
                        <>
                          {showUpstreamPerson ? (
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <div className="text-sm font-medium">人物图来源</div>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "upstream" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "upstream")}
                                >
                                  来自上游
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "model_image" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "model_image")}
                                >
                                  用户上传
                                </Button>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                请选择本步骤人物图的来源。
                              </div>
                            </div>
                          ) : null}

                          {useUpstreamSource ? (
                            <AssetPreview
                              label="人物图"
                              hint={personInfo.hint}
                              asset={personInfo.asset}
                              emptyText={personInfo.emptyText}
                            />
                          ) : (
                            <div className="space-y-3">
                              <ImageUploader
                                label="人物图"
                                description="上传后自动绑定到项目"
                                file={modelFile}
                                value={
                                  project.model_image
                                    ? {
                                        id: project.model_image.id,
                                        url: project.model_image.file_url,
                                        filename: project.model_image.original_filename,
                                      }
                                    : null
                                }
                                onChange={(f) => setModelFile(f)}
                                onClearValue={() => clearProjectField("model_image_id")}
                                isUploading={!!uploading.model_image_id}
                                accept="image/jpeg,image/png,image/webp"
                              />
                              <RecentAssetPicker
                                assets={recentModelAssets}
                                onPick={(id) => {
                                  setModelFile(null);
                                  selectExisting(id, "model_image_id");
                                }}
                              />
                            </div>
                          )}

                          <div className="space-y-3">
                            <ImageUploader
                              label="服装图"
                              description="换装必需"
                              file={clothingFile}
                              value={
                                project.clothing_image
                                  ? {
                                      id: project.clothing_image.id,
                                      url: project.clothing_image.file_url,
                                      filename: project.clothing_image.original_filename,
                                    }
                                  : null
                              }
                              onChange={(f) => setClothingFile(f)}
                              onClearValue={() => clearProjectField("clothing_image_id")}
                              isUploading={!!uploading.clothing_image_id}
                              accept="image/jpeg,image/png,image/webp"
                            />
                            <RecentAssetPicker
                              assets={recentClothingAssets}
                              onPick={(id) => {
                                setClothingFile(null);
                                selectExisting(id, "clothing_image_id");
                              }}
                            />
                          </div>
                        </>
                      ) : null}

                      {step === "background" ? (
                        <>
                          {showUpstreamPerson ? (
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <div className="text-sm font-medium">人物图来源</div>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "upstream" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "upstream")}
                                >
                                  来自上游
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "model_image" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "model_image")}
                                >
                                  用户上传
                                </Button>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                请选择本步骤人物图的来源。
                              </div>
                            </div>
                          ) : null}

                          {useUpstreamSource ? (
                            <AssetPreview
                              label="人物图"
                              hint={personInfo.hint}
                              asset={personInfo.asset}
                              emptyText={personInfo.emptyText}
                            />
                          ) : (
                            <div className="space-y-3">
                              <ImageUploader
                                label="人物图"
                                description="换背景必需"
                                file={modelFile}
                                value={
                                  project.model_image
                                    ? {
                                        id: project.model_image.id,
                                        url: project.model_image.file_url,
                                        filename: project.model_image.original_filename,
                                      }
                                    : null
                                }
                                onChange={(f) => setModelFile(f)}
                                onClearValue={() => clearProjectField("model_image_id")}
                                isUploading={!!uploading.model_image_id}
                                accept="image/jpeg,image/png,image/webp"
                              />
                              <RecentAssetPicker
                                assets={recentModelAssets}
                                onPick={(id) => {
                                  setModelFile(null);
                                  selectExisting(id, "model_image_id");
                                }}
                              />
                            </div>
                          )}

                          <div className="space-y-3">
                            <ImageUploader
                              label="背景图"
                              description="换背景必需（当前不使用 prompt）"
                              file={backgroundFile}
                              value={
                                project.background_image
                                  ? {
                                      id: project.background_image.id,
                                      url: project.background_image.file_url,
                                      filename: project.background_image.original_filename,
                                    }
                                  : null
                              }
                              onChange={(f) => setBackgroundFile(f)}
                              onClearValue={() => clearProjectField("background_image_id")}
                              isUploading={!!uploading.background_image_id}
                              accept="image/jpeg,image/png,image/webp"
                            />
                            <RecentAssetPicker
                              assets={recentBackgroundAssets}
                              onPick={(id) => {
                                setBackgroundFile(null);
                                selectExisting(id, "background_image_id");
                              }}
                            />
                          </div>
                        </>
                      ) : null}

                      {step === "video" ? (
                        <>
                          {showUpstreamPerson ? (
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <div className="text-sm font-medium">人物图来源</div>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "upstream" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "upstream")}
                                >
                                  来自上游
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={personSourceMode === "model_image" ? "default" : "outline"}
                                  disabled={isBusy}
                                  onClick={() => setPersonSourceMode(step, "model_image")}
                                >
                                  用户上传
                                </Button>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                请选择本步骤人物图的来源。
                              </div>
                            </div>
                          ) : null}

                          {useUpstreamSource ? (
                            <AssetPreview
                              label="人物图"
                              hint={personInfo.hint}
                              asset={personInfo.asset}
                              emptyText={personInfo.emptyText}
                            />
                          ) : (
                            <div className="space-y-3">
                              <ImageUploader
                                label="人物图"
                                description="用于动作迁移的人物图"
                                file={modelFile}
                                value={
                                  project.model_image
                                    ? {
                                        id: project.model_image.id,
                                        url: project.model_image.file_url,
                                        filename: project.model_image.original_filename,
                                      }
                                    : null
                                }
                                onChange={(f) => setModelFile(f)}
                                onClearValue={() => clearProjectField("model_image_id")}
                                isUploading={!!uploading.model_image_id}
                                accept="image/jpeg,image/png,image/webp"
                              />
                              <RecentAssetPicker
                                assets={recentModelAssets}
                                onPick={(id) => {
                                  setModelFile(null);
                                  selectExisting(id, "model_image_id");
                                }}
                              />
                            </div>
                          )}
                                                    <div className="space-y-3">
                            <ImageUploader
                              label="参考视频"
                              description="动作迁移必需"
                              file={referenceVideoFile}
                              value={
                                project.reference_video
                                  ? {
                                      id: project.reference_video.id,
                                      url: project.reference_video.file_url,
                                      filename: project.reference_video.original_filename,
                                    }
                                  : null
                              }
                              onChange={(f) => setReferenceVideoFile(f)}
                              onClearValue={() => clearProjectField("reference_video_id")}
                              isUploading={!!uploading.reference_video_id}
                              accept="video/mp4"
                              maxSize={200 * 1024 * 1024}
                              previewType="video"
                            />
                            <RecentVideoPicker
                              assets={recentReferenceVideos}
                              onPick={(id) => {
                                setReferenceVideoFile(null);
                                selectExisting(id, "reference_video_id");
                              }}
                            />
                          </div>

                          <div className="rounded-lg border p-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="text-sm font-medium">视频参数</div>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>跳过秒数</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={videoSkipSeconds}
                                  onChange={(e) => setVideoSkipSeconds(parseInt(e.target.value || "0"))}
                                  onBlur={() => persistVideoParams({ video_skip_seconds: videoSkipSeconds })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>视频时长（秒）</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={videoDuration}
                                  onChange={(e) => setVideoDuration(parseInt(e.target.value || "0"))}
                                  onBlur={() => persistVideoParams({ video_duration: videoDuration })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>帧率 FPS</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={videoFps}
                                  onChange={(e) => setVideoFps(parseInt(e.target.value || "0"))}
                                  onBlur={() => persistVideoParams({ video_fps: videoFps })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>分辨率（宽 x 高）</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={videoWidth}
                                    onChange={(e) => setVideoWidth(parseInt(e.target.value || "0"))}
                                    onBlur={() => persistVideoParams({ video_width: videoWidth })}
                                  />
                                  <Input
                                    type="number"
                                    min={1}
                                    value={videoHeight}
                                    onChange={(e) => setVideoHeight(parseInt(e.target.value || "0"))}
                                    onBlur={() => persistVideoParams({ video_height: videoHeight })}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card
                    className="flex flex-col h-full"
                    ref={(el) => {
                      rightCardRefs.current[step] = el;
                      if (el) syncCardHeight(step);
                    }}
                  >
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{stepLabel[step]} · 输出</CardTitle>
                        <div className="text-xs text-muted-foreground mt-1">
                          状态：{status}
                          {task?.error_message ? ` · ${task.error_message}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => runSingleStep(step)}
                          disabled={!canRunStep || isBusy}
                          title="仅执行当前一步，不自动执行后续"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          单独启动
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
                      <div className="space-y-2 shrink-0">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{isRunning ? "执行中…" : "进度"}</span>
                          <span>{Math.min(100, Math.max(0, progress))}%</span>
                        </div>
                        <Progress value={Math.min(100, Math.max(0, progress))} />
                      </div>

                      {result ? (
                        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch min-h-0">
                          <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
                            {isVideoResult ? (
                              <video
                                src={result.file_url}
                                controls
                                className="h-full w-auto max-w-full max-h-full object-contain"
                              />
                            ) : (
                              <a
                                href={result.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block h-full w-full"
                              >
                                <img
                                  src={result.file_url}
                                  alt={result.display_name ?? result.original_filename}
                                  className="h-full w-auto max-w-full max-h-full object-contain mx-auto"
                                />
                              </a>
                            )}
                          </div>
                          <div className="flex md:flex-col gap-2">
                            <Button variant="outline" onClick={() => downloadResult(result)}>
                              <Download className="h-4 w-4 mr-2" />
                              下载
                            </Button>
                            <Button variant="secondary" asChild>
                              <a
                                href={result.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {isVideoResult ? "查看原视频" : "查看原图"}
                              </a>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-h-0 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          暂无结果
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              );
            })}
        </div>
      </main>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <AuthProvider>
      <Suspense>
        <WorkflowPageInner />
      </Suspense>
    </AuthProvider>
  );
}
