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

    if (this.accessToken) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        detail: "Request failed",
      }));
      throw new Error(error.detail);
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

  // Upload endpoints
  async uploadImage(file: File, assetType: string): Promise<AssetUpload> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("asset_type", assetType);

    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
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
}

export interface Project {
  id: number;
  name: string;
  status: "draft" | "processing" | "completed" | "failed";
  model_image: AssetBrief | null;
  clothing_image: AssetBrief | null;
  try_on_result: AssetBrief | null;
  background_result: AssetBrief | null;
  video_result: AssetBrief | null;
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
  model_image_id: number;
  clothing_image_id: number;
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
  original_filename: string;
  asset_type: string;
}

// Export singleton instance
export const api = new ApiClient();
