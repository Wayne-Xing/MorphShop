"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Video, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { ImageUploader } from "@/components/workflow/ImageUploader";
import { TaskProgress } from "@/components/workflow/TaskProgress";
import { Modal } from "@/components/ui/modal";
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
  const { t, locale } = useI18n();
  const isZh = locale === "zh";
  const uiText = {
    personImage: isZh ? "人物图" : "Person Image",
    personImageDesc: isZh ? "用于动作迁移的人物图" : "Used as the person image for motion transfer.",
    pickPersonImage: isZh ? "选择已有图片/结果（最近 7 天）" : "Pick an existing image/result (last 7 days)",
    orUploadPersonImage: isZh ? "或上传新的人物图：" : "Or upload a new person image:",
    uploadPerson: isZh ? "上传人物图" : "Upload Person",
    referenceVideo: isZh ? "参考视频" : "Reference Video",
    pickReferenceVideo: isZh ? "选择参考视频（最近 7 天）" : "Pick a reference video (last 7 days)",
    orUploadReferenceVideo: isZh ? "或上传新的参考视频：" : "Or upload a new reference video:",
    uploadReferenceVideo: isZh ? "上传参考视频" : "Upload Reference Video",
    referenceVideoDesc: isZh ? "动作迁移必需" : "Used as the motion reference.",
    videoDisabled: isZh ? "该项目未启用视频-动作迁移。" : "Video motion transfer is disabled for this project.",
    skipSeconds: isZh ? "跳过秒数" : "Skip Seconds",
    duration: isZh ? "视频时长（秒）" : "Duration (s)",
    fps: isZh ? "帧率 FPS" : "FPS",
    width: isZh ? "宽度" : "Width",
    height: isZh ? "高度" : "Height",
    assetFallback: isZh ? "素材" : "Asset",
  };

  const { project, isLoading: projectLoading, refresh: refreshProject, updateProject } = useProject(
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

  const { data: recentVideos } = useSWR(
    projectId ? ["assets-recent-7d-reference-video"] : null,
    () =>
      api.getAssets({
        days: 7,
        asset_type: ["reference_video"],
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

  const [personFile, setPersonFile] = useState<File | null>(null);
  const [selectedPersonAssetId, setSelectedPersonAssetId] = useState<number | null>(null);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [selectedReferenceVideoId, setSelectedReferenceVideoId] = useState<number | null>(null);
  const [skipSeconds, setSkipSeconds] = useState(0);
  const [duration, setDuration] = useState(10);
  const [fps, setFps] = useState(30);
  const [width, setWidth] = useState(720);
  const [height, setHeight] = useState(1280);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSourcePreviewOpen, setIsSourcePreviewOpen] = useState(false);

  useEffect(() => {
    if (!project) return;
    setSkipSeconds(project.video_skip_seconds ?? 0);
    setDuration(project.video_duration ?? 10);
    setFps(project.video_fps ?? 30);
    setWidth(project.video_width ?? 720);
    setHeight(project.video_height ?? 1280);
    setSelectedReferenceVideoId(project.reference_video?.id ?? null);
  }, [project]);

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

    let personImageId: number | undefined = selectedPersonAssetId ?? undefined;
    if (!personImageId && personFile) {
      const srcAsset = await api.uploadImage(personFile, "model_image");
      personImageId = srcAsset.id;
    }
    personImageId =
      personImageId ??
      project.background_result?.id ??
      project.try_on_result?.id ??
      project.model_image?.id ??
      undefined;
    if (!personImageId) return;

    let referenceVideoId: number | undefined = selectedReferenceVideoId ?? undefined;
    if (!referenceVideoId && referenceVideoFile) {
      const vidAsset = await api.uploadVideo(referenceVideoFile, "reference_video");
      referenceVideoId = vidAsset.id;
      await updateProject({ reference_video_id: vidAsset.id } as any);
    }
    referenceVideoId = referenceVideoId ?? project.reference_video?.id ?? undefined;
    if (!referenceVideoId) return;

    await updateProject({
      video_skip_seconds: skipSeconds,
      video_duration: duration,
      video_fps: fps,
      video_width: width,
      video_height: height,
    } as any);

    setIsSubmitting(true);
    try {
      const task = await api.createVideoTask({
        project_id: project.id,
        person_image_id: personImageId,
        reference_video_id: referenceVideoId,
        skip_seconds: skipSeconds,
        duration: duration,
        fps,
        width,
        height,
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

  const selectedSource = selectedPersonAssetId ? assetById.get(selectedPersonAssetId) : null;
  const sourceImage =
    selectedSource || project?.background_result || project?.try_on_result || project?.model_image;
  // Reference video selection handled via project/reference video state.

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
          {/* Person Image */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                {uiText.personImage}
              </CardTitle>
              <CardDescription>{t.video.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceImage ? (
                <div className="rounded-lg border p-4">
                  <img
                    src={sourceImage.file_url}
                    alt={uiText.personImage}
                    className="w-full max-h-80 object-contain rounded"
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsSourcePreviewOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setIsSourcePreviewOpen(true);
                    }}
                  />
                  <Modal
                    open={isSourcePreviewOpen}
                    onOpenChange={setIsSourcePreviewOpen}
                    title={(sourceImage.display_name ?? sourceImage.original_filename) || uiText.personImage}
                  >
                    <img
                      src={sourceImage.file_url}
                      alt={uiText.personImage}
                      className="w-full max-h-[75vh] object-contain rounded"
                    />
                  </Modal>
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
                  {uiText.videoDisabled}
                </div>
              )}

              <div className="space-y-3">
                <Label>{uiText.personImage}</Label>
                <Select
                  value={selectedPersonAssetId ? String(selectedPersonAssetId) : ""}
                  onValueChange={(v) => setSelectedPersonAssetId(v ? parseInt(v) : null)}
                  disabled={!project?.enable_video}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={uiText.pickPersonImage} />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueAssets
                      .filter((a) => a.mime_type.startsWith("image/"))
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {(a.display_name ?? a.original_filename) || `${uiText.assetFallback} ${a.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div className="text-xs text-muted-foreground">{uiText.orUploadPersonImage}</div>
                <ImageUploader
                  label={uiText.uploadPerson}
                  description={uiText.personImageDesc}
                  file={personFile}
                  onChange={setPersonFile}
                  isUploading={isSubmitting}
                />
              </div>

              {/* Reference Video */}
              <div className="space-y-3">
                <Label>{uiText.referenceVideo}</Label>
                <Select
                  value={selectedReferenceVideoId ? String(selectedReferenceVideoId) : ""}
                  onValueChange={async (v) => {
                    const id = v ? parseInt(v) : null;
                    setSelectedReferenceVideoId(id);
                    if (id) {
                      await updateProject({ reference_video_id: id } as any);
                    }
                  }}
                  disabled={!project?.enable_video}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={uiText.pickReferenceVideo} />
                  </SelectTrigger>
                  <SelectContent>
                    {(recentVideos ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {(a.display_name ?? a.original_filename) || `${uiText.assetFallback} ${a.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">{uiText.orUploadReferenceVideo}</div>
                <ImageUploader
                  label={uiText.uploadReferenceVideo}
                  description={uiText.referenceVideoDesc}
                  file={referenceVideoFile}
                  value={
                    project?.reference_video
                      ? {
                          id: project.reference_video.id,
                          url: project.reference_video.file_url,
                          filename: project.reference_video.original_filename,
                        }
                      : null
                  }
                  onChange={setReferenceVideoFile}
                  onClearValue={async () => {
                    await updateProject({ reference_video_id: null } as any);
                  }}
                  isUploading={isSubmitting}
                  accept="video/mp4"
                  maxSize={200 * 1024 * 1024}
                  previewType="video"
                />
              </div>

              {/* Video Settings */}
              {(sourceImage || personFile) && !project?.video_result && !currentTask && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{uiText.skipSeconds}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={skipSeconds}
                        onChange={(e) => setSkipSeconds(parseInt(e.target.value || "0"))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{uiText.duration}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value || "0"))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{uiText.fps}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={fps}
                        onChange={(e) => setFps(parseInt(e.target.value || "0"))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{uiText.width}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={width}
                        onChange={(e) => setWidth(parseInt(e.target.value || "0"))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{uiText.height}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={height}
                        onChange={(e) => setHeight(parseInt(e.target.value || "0"))}
                      />
                    </div>
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
                    className="w-full max-w-sm max-h-80 mx-auto object-contain rounded"
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
                    <Button variant="secondary" size="sm" asChild>
                      <a
                        href={project.video_result.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {isZh ? "查看原视频" : "View original"}
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              {/* Start Button */}
              {!project?.video_result && !currentTask && (sourceImage || personFile) && (
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
