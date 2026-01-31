export const en = {
  // Common
  common: {
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
    next: "Next",
    continue: "Continue",
    submit: "Submit",
    download: "Download",
    upload: "Upload",
    processing: "Processing...",
    retry: "Retry",
  },

  // Auth
  auth: {
    login: "Login",
    logout: "Logout",
    register: "Register",
    email: "Email",
    password: "Password",
    username: "Username",
    confirmPassword: "Confirm Password",
    forgotPassword: "Forgot Password?",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    loginSuccess: "Login successful",
    registerSuccess: "Registration successful",
    loginFailed: "Login failed",
    registerFailed: "Registration failed",
    invalidCredentials: "Invalid email or password",
  },

  // Header
  header: {
    dashboard: "Dashboard",
    projects: "Projects",
    results: "Results",
    settings: "Settings",
    language: "Language",
  },

  results: {
    title: "Results Library",
    description: "All generated results from the last 7 days",
    empty: "No results yet",
    download: "Download",
  },

  // Dashboard
  dashboard: {
    title: "Dashboard",
    welcome: "Welcome back",
    newProject: "New Project",
    recentProjects: "Recent Projects",
    noProjects: "No projects yet",
    createFirst: "Create your first project to get started",
    projectName: "Project Name",
    createProject: "Create Project",
    deleteProject: "Delete Project",
    confirmDelete: "Are you sure you want to delete this project?",
  },

  // Workflow
  workflow: {
    title: "Workflow",
    backToDashboard: "Back to Dashboard",
    steps: {
      upload: "Upload",
      tryOn: "Try-on",
      background: "Background",
      video: "Video Motion Transfer",
    },
    stepDescriptions: {
      upload: "Upload model and clothing images",
      tryOn: "Generate virtual try-on",
      background: "Change background",
      video: "Video Motion Transfer",
    },
  },

  // Upload Step
  upload: {
    title: "Upload Images",
    description: "Upload a model image and a clothing image to start",
    modelImage: "Model Image",
    modelDescription: "Upload a full-body model photo",
    clothingImage: "Clothing Image",
    clothingDescription: "Upload the clothing item",
    dragDrop: "Drag and drop or click to upload",
    maxSize: "Maximum file size: 10MB",
    supportedFormats: "Supported formats: JPG, PNG, WebP",
  },

  // Try-On Step
  tryOn: {
    title: "Virtual Try-On",
    description: "Generate a virtual try-on using AI",
    startTryOn: "Start Try-On",
    model: "Model",
    clothing: "Clothing",
    result: "Try-On Result",
  },

  // Background Step
  background: {
    title: "Background Change",
    description: "Replace the background of your try-on result",
    backgroundImage: "Background Image (Optional)",
    backgroundDescription: "Upload a custom background or leave empty for AI generation",
    changeBackground: "Change Background",
    result: "Background Result",
  },

  // Video Step
  video: {
    title: "Video Motion Transfer",
    description: "Transfer motion from a reference video to your person image",
    generateVideo: "Generate Video",
    generatedVideo: "Generated Video",
    motionType: "Motion Type",
    duration: "Duration",
  },

  // Task Status
  task: {
    pending: "Pending",
    queued: "Queued",
    running: "Processing",
    success: "Complete",
    failed: "Failed",
    complete: "complete",
    remaining: "remaining",
    aiProcessing: "AI is processing your image...",
    waitingToStart: "Waiting to start...",
    processingFailed: "Processing failed",
    tryAgain: "Please try again or contact support if the issue persists.",
    taskStarted: "Task started",
    taskCompleted: "Task completed successfully",
    taskFailed: "Task failed",
  },

  // Errors
  errors: {
    uploadFailed: "Upload failed",
    taskFailed: "Failed to start task",
    projectNotFound: "Project not found",
    assetNotFound: "Asset not found",
    networkError: "Network error, please try again",
    unknownError: "An unknown error occurred",
  },

  // Settings
  settings: {
    title: "Settings",
    language: "Language",
    theme: "Theme",
    notifications: "Notifications",
  },
};

export type TranslationKeys = typeof en;
