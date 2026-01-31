/**
 * API client for backend communication.
 */

const API_BASE = "/api";

interface ApiError {
  detail: string;
}

class ApiClient {
  private accessToken: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.accessToken = localStorage.getItem("access_token");
    }
  }

  private getToken(): string | null {
    // In Next.js App Router, modules can be evaluated during SSR. Always re-check
    // localStorage on the client so auth doesn't "disappear" between navigations.
    if (typeof window === "undefined") return this.accessToken;
    const stored = localStorage.getItem("access_token");
    if (stored && stored !== this.accessToken) this.accessToken = stored;
    return this.accessToken;
  }

  setToken(token: string) {
    this.accessToken = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
    }
  }

  clearToken() {
    this.accessToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Prefer JSON error payload, but don't assume the response is JSON.
      const error: ApiError = await response.json().catch(() => ({
        detail: response.status === 401 ? "Unauthorized" : "Request failed",
      }));
      throw new Error(error.detail || "Request failed");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string, username: string, password: string) {
    return this.request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
  }

  async login(email: string, password: string) {
    const tokens = await this.request<Tokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(tokens.access_token);
    if (typeof window !== "undefined") {
      localStorage.setItem("refresh_token", tokens.refresh_token);
    }
    return tokens;
  }

  async refresh(refreshToken: string) {
    // Backend expects refresh_token as a query parameter.
    const tokens = await this.request<Tokens>(`/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
    });
    this.setToken(tokens.access_token);
    if (typeof window !== "undefined") {
      localStorage.setItem("refresh_token", tokens.refresh_token);
    }
    return tokens;
  }

  async logout() {
    this.clearToken();
  }

  async getMe() {
    return this.request<User>("/auth/me");
  }

  // Project endpoints
  async getProjects(page = 1, pageSize = 20) {
    return this.request<ProjectList>(`/projects?page=${page}&page_size=${pageSize}`);
  }

  async createProject(name: string) {
    return this.request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async createProjectWithWorkflows(data: { name: string; enable_try_on: boolean; enable_background: boolean; enable_video: boolean; workflow_steps?: Array<"try_on" | "background" | "video"> }) {
    return this.request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getProject(id: number) {
    return this.request<Project>(`/projects/${id}`);
  }

  async updateProject(id: number, data: Partial<ProjectUpdate>) {
    return this.request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: number) {
    return this.request<void>(`/projects/${id}`, {
      method: "DELETE",
    });
  }

  async startPipeline(projectId: number, params: { start_step?: string; chain?: boolean } = {}) {
    const qs = new URLSearchParams();
    if (params.start_step) qs.set("start_step", params.start_step);
    if (params.chain != null) qs.set("chain", String(params.chain));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<Project>(`/projects/${projectId}/pipeline/start${suffix}`, {
      method: "POST",
    });
  }

  async cancelPipeline(projectId: number) {
    return this.request<Project>(`/projects/${projectId}/pipeline/cancel`, {
      method: "POST",
    });
  }

  // Task endpoints
  async createTryOnTask(data: TryOnTaskCreate) {
    return this.request<Task>("/tasks/try-on", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createBackgroundTask(data: BackgroundTaskCreate) {
    return this.request<Task>("/tasks/background", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createVideoTask(data: VideoTaskCreate) {
    return this.request<Task>("/tasks/video", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getTaskStatus(taskId: number) {
    return this.request<TaskStatus>(`/tasks/${taskId}/status`);
  }

  async getProjectTasks(projectId: number) {
    return this.request<Task[]>(`/tasks/project/${projectId}`);
  }

  // Asset endpoints
  async getAssets(params: { asset_type?: string[]; days?: number; limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams();
    for (const t of params.asset_type ?? []) qs.append("asset_type", t);
    if (params.days != null) qs.set("days", String(params.days));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<Asset[]>(`/assets${suffix}`);
  }

  async getProjectResults(projectId: number, params: { task_type?: string; days?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.task_type) qs.set("task_type", params.task_type);
    if (params.days != null) qs.set("days", String(params.days));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<Asset[]>(`/projects/${projectId}/results${suffix}`);
  }

  // Upload endpoints
  async uploadImage(file: File, assetType: string): Promise<AssetUpload> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("asset_type", assetType);

    const headers: HeadersInit = {};
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/upload/image`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail);
    }

    return response.json();
  }

  async downloadAsset(assetId: number): Promise<{ blob: Blob; filename: string | null }> {
    const headers: HeadersInit = {};
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/assets/${assetId}/download`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Download failed" }));
      throw new Error(error.detail);
    }

    const cd = response.headers.get("Content-Disposition");
    const filename = parseContentDispositionFilename(cd);
    const blob = await response.blob();
    return { blob, filename };
  }
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  // Prefer RFC 5987 filename*=UTF-8''...
  const matchStar = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (matchStar && matchStar[1]) {
    const raw = matchStar[1].trim().replace(/^\"|\"$/g, "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const match = header.match(/filename=([^;]+)/i);
  if (match && match[1]) {
    return match[1].trim().replace(/^\"|\"$/g, "");
  }
  return null;
}

// Types
export interface User {
  id: number;
  email: string;
  username: string;
  avatar_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  credits: number;
  credits_used: number;
  created_at: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AssetBrief {
  id: number;
  file_url: string;
  original_filename: string;
  display_name?: string | null;
}

export interface Project {
  id: number;
  name: string;
  status: "draft" | "processing" | "completed" | "failed";
  enable_try_on: boolean;
  enable_background: boolean;
  enable_video: boolean;
  workflow_steps?: Array<"try_on" | "background" | "video">;
  background_person_source?: "try_on_result" | "model_image";
  try_on_person_source?: "upstream" | "model_image";
  video_person_source?: "upstream" | "model_image";
  model_image: AssetBrief | null;
  clothing_image: AssetBrief | null;
  background_image?: AssetBrief | null;
  reference_video?: AssetBrief | null;
  try_on_result: AssetBrief | null;
  background_result: AssetBrief | null;
  video_result: AssetBrief | null;
  pipeline_active?: boolean;
  pipeline_cancel_requested?: boolean;
  pipeline_chain?: boolean;
  pipeline_start_step?: string | null;
  pipeline_current_step?: string | null;
  pipeline_last_error?: string | null;
  pipeline_started_at?: string | null;
  pipeline_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectList {
  projects: Project[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProjectUpdate {
  name: string;
  enable_try_on: boolean;
  enable_background: boolean;
  enable_video: boolean;
  workflow_steps: Array<"try_on" | "background" | "video">;
  background_person_source: "try_on_result" | "model_image";
  try_on_person_source: "upstream" | "model_image";
  video_person_source: "upstream" | "model_image";
  model_image_id: number | null;
  clothing_image_id: number | null;
  background_image_id: number | null;
  reference_video_id: number | null;
}

export interface Task {
  id: number;
  project_id: number;
  task_type: "try_on" | "background" | "video";
  status: "pending" | "queued" | "running" | "success" | "failed";
  runninghub_task_id: string | null;
  result_url: string | null;
  thumbnail_url: string | null;
  progress_percent: number;
  error_message: string | null;
  cost_time: number | null;
  consume_money: number | null;
  created_at: string;
}

export interface TaskStatus {
  id: number;
  status: "pending" | "queued" | "running" | "success" | "failed";
  progress_percent: number;
  result_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  estimated_time: number | null;
}

export interface TryOnTaskCreate {
  project_id: number;
  model_image_id: number;
  clothing_image_id: number;
}

export interface BackgroundTaskCreate {
  project_id: number;
  source_image_id: number;
  background_image_id?: number;
  background_prompt?: string;
}

export interface VideoTaskCreate {
  project_id: number;
  source_image_id: number;
  motion_type?: string;
  duration?: number;
}

export interface AssetUpload {
  id: number;
  file_url: string;
  content_hash?: string | null;
  original_filename: string;
  asset_type: string;
  display_name?: string | null;
}

export interface Asset {
  id: number;
  filename: string;
  display_name: string | null;
  original_filename: string;
  file_url: string;
  content_hash?: string | null;
  asset_type: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

// Export singleton instance
export const api = new ApiClient();
