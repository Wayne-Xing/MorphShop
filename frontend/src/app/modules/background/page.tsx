"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Image as ImageIcon, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { ImageUploader } from "@/components/workflow/ImageUploader";
import { TaskProgress } from "@/components/workflow/TaskProgress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useProject } from "@/hooks/useProjects";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { api, Task, Asset } from "@/lib/api";
import { dedupeAssets, getErrorMessage, triggerBrowserDownload } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/i18n";

function BackgroundContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const { toast } = useToast();
  const { t } = useI18n();

  const { project, isLoading: projectLoading, refresh: refreshProject } = useProject(
    projectId ? parseInt(projectId) : null
  );

  const { data: recentAssets } = useSWR(
    projectId ? ["assets-recent-7d"] : null,
    () =>
      api.getAssets({
        days: 7,
        asset_type: ["try_on_result", "background_result", "model_image", "background_image"],
        limit: 200,
      }),
    { revalidateOnFocus: false }
  );

  const uniqueAssets = useMemo(() => dedupeAssets(recentAssets ?? []), [recentAssets]);

  const assetById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const a of uniqueAssets) map.set(a.id, a);
    return map;
  }, [uniqueAssets]);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [selectedSourceAssetId, setSelectedSourceAssetId] = useState<number | null>(null);
  const [selectedBackgroundAssetId, setSelectedBackgroundAssetId] = useState<number | null>(null);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: taskStatus, isRunning } = useTaskPolling(
    currentTask?.id ?? null,
    {
      onSuccess: () => {
        toast({ title: t.task.taskCompleted });
        refreshProject();
        setCurrentTask(null);
      },
      onError: (err) => {
        toast({
          title: t.task.taskFailed,
          description: getErrorMessage(err),
          variant: "destructive",
        });
      },
    }
  );

  // Load existing tasks on mount
  useEffect(() => {
    if (project) {
      const loadTasks = async () => {
        try {
          const tasks = await api.getProjectTasks(project.id);
          const activeTask = tasks.find(
            (t) => (t.status === "running" || t.status === "queued" || t.status === "pending") && t.task_type === "background"
          );
          if (activeTask) {
            setCurrentTask(activeTask);
          }
        } catch (err) {
          console.error("Failed to load tasks:", err);
        }
      };
      loadTasks();
    }
  }, [project]);

  const handleStartBackground = async () => {
    if (!project) return;
    if (!project.enable_background) return;

    setIsSubmitting(true);
    try {
      // Resolve source image (fully decoupled):
      // 1) user-picked existing asset, 2) uploaded source file, 3) project try-on result, 4) project model image
      let sourceImageId: number | undefined = selectedSourceAssetId ?? undefined;
      if (!sourceImageId && sourceFile) {
        const srcAsset = await api.uploadImage(sourceFile, "model_image");
        sourceImageId = srcAsset.id;
      }
      sourceImageId = sourceImageId ?? project.try_on_result?.id ?? project.model_image?.id ?? undefined;
      if (!sourceImageId) {
        throw new Error(t.errors.assetNotFound);
      }

      let backgroundImageId: number | undefined;

      backgroundImageId = selectedBackgroundAssetId ?? undefined;
      if (!backgroundImageId && backgroundFile) {
        const bgAsset = await api.uploadImage(backgroundFile, "background_image");
        backgroundImageId = bgAsset.id;
      }

      const task = await api.createBackgroundTask({
        project_id: project.id,
        source_image_id: sourceImageId,
        background_image_id: backgroundImageId,
      });
      setCurrentTask(task);
      toast({ title: t.task.taskStarted });
    } catch (err) {
      toast({
        title: t.errors.taskFailed,
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t.errors.projectNotFound}</CardTitle>
            <CardDescription>{t.dashboard.createFirst}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")}>
              {t.header.dashboard}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (projectLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const sourceImage = project?.try_on_result || project?.model_image;
  const selectedSource = selectedSourceAssetId ? assetById.get(selectedSourceAssetId) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.workflow.backToDashboard}
          </Button>
          <div className="flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t.background.title}</h1>
              <p className="text-muted-foreground">{project?.name}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Source Image */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t.tryOn.result}
              </CardTitle>
              <CardDescription>{t.background.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {(selectedSource || sourceImage) ? (
                <div className="rounded-lg border p-4">
                  <img
                    src={(selectedSource ?? sourceImage)!.file_url}
                    alt={t.tryOn.result}
                    className="w-full max-h-80 object-contain rounded"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t.errors.assetNotFound}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Background Processing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t.background.title}
              </CardTitle>
              <CardDescription>{t.background.backgroundDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!project?.enable_background && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Background workflow is disabled for this project.
                </div>
              )}

              <div className="space-y-3">
                <Label>Source Image</Label>
                <Select
                  value={selectedSourceAssetId ? String(selectedSourceAssetId) : ""}
                  onValueChange={(v) => setSelectedSourceAssetId(v ? parseInt(v) : null)}
                  disabled={!project?.enable_background}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an existing image/result (last 7 days)" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueAssets
                      .filter((a) => a.mime_type.startsWith("image/"))
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {(a.display_name ?? a.original_filename) || `Asset ${a.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div className="text-xs text-muted-foreground">Or upload a new source image:</div>
                <ImageUploader
                  label="Upload Source"
                  description="Used as the main image to apply background changes."
                  file={sourceFile}
                  onChange={setSourceFile}
                  isUploading={isSubmitting}
                />
              </div>

              <div className="space-y-3">
                <Label>{t.background.backgroundImage}</Label>
                <Select
                  value={selectedBackgroundAssetId ? String(selectedBackgroundAssetId) : ""}
                  onValueChange={(v) => setSelectedBackgroundAssetId(v ? parseInt(v) : null)}
                  disabled={!project?.enable_background}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an existing background image (last 7 days)" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueAssets
                      .filter((a) => a.asset_type === "background_image" || a.asset_type === "BACKGROUND_IMAGE")
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {(a.display_name ?? a.original_filename) || `Asset ${a.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

              <ImageUploader
                label={t.background.backgroundImage}
                description={t.background.backgroundDescription}
                file={backgroundFile}
                onChange={setBackgroundFile}
              />
              </div>

              {/* Task Progress */}
              {currentTask && (
                <TaskProgress
                  status={taskStatus?.status ?? currentTask.status}
                  progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                  resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                  errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                  estimatedTime={taskStatus?.estimated_time}
                  taskType="background"
                />
              )}

              {/* Result Preview */}
              {project?.background_result && !currentTask && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-2">{t.background.result}</p>
                  <img
                    src={project.background_result.file_url}
                    alt={t.background.result}
                    className="w-full max-w-sm mx-auto object-contain rounded"
                  />
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const { blob, filename } = await api.downloadAsset(project.background_result!.id);
                          triggerBrowserDownload(
                            blob,
                            filename ?? project.background_result!.display_name ?? project.background_result!.original_filename
                          );
                        } catch (err) {
                          toast({
                            title: t.errors.networkError,
                            description: getErrorMessage(err),
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      {t.common.download}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/modules/video?project=${projectId}`)}
                    >
                      {t.common.next}: {t.video.title}
                    </Button>
                  </div>
                </div>
              )}

              {/* Start Button */}
              {!project?.background_result && !currentTask && (selectedSource || sourceImage || sourceFile) && (
                <Button
                  onClick={handleStartBackground}
                  disabled={isSubmitting || !project?.enable_background}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t.common.processing}
                    </>
                  ) : (
                    <>
                      <Layers className="h-4 w-4 mr-2" />
                      {t.background.changeBackground}
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function BackgroundPageInner() {
  return (
    <AuthProvider>
      <BackgroundContent />
    </AuthProvider>
  );
}

export default function BackgroundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <BackgroundPageInner />
    </Suspense>
  );
}
