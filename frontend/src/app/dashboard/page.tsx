"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, FolderOpen, Wand2, Layers, Video, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { useProjects } from "@/hooks/useProjects";
import { getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function DashboardContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { projects, isLoading, error, createProject, deleteProject } = useProjects();
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [enableTryOn, setEnableTryOn] = useState(true);
  const [enableBackground, setEnableBackground] = useState(true);
  const [enableVideo, setEnableVideo] = useState(true);
  type StepKey = "try_on" | "background" | "video";
  const baseOrder: StepKey[] = ["try_on", "background", "video"];
  const [workflowOrder, setWorkflowOrder] = useState<StepKey[]>(baseOrder);
  const [dragging, setDragging] = useState<StepKey | null>(null);

  const enabledMap: Record<StepKey, boolean> = {
    try_on: enableTryOn,
    background: enableBackground,
    video: enableVideo,
  };
  const selectedOrder = workflowOrder.filter((s) => enabledMap[s]);

  const insertByDefaultOrder = (prev: StepKey[], step: StepKey): StepKey[] => {
    if (prev.includes(step)) return prev;
    const after = baseOrder.slice(baseOrder.indexOf(step) + 1);
    const idx = prev.findIndex((s) => after.includes(s));
    if (idx === -1) return [...prev, step];
    return [...prev.slice(0, idx), step, ...prev.slice(idx)];
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const project = await createProject(newProjectName.trim(), {
        enable_try_on: enableTryOn,
        enable_background: enableBackground,
        enable_video: enableVideo,
        workflow_steps: selectedOrder,
      });
      setNewProjectName("");
      router.push(`/workflow?project=${project.id}`);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (id: number, name: string) => {
    if (!confirm(`Delete project "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject(id);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    processing: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>
          <p className="text-muted-foreground mt-1">
            {t.dashboard.welcome}
          </p>
        </div>

        {/* Create New Project */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">{t.dashboard.newProject}</CardTitle>
            <CardDescription>
              {t.upload.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateProject} className="flex gap-4">
              <Input
                placeholder={t.dashboard.projectName}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={isCreating}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={
                  isCreating ||
                  !newProjectName.trim() ||
                  (!enableTryOn && !enableBackground && !enableVideo)
                }
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {t.dashboard.createProject}
                  </>
                )}
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableTryOn}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableTryOn(checked);
                    setWorkflowOrder((prev) =>
                      checked ? insertByDefaultOrder(prev, "try_on") : prev.filter((s) => s !== "try_on")
                    );
                  }}
                  disabled={isCreating}
                />
                {t.workflow.steps.tryOn}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableBackground}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableBackground(checked);
                    setWorkflowOrder((prev) =>
                      checked
                        ? insertByDefaultOrder(prev, "background")
                        : prev.filter((s) => s !== "background")
                    );
                  }}
                  disabled={isCreating}
                />
                {t.workflow.steps.background}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableVideo}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableVideo(checked);
                    setWorkflowOrder((prev) =>
                      checked ? insertByDefaultOrder(prev, "video") : prev.filter((s) => s !== "video")
                    );
                  }}
                  disabled={isCreating}
                />
                {t.workflow.steps.video}
              </label>
            </div>

            {selectedOrder.length >= 2 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <div className="text-sm font-medium">流程顺序</div>
                <div className="text-xs text-muted-foreground mt-1">
                  拖拽调整执行顺序（将影响“全部启动”的执行先后）。
                </div>
                <div className="mt-3 space-y-2">
                  {selectedOrder.map((step) => {
                    const label =
                      step === "try_on"
                        ? t.workflow.steps.tryOn
                        : step === "background"
                          ? t.workflow.steps.background
                          : t.workflow.steps.video;
                    return (
                      <div
                        key={step}
                        draggable={!isCreating}
                        onDragStart={() => setDragging(step)}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={() => {
                          if (!dragging || dragging === step) return;
                          setWorkflowOrder((prev) => {
                            const cur = prev.filter((s) => enabledMap[s]);
                            const from = cur.indexOf(dragging);
                            const to = cur.indexOf(step);
                            if (from === -1 || to === -1) return prev;
                            const next = cur.slice();
                            next.splice(from, 1);
                            next.splice(to, 0, dragging);
                            return next;
                          });
                          setDragging(null);
                        }}
                        className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span>{label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dragging === step ? "拖拽中…" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {createError && (
              <p className="text-sm text-destructive mt-2">{createError}</p>
            )}
          </CardContent>
        </Card>

        {/* Projects List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">{t.dashboard.recentProjects}</h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              {getErrorMessage(error) || t.errors.networkError}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-1">{t.dashboard.noProjects}</h3>
              <p className="text-sm text-muted-foreground">
                {t.dashboard.createFirst}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card key={project.id} className="group relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <CardDescription>
                          {new Date(project.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          statusColors[project.status]
                        }`}
                      >
                        {project.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Status badges */}
                    <div className="flex gap-2 flex-wrap text-xs">
                      {project.model_image && (
                        <span className="bg-muted px-2 py-0.5 rounded">{t.tryOn.model}</span>
                      )}
                      {project.clothing_image && (
                        <span className="bg-muted px-2 py-0.5 rounded">{t.tryOn.clothing}</span>
                      )}
                      {project.try_on_result && (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{t.tryOn.result}</span>
                      )}
                      {project.background_result && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{t.background.result}</span>
                      )}
                      {project.video_result && (
                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{t.video.generatedVideo}</span>
                      )}
                    </div>

                    {/* Module Quick Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/modules/try-on?project=${project.id}`)}
                        disabled={!project.enable_try_on}
                      >
                        <Wand2 className="h-3 w-3 mr-1" />
                        {t.workflow.steps.tryOn}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/modules/background?project=${project.id}`)}
                        disabled={!project.enable_background}
                      >
                        <Layers className="h-3 w-3 mr-1" />
                        {t.workflow.steps.background}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/modules/video?project=${project.id}`)}
                        disabled={!project.enable_video}
                      >
                        <Video className="h-3 w-3 mr-1" />
                        {t.workflow.steps.video}
                      </Button>
                    </div>

                    {/* Full Workflow Link */}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => router.push(`/workflow?project=${project.id}`)}
                    >
                      {t.workflow.title}
                    </Button>
                  </CardContent>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteProject(project.id, project.name);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
