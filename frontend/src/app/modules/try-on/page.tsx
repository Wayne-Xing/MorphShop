"use client";

import { useState, useEffect, Suspense } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Upload, Wand2 } from "lucide-react";
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

function TryOnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const { toast } = useToast();
  const { t } = useI18n();

  const { project, isLoading: projectLoading, updateProject, refresh: refreshProject } = useProject(
    projectId ? parseInt(projectId) : null
  );

  const { data: recentInputs } = useSWR(
    projectId ? ["assets-recent-7d-tryon-inputs"] : null,
    () =>
      api.getAssets({
        days: 7,
        asset_type: ["model_image", "clothing_image"],
        limit: 200,
      }),
    { revalidateOnFocus: false }
  );

  const [modelFile, setModelFile] = useState<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: taskStatus, isRunning, isComplete } = useTaskPolling(
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
            (t) => (t.status === "running" || t.status === "queued" || t.status === "pending") && t.task_type === "try_on"
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

  const handleUploadImages = async () => {
    if (!projectId) return;

    setIsUploading(true);
    try {
      if (modelFile) {
        const modelAsset = await api.uploadImage(modelFile, "model_image");
        await updateProject({ model_image_id: modelAsset.id });
      }
      if (clothingFile) {
        const clothingAsset = await api.uploadImage(clothingFile, "clothing_image");
        await updateProject({ clothing_image_id: clothingAsset.id });
      }
      toast({ title: t.common.success });
    } catch (err) {
      toast({
        title: t.errors.uploadFailed,
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartTryOn = async () => {
    if (!project?.model_image || !project?.clothing_image) return;
    if (!project.enable_try_on) return;

    setIsSubmitting(true);
    try {
      const task = await api.createTryOnTask({
        project_id: project.id,
        model_image_id: project.model_image.id,
        clothing_image_id: project.clothing_image.id,
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
            <Wand2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t.tryOn.title}</h1>
              <p className="text-muted-foreground">{project?.name}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t.upload.title}
              </CardTitle>
              <CardDescription>{t.upload.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!project?.enable_try_on && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Try-on workflow is disabled for this project.
                </div>
              )}

              <div className="space-y-2">
                <Label>Use Existing Model Image</Label>
                <Select
                  value={project?.model_image ? String(project.model_image.id) : ""}
                  onValueChange={async (v) => {
                    if (!v) return;
                    try {
                      await updateProject({ model_image_id: parseInt(v) });
                      setModelFile(null);
                      toast({ title: t.common.success });
                    } catch (err) {
                      toast({
                        title: t.errors.uploadFailed,
                        description: getErrorMessage(err),
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={isUploading || !project?.enable_try_on}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an existing model image (last 7 days)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dedupeAssets(recentInputs ?? [])
                      .filter((a: Asset) => a.asset_type === "model_image" || a.asset_type === "MODEL_IMAGE")
                      .map((a: Asset) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {(a.display_name ?? a.original_filename) || `Asset ${a.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <ImageUploader
                label={t.upload.modelImage}
                description={t.upload.modelDescription}
                file={modelFile}
                value={project?.model_image ? {
                  id: project.model_image.id,
                  url: project.model_image.file_url,
                  filename: project.model_image.original_filename,
                } : null}
                onChange={setModelFile}
                onClearValue={() => {
                  if (!project) return;
                  void updateProject({ model_image_id: null })
                    .then(() => setModelFile(null))
                    .catch((err) => {
                      toast({
                        title: t.errors.uploadFailed,
                        description: getErrorMessage(err),
                        variant: "destructive",
                      });
                    });
                }}
                isUploading={isUploading}
              />

              <div className="space-y-2">
                <Label>Use Existing Clothing Image</Label>
                <Select
                  value={project?.clothing_image ? String(project.clothing_image.id) : ""}
                  onValueChange={async (v) => {
                    if (!v) return;
                    try {
                      await updateProject({ clothing_image_id: parseInt(v) });
                      setClothingFile(null);
                      toast({ title: t.common.success });
                    } catch (err) {
                      toast({
                        title: t.errors.uploadFailed,
                        description: getErrorMessage(err),
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={isUploading || !project?.enable_try_on}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an existing clothing image (last 7 days)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dedupeAssets(recentInputs ?? [])
                      .filter((a: Asset) => a.asset_type === "clothing_image" || a.asset_type === "CLOTHING_IMAGE")
                      .map((a: Asset) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {(a.display_name ?? a.original_filename) || `Asset ${a.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <ImageUploader
                label={t.upload.clothingImage}
                description={t.upload.clothingDescription}
                file={clothingFile}
                value={project?.clothing_image ? {
                  id: project.clothing_image.id,
                  url: project.clothing_image.file_url,
                  filename: project.clothing_image.original_filename,
                } : null}
                onChange={setClothingFile}
                onClearValue={() => {
                  if (!project) return;
                  void updateProject({ clothing_image_id: null })
                    .then(() => setClothingFile(null))
                    .catch((err) => {
                      toast({
                        title: t.errors.uploadFailed,
                        description: getErrorMessage(err),
                        variant: "destructive",
                      });
                    });
                }}
                isUploading={isUploading}
              />

              {(modelFile || clothingFile) && (
                <Button
                  onClick={handleUploadImages}
                  disabled={isUploading || !project?.enable_try_on}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t.common.processing}
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {t.common.upload}
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Processing Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                {t.tryOn.title}
              </CardTitle>
              <CardDescription>{t.tryOn.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preview Images */}
              <div className="grid gap-4 grid-cols-2">
                {project?.model_image && (
                  <div className="rounded-lg border p-2">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">{t.tryOn.model}</p>
                    <img
                      src={project.model_image.file_url}
                      alt={t.tryOn.model}
                      className="w-full h-32 object-contain rounded"
                    />
                  </div>
                )}
                {project?.clothing_image && (
                  <div className="rounded-lg border p-2">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">{t.tryOn.clothing}</p>
                    <img
                      src={project.clothing_image.file_url}
                      alt={t.tryOn.clothing}
                      className="w-full h-32 object-contain rounded"
                    />
                  </div>
                )}
              </div>

              {/* Task Progress */}
              {currentTask && (
                <TaskProgress
                  status={taskStatus?.status ?? currentTask.status}
                  progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                  resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                  errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                  estimatedTime={taskStatus?.estimated_time}
                  taskType="try_on"
                />
              )}

              {/* Result Preview */}
              {project?.try_on_result && !currentTask && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-2">{t.tryOn.result}</p>
                  <a
                    href={project.try_on_result.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={project.try_on_result.file_url}
                      alt={t.tryOn.result}
                      className="w-full max-w-sm max-h-80 mx-auto object-contain rounded"
                    />
                  </a>
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const { blob, filename } = await api.downloadAsset(project.try_on_result!.id);
                          triggerBrowserDownload(
                            blob,
                            filename ?? project.try_on_result!.display_name ?? project.try_on_result!.original_filename
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
                    <Button variant="secondary" size="sm" asChild>
                      <a
                        href={project.try_on_result.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看原图
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/modules/background?project=${projectId}`)}
                    >
                      {t.common.next}: {t.background.title}
                    </Button>
                  </div>
                </div>
              )}

              {/* Start Button */}
              {!project?.try_on_result && !currentTask && (
                <Button
                  onClick={handleStartTryOn}
                  disabled={isSubmitting || !project?.enable_try_on || !project?.model_image || !project?.clothing_image}
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
                      <Wand2 className="h-4 w-4 mr-2" />
                      {t.tryOn.startTryOn}
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

function TryOnPageInner() {
  return (
    <AuthProvider>
      <TryOnContent />
    </AuthProvider>
  );
}

export default function TryOnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <TryOnPageInner />
    </Suspense>
  );
}
