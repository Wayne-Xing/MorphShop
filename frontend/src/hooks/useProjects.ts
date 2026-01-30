"use client";

import useSWR from "swr";
import { api, ProjectList, Project } from "@/lib/api";

const projectsFetcher = async (page: number, pageSize: number): Promise<ProjectList> => {
  return api.getProjects(page, pageSize);
};

const projectFetcher = async (id: number): Promise<Project> => {
  return api.getProject(id);
};

export function useProjects(page = 1, pageSize = 20) {
  const { data, error, isLoading, mutate } = useSWR(
    ["projects", page, pageSize],
    () => projectsFetcher(page, pageSize),
    {
      revalidateOnFocus: false,
    }
  );

  const createProject = async (
    name: string,
    workflows: { enable_try_on: boolean; enable_background: boolean; enable_video: boolean; workflow_steps?: Array<"try_on" | "background" | "video"> } = {
      enable_try_on: true,
      enable_background: true,
      enable_video: true,
    }
  ) => {
    const project = await api.createProjectWithWorkflows({ name, ...workflows });
    mutate();
    return project;
  };

  const deleteProject = async (id: number) => {
    await api.deleteProject(id);
    mutate();
  };

  return {
    projects: data?.projects ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.page_size ?? pageSize,
    error,
    isLoading,
    createProject,
    deleteProject,
    refresh: mutate,
  };
}

export function useProject(id: number | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ["project", id] : null,
    () => projectFetcher(id!),
    {
      revalidateOnFocus: false,
    }
  );

  const updateProject = async (
    updates: Partial<{
      name: string;
      enable_try_on: boolean;
      enable_background: boolean;
      enable_video: boolean;
      workflow_steps: Array<"try_on" | "background" | "video">;
      background_person_source: "try_on_result" | "model_image";
      model_image_id: number;
      clothing_image_id: number;
      background_image_id: number;
      reference_video_id: number;
    }>
  ) => {
    if (!id) return;
    const updated = await api.updateProject(id, updates);
    mutate(updated);
    return updated;
  };

  return {
    project: data,
    error,
    isLoading,
    updateProject,
    refresh: mutate,
  };
}
