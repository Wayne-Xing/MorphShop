"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { StepIndicator } from "@/components/workflow/StepIndicator";
import { ImageUploader } from "@/components/workflow/ImageUploader";
import { TaskProgress } from "@/components/workflow/TaskProgress";
import { useProject } from "@/hooks/useProjects";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { api, Task } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/i18n";

function WorkflowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const { toast } = useToast();
  const { t } = useI18n();

  const { project, isLoading: projectLoading, updateProject, refresh: refreshProject } = useProject(
    projectId ? parseInt(projectId) : null
  );

  const WORKFLOW_STEPS = [
    { id: 1, name: t.workflow.steps.upload, description: t.workflow.stepDescriptions.upload },
    { id: 2, name: t.workflow.steps.tryOn, description: t.workflow.stepDescriptions.tryOn },
    { id: 3, name: t.workflow.steps.background, description: t.workflow.stepDescriptions.background },
    { id: 4, name: t.workflow.steps.video, description: t.workflow.stepDescriptions.video },
  ];

  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // Upload states
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Task states
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Task polling
  const { data: taskStatus, isRunning, isComplete, isFailed } = useTaskPolling(
    currentTask?.id ?? null,
    {
      onSuccess: () => {
        toast({ title: t.task.taskCompleted });
        refreshProject();
        if (currentStep < 4) {
          setCompletedSteps((prev) => [...prev, currentStep]);
        }
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

  // Initialize completed steps and restore in-progress tasks
  useEffect(() => {
    if (project) {
      const completed: number[] = [];
      if (project.model_image && project.clothing_image) completed.push(1);
      if (project.try_on_result) completed.push(2);
      if (project.background_result) completed.push(3);
      if (project.video_result) completed.push(4);
      setCompletedSteps(completed);

      // Set current step based on progress
      if (project.video_result) setCurrentStep(4);
      else if (project.background_result) setCurrentStep(4);
      else if (project.try_on_result) setCurrentStep(3);
      else if (project.model_image && project.clothing_image) setCurrentStep(2);

      // Load and restore any in-progress tasks
      const loadTasks = async () => {
        try {
          const tasks = await api.getProjectTasks(project.id);
          // Find the most recent running/queued task
          const activeTask = tasks.find(
            (t) => t.status === "running" || t.status === "queued" || t.status === "pending"
          );
          if (activeTask) {
            setCurrentTask(activeTask);
            // Navigate to the correct step for this task
            if (activeTask.task_type === "try_on") setCurrentStep(2);
            else if (activeTask.task_type === "background") setCurrentStep(3);
            else if (activeTask.task_type === "video") setCurrentStep(4);
          }
        } catch (err) {
          console.error("Failed to load tasks:", err);
        }
      };
      loadTasks();
    }
  }, [project]);

  const handleUploadImages = async () => {
    if (!modelFile || !clothingFile || !projectId) return;

    setIsUploading(true);
    try {
      // Upload model image
      const modelAsset = await api.uploadImage(modelFile, "model_image");

      // Upload clothing image
      const clothingAsset = await api.uploadImage(clothingFile, "clothing_image");

      // Update project with image IDs
      await updateProject({
        model_image_id: modelAsset.id,
        clothing_image_id: clothingAsset.id,
      });

      setCompletedSteps((prev) => [...prev, 1]);
      setCurrentStep(2);
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

  const handleStartBackground = async () => {
    if (!project?.try_on_result) return;

    setIsSubmitting(true);
    try {
      let backgroundImageId: number | undefined;

      if (backgroundFile) {
        const bgAsset = await api.uploadImage(backgroundFile, "background_image");
        backgroundImageId = bgAsset.id;
      }

      const task = await api.createBackgroundTask({
        project_id: project.id,
        source_image_id: project.try_on_result.id,
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

  const handleStartVideo = async () => {
    if (!project?.background_result && !project?.try_on_result) return;

    setIsSubmitting(true);
    try {
      const sourceImageId = project.background_result?.id ?? project.try_on_result?.id;

      const task = await api.createVideoTask({
        project_id: project.id,
        source_image_id: sourceImageId!,
        motion_type: "default",
        duration: 3,
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
            <CardDescription>
              {t.dashboard.createFirst}
            </CardDescription>
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
        {/* Header */}
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
          <h1 className="text-3xl font-bold">{project?.name || t.workflow.title}</h1>
        </div>

        {/* Step Indicator */}
        <div className="mb-8 p-6 bg-card rounded-lg border">
          <StepIndicator
            steps={WORKFLOW_STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </div>

        {/* Workflow Content */}
        <Tabs value={`step-${currentStep}`} onValueChange={(v) => setCurrentStep(parseInt(v.split("-")[1]))}>
          <TabsList className="mb-6">
            {WORKFLOW_STEPS.map((step) => (
              <TabsTrigger
                key={step.id}
                value={`step-${step.id}`}
                disabled={step.id > 1 && !completedSteps.includes(step.id - 1)}
              >
                {step.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Step 1: Upload */}
          <TabsContent value="step-1">
            <Card>
              <CardHeader>
                <CardTitle>{t.upload.title}</CardTitle>
                <CardDescription>
                  {t.upload.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <ImageUploader
                    label={t.upload.modelImage}
                    description={t.upload.modelDescription}
                    value={project?.model_image ? {
                      id: project.model_image.id,
                      url: project.model_image.file_url,
                      filename: project.model_image.original_filename,
                    } : null}
                    onChange={setModelFile}
                    isUploading={isUploading}
                  />
                  <ImageUploader
                    label={t.upload.clothingImage}
                    description={t.upload.clothingDescription}
                    value={project?.clothing_image ? {
                      id: project.clothing_image.id,
                      url: project.clothing_image.file_url,
                      filename: project.clothing_image.original_filename,
                    } : null}
                    onChange={setClothingFile}
                    isUploading={isUploading}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleUploadImages}
                    disabled={(!modelFile && !project?.model_image) || (!clothingFile && !project?.clothing_image) || isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t.common.processing}
                      </>
                    ) : (
                      <>
                        {t.common.continue}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 2: Try-On */}
          <TabsContent value="step-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.tryOn.title}</CardTitle>
                <CardDescription>
                  {t.tryOn.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Preview uploaded images */}
                <div className="grid gap-4 md:grid-cols-2">
                  {project?.model_image && (
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium mb-2">{t.tryOn.model}</p>
                      <img
                        src={project.model_image.file_url}
                        alt={t.tryOn.model}
                        className="w-full h-48 object-contain rounded"
                      />
                    </div>
                  )}
                  {project?.clothing_image && (
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium mb-2">{t.tryOn.clothing}</p>
                      <img
                        src={project.clothing_image.file_url}
                        alt={t.tryOn.clothing}
                        className="w-full h-48 object-contain rounded"
                      />
                    </div>
                  )}
                </div>

                {/* Task Progress */}
                {currentTask && currentTask.task_type === "try_on" && (
                  <TaskProgress
                    status={taskStatus?.status ?? currentTask.status}
                    progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                    resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                    errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                    estimatedTime={taskStatus?.estimated_time}
                    taskType="try_on"
                  />
                )}

                {/* Result preview */}
                {project?.try_on_result && !currentTask && (
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium mb-2">{t.tryOn.result}</p>
                    <img
                      src={project.try_on_result.file_url}
                      alt={t.tryOn.result}
                      className="w-full max-w-md mx-auto object-contain rounded"
                    />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t.common.back}
                  </Button>
                  {project?.try_on_result ? (
                    <Button onClick={() => setCurrentStep(3)}>
                      {t.common.continue}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartTryOn}
                      disabled={isSubmitting || isRunning}
                    >
                      {isSubmitting || isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t.common.processing}
                        </>
                      ) : (
                        t.tryOn.startTryOn
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 3: Background */}
          <TabsContent value="step-3">
            <Card>
              <CardHeader>
                <CardTitle>{t.background.title}</CardTitle>
                <CardDescription>
                  {t.background.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ImageUploader
                  label={t.background.backgroundImage}
                  description={t.background.backgroundDescription}
                  onChange={setBackgroundFile}
                />

                {currentTask && currentTask.task_type === "background" && (
                  <TaskProgress
                    status={taskStatus?.status ?? currentTask.status}
                    progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                    resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                    errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                    estimatedTime={taskStatus?.estimated_time}
                    taskType="background"
                  />
                )}

                {project?.background_result && !currentTask && (
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium mb-2">{t.background.result}</p>
                    <img
                      src={project.background_result.file_url}
                      alt={t.background.result}
                      className="w-full max-w-md mx-auto object-contain rounded"
                    />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t.common.back}
                  </Button>
                  {project?.background_result ? (
                    <Button onClick={() => setCurrentStep(4)}>
                      {t.common.continue}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartBackground}
                      disabled={isSubmitting || isRunning || !project?.try_on_result}
                    >
                      {isSubmitting || isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t.common.processing}
                        </>
                      ) : (
                        t.background.changeBackground
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 4: Video */}
          <TabsContent value="step-4">
            <Card>
              <CardHeader>
                <CardTitle>{t.video.title}</CardTitle>
                <CardDescription>
                  {t.video.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentTask && currentTask.task_type === "video" && (
                  <TaskProgress
                    status={taskStatus?.status ?? currentTask.status}
                    progress={taskStatus?.progress_percent ?? currentTask.progress_percent}
                    resultUrl={taskStatus?.result_url ?? currentTask.result_url}
                    errorMessage={taskStatus?.error_message ?? currentTask.error_message}
                    estimatedTime={taskStatus?.estimated_time}
                    taskType="video"
                  />
                )}

                {project?.video_result && !currentTask && (
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium mb-2">{t.video.generatedVideo}</p>
                    <video
                      src={project.video_result.file_url}
                      controls
                      className="w-full max-w-md mx-auto rounded"
                    />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep(3)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t.common.back}
                  </Button>
                  {!project?.video_result && (
                    <Button
                      onClick={handleStartVideo}
                      disabled={isSubmitting || isRunning || (!project?.background_result && !project?.try_on_result)}
                    >
                      {isSubmitting || isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t.common.processing}
                        </>
                      ) : (
                        t.video.generateVideo
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function WorkflowPageInner() {
  return (
    <AuthProvider>
      <WorkflowContent />
    </AuthProvider>
  );
}

export default function WorkflowPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <WorkflowPageInner />
    </Suspense>
  );
}
