"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Video, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { ImageUploader } from "@/components/workflow/ImageUploader";
import { TaskProgress } from "@/components/workflow/TaskProgress";
import { useProject } from "@/hooks/useProjects";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { api, Task, Asset } from "@/lib/api";
import { dedupeAssets, getErrorMessage, triggerBrowserDownload } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/i18n";

function VideoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const { toast } = useToast();
  const { t } = useI18n();

  const { project, isLoading: projectLoading, refresh: refreshProject } = useProject(
    projectId ? parseInt(projectId) : null
  );

  const { data: recentAssets } = useSWR(
    projectId ? ["assets-recent-7d-video"] : null,
    () =>
      api.getAssets({
        days: 7,
        asset_type: ["background_result", "try_on_result", "model_image"],
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
  const [selectedSourceAssetId, setSelectedSourceAssetId] = useState<number | null>(null);
  const [motionType, setMotionType] = useState("default");
  const [duration, setDuration] = useState(3);
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
            (t) => (t.status === "running" || t.status === "queued" || t.status === "pending") && t.task_type === "video"
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

  const handleStartVideo = async () => {
    if (!project) return;

    if (!project.enable_video) return;

    let sourceImageId: number | undefined = selectedSourceAssetId ?? undefined;
    if (!sourceImageId && sourceFile) {
      const srcAsset = await api.uploadImage(sourceFile, "model_image");
      sourceImageId = srcAsset.id;
    }
    sourceImageId = sourceImageId ?? project.background_result?.id ?? project.try_on_result?.id ?? undefined;
    if (!sourceImageId) return;

    setIsSubmitting(true);
    try {
      const task = await api.createVideoTask({
        project_id: project.id,
        source_image_id: sourceImageId,
        motion_type: motionType,
        duration: duration,
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

  const selectedSource = selectedSourceAssetId ? assetById.get(selectedSourceAssetId) : null;
  const sourceImage = selectedSource || project?.background_result || project?.try_on_result;

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
            <Video className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t.video.title}</h1>
              <p className="text-muted-foreground">{project?.name}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Source Image */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Source Image
              </CardTitle>
              <CardDescription>{t.video.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceImage ? (
                <div className="rounded-lg border p-4">
                  <img
                    src={sourceImage.file_url}
                    alt="Source"
                    className="w-full max-h-80 object-contain rounded"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t.errors.assetNotFound}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Video Generation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                {t.video.title}
              </CardTitle>
              <CardDescription>{t.video.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!project?.enable_video && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Video workflow is disabled for this project.
                </div>
              )}

              <div className="space-y-3">
                <Label>Source Image</Label>
                <Select
                  value={selectedSourceAssetId ? String(selectedSourceAssetId) : ""}
                  onValueChange={(v) => setSelectedSourceAssetId(v ? parseInt(v) : null)}
                  disabled={!project?.enable_video}
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
                  description="Used as the first frame for video generation."
                  file={sourceFile}
                  onChange={setSourceFile}
                  isUploading={isSubmitting}
                />
              </div>

              {/* Video Settings */}
              {(sourceImage || sourceFile) && !project?.video_result && !currentTask && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t.video.motionType}</Label>
                    <Select value={motionType} onValueChange={setMotionType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="walk">Walk</SelectItem>
                        <SelectItem value="turn">Turn</SelectItem>
                        <SelectItem value="pose">Pose</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.video.duration}</Label>
                    <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3s</SelectItem>
                        <SelectItem value="5">5s</SelectItem>
                        <SelectItem value="8">8s</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Task Progress */}
              {currentTask && (
                <TaskProgress
                  status={taskStatus?.status ?? currentTask.status}
                  progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                  resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                  errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                  estimatedTime={taskStatus?.estimated_time}
                  taskType="video"
                />
              )}

              {/* Result Preview */}
              {project?.video_result && !currentTask && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-2">{t.video.generatedVideo}</p>
                  <video
                    src={project.video_result.file_url}
                    controls
                    className="w-full max-w-sm mx-auto rounded"
                  />
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const { blob, filename } = await api.downloadAsset(project.video_result!.id);
                          triggerBrowserDownload(
                            blob,
                            filename ?? project.video_result!.display_name ?? project.video_result!.original_filename
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
                      <Download className="h-4 w-4 mr-2" />
                      {t.common.download}
                    </Button>
                  </div>
                </div>
              )}

              {/* Start Button */}
              {!project?.video_result && !currentTask && (sourceImage || sourceFile) && (
                <Button
                  onClick={handleStartVideo}
                  disabled={isSubmitting || !project?.enable_video}
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
                      <Video className="h-4 w-4 mr-2" />
                      {t.video.generateVideo}
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

function VideoPageInner() {
  return (
    <AuthProvider>
      <VideoContent />
    </AuthProvider>
  );
}

export default function VideoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <VideoPageInner />
    </Suspense>
  );
}
