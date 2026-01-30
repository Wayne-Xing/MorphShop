"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
            className="h-44 w-full object-contain"
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
  const unique = dedupeAssets(assets);
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground mb-2">
        最近 7 天素材（点击选择）
      </div>
      <div className="grid grid-cols-4 gap-2">
        {unique.slice(0, 8).map((a) => (
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

  const latestByType = useMemo(() => {
    const m: Partial<Record<StepKey, Task>> = {};
    for (const t of tasks ?? []) {
      const k = t.task_type as StepKey;
      if (!m[k] || new Date(t.created_at) > new Date(m[k]!.created_at)) m[k] = t;
    }
    return m;
  }, [tasks]);

  const [modelFile, setModelFile] = useState<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const setUploadingFlag = useCallback((key: string, val: boolean) => {
    setUploading((prev) => ({ ...prev, [key]: val }));
  }, []);

  const uploadAndBind = useCallback(
    async (
      file: File,
      assetType: string,
      projectField: "model_image_id" | "clothing_image_id" | "background_image_id"
    ) => {
      if (!project) return;
      setUploadingFlag(projectField, true);
      try {
        const uploaded = await api.uploadImage(file, assetType);
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
    if (!modelFile) return;
    uploadAndBind(modelFile, "model_image", "model_image_id");
  }, [modelFile, uploadAndBind]);
  useEffect(() => {
    if (!clothingFile) return;
    uploadAndBind(clothingFile, "clothing_image", "clothing_image_id");
  }, [clothingFile, uploadAndBind]);
  useEffect(() => {
    if (!backgroundFile) return;
    uploadAndBind(backgroundFile, "background_image", "background_image_id");
  }, [backgroundFile, uploadAndBind]);

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

  const selectExisting = useCallback(
    async (
      assetId: number,
      projectField: "model_image_id" | "clothing_image_id" | "background_image_id"
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

  const setBackgroundPersonSourceMode = useCallback(
    async (mode: "try_on_result" | "model_image") => {
      if (!project) return;
      try {
        await updateProject({ background_person_source: mode } as any);
        await refreshProject();
      } catch (err) {
        toast({ title: "更新失败", description: getErrorMessage(err), variant: "destructive" });
      }
    },
    [project, refreshProject, toast, updateProject]
  );

  const backgroundPersonSourceMode = useMemo<"try_on_result" | "model_image">(() => {
    if (!project) return "try_on_result";
    const raw = project.background_person_source ?? (project.enable_try_on ? "try_on_result" : "model_image");
    return raw === "model_image" ? "model_image" : "try_on_result";
  }, [project]);

  const backgroundSource = useMemo<AssetBrief | null | undefined>(() => {
    if (!project) return null;
    if (!project.enable_try_on) return project.model_image;
    return backgroundPersonSourceMode === "model_image" ? project.model_image : project.try_on_result;
  }, [backgroundPersonSourceMode, project]);

  const videoSourceInfo = useMemo(() => {
    if (!project) {
      return { asset: null as AssetBrief | null, hint: "默认来自上游结果", emptyText: "暂无内容" };
    }

    const idx = enabledSteps.indexOf("video");
    const upstream = idx > 0 ? enabledSteps.slice(0, idx).reverse() : [];
    const preferred = upstream.find((s) => s === "background" || s === "try_on");

    if (preferred === "background") {
      return {
        asset: project.background_result,
        hint: locale === "zh" ? "默认来自换背景结果" : "Default: Background result",
        emptyText: locale === "zh" ? "等待换背景结果图生成…" : "Waiting for Background result…",
      };
    }
    if (preferred === "try_on") {
      return {
        asset: project.try_on_result,
        hint: locale === "zh" ? "默认来自换装结果" : "Default: Try-on result",
        emptyText: locale === "zh" ? "等待换装结果图生成…" : "Waiting for Try-on result…",
      };
    }

    return {
      asset: project.model_image,
      hint: locale === "zh" ? "来自人物图" : "From model image",
      emptyText: locale === "zh" ? "请先上传人物图" : "Please upload a model image first",
    };
  }, [enabledSteps, locale, project]);

  const validateBeforeRun = useCallback(
    (mode: "pipeline" | "single", step?: StepKey) => {
      if (!project) return "项目未加载";
      const s = step ?? startStepKey;
      if (!s) return "未启用任何工作流";

      if (s === "try_on") {
        if (!project.model_image) return "请先上传/选择人物图";
        if (!project.clothing_image) return "请先上传/选择服装图";
      }

      if (s === "background") {
        if (project.enable_try_on) {
          if (backgroundPersonSourceMode === "try_on_result") {
            if (!project.try_on_result) return "请先完成换装（当前设置：换背景使用换装结果图作为人物图）";
          } else {
            if (!project.model_image) return "请先上传/选择人物图（当前设置：换背景使用人物图作为人物图）";
          }
        } else {
          if (!project.model_image) return "请先上传/选择人物图";
        }
        if (!project.background_image) return "请先上传/选择背景图";
      }

      if (s === "video") return "Video 模块尚未接入";

      if (
        mode === "pipeline" &&
        s === "background" &&
        project.enable_try_on &&
        !project.try_on_result
      ) {
        return "从换背景开始执行需要已存在换装结果";
      }

      return null;
    },
    [backgroundPersonSourceMode, project, startStepKey]
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
      await api.startPipeline(project.id, { start_step: startStepKey ?? undefined, chain: true });
      toast({ title: "已开始执行工作流（顺序执行）" });
      refreshProject();
      refreshTasks();
    } catch (e) {
      toast({ title: "启动失败", description: getErrorMessage(e), variant: "destructive" });
    }
  }, [project, isBusy, refreshProject, refreshTasks, startStepKey, toast, validateBeforeRun]);

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
        await api.startPipeline(project.id, { start_step: step, chain: false });
        toast({ title: `已开始执行：${step}` });
        refreshProject();
        refreshTasks();
      } catch (e) {
        toast({ title: "启动失败", description: getErrorMessage(e), variant: "destructive" });
      }
    },
    [project, isBusy, refreshProject, refreshTasks, toast, validateBeforeRun]
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

  const stepLabel: Record<StepKey, string> = useMemo(() => {
    if (locale === "zh") {
      return {
        try_on: "换装",
        background: "换背景",
        video: "视频",
      };
    }
    return {
      try_on: "Try-on",
      background: "Background",
      video: "Video",
    };
  }, [locale]);

  const stepResult = useMemo<Record<StepKey, AssetBrief | null | undefined>>(
    () => ({
      try_on: project?.try_on_result,
      background: project?.background_result,
      video: project?.video_result,
    }),
    [project?.try_on_result, project?.background_result, project?.video_result]
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
              <Button onClick={() => router.push("/dashboard")}>返回 Dashboard</Button>
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

              const canRunStep = step !== "video";

              return (
                <section key={step} className="grid gap-4 lg:grid-cols-[420px_1fr]">
                  <Card className="h-fit">
                    <CardHeader>
                      <CardTitle className="text-base">{stepLabel[step]} · 输入</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {step === "try_on" ? (
                        <>
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
                          {project.enable_try_on ? (
                            <>
                              <div className="rounded-lg border bg-muted/20 p-3">
                                <div className="text-sm font-medium">人物图来源</div>
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={backgroundPersonSourceMode === "try_on_result" ? "default" : "outline"}
                                    disabled={isBusy}
                                    onClick={() => setBackgroundPersonSourceMode("try_on_result")}
                                  >
                                    使用换装结果
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={backgroundPersonSourceMode === "model_image" ? "default" : "outline"}
                                    disabled={isBusy}
                                    onClick={() => setBackgroundPersonSourceMode("model_image")}
                                  >
                                    使用 人物图
                                  </Button>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                  你可以选择用换装的输出图当人物图，或直接用原人物图进行换背景。
                                </div>
                              </div>

                              <AssetPreview
                                label="人物图"
                                hint={backgroundPersonSourceMode === "model_image" ? "来自人物图（与换装共用）" : "来自换装结果"}
                                asset={backgroundSource}
                                emptyText={
                                  backgroundPersonSourceMode === "model_image"
                                    ? "请先上传人物图（在换装模块）"
                                    : "等待换装结果图生成…"
                                }
                              />
                            </>
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
                          {project.enable_background || project.enable_try_on ? (
                            <AssetPreview
                              label="人物图"
                              hint={videoSourceInfo.hint}
                              asset={videoSourceInfo.asset}
                              emptyText={videoSourceInfo.emptyText}
                            />
                          ) : (
                            <div className="space-y-3">
                              <ImageUploader
                                label="人物图"
                                description="Video 必需（预留）"
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
                          <div className="rounded-lg border p-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="text-sm font-medium">参考视频</div>
                              <div className="text-xs text-muted-foreground">预留（后续接入）</div>
                            </div>
                            <div className="mt-3">
                              <Input type="file" disabled />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              将接入动作迁移 API：输出“与参考视频相同动作”的人物视频。
                            </div>
                          </div>

                          <div className="rounded-lg border p-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="text-sm font-medium">视频参数</div>
                              <div className="text-xs text-muted-foreground">预留（后续接入）</div>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>帧率 FPS</Label>
                                <Input disabled placeholder="例如：25" />
                              </div>
                              <div className="space-y-2">
                                <Label>视频时长（秒）</Label>
                                <Input disabled placeholder="例如：6" />
                              </div>
                              <div className="space-y-2">
                                <Label>开头跳过（秒）</Label>
                                <Input disabled placeholder="例如：0" />
                              </div>
                              <div className="space-y-2">
                                <Label>分辨率（宽 x 高）</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  <Input disabled placeholder="宽" />
                                  <Input disabled placeholder="高" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
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
                          disabled={!canRunStep}
                          title={canRunStep ? "仅执行当前一步，不自动执行后续" : "Video 模块尚未接入"}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          单独启动
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{isRunning ? "执行中…" : "进度"}</span>
                          <span>{Math.min(100, Math.max(0, progress))}%</span>
                        </div>
                        <Progress value={Math.min(100, Math.max(0, progress))} />
                      </div>

                      {result ? (
                        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                          <div className="overflow-hidden rounded-lg border bg-muted/30">
                            <img
                              src={result.file_url}
                              alt={result.display_name ?? result.original_filename}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="flex md:flex-col gap-2">
                            <Button variant="outline" onClick={() => downloadResult(result)}>
                              <Download className="h-4 w-4 mr-2" />
                              下载
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
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
