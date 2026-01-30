import type { TranslationKeys } from "./en";

export const zh: TranslationKeys = {
  // Common
  common: {
    loading: "加载中...",
    error: "错误",
    success: "成功",
    cancel: "取消",
    confirm: "确认",
    save: "保存",
    delete: "删除",
    edit: "编辑",
    back: "返回",
    next: "下一步",
    continue: "继续",
    submit: "提交",
    download: "下载",
    upload: "上传",
    processing: "处理中...",
    retry: "重试",
  },

  // Auth
  auth: {
    login: "登录",
    logout: "退出登录",
    register: "注册",
    email: "邮箱",
    password: "密码",
    username: "用户名",
    confirmPassword: "确认密码",
    forgotPassword: "忘记密码？",
    noAccount: "还没有账号？",
    hasAccount: "已有账号？",
    loginSuccess: "登录成功",
    registerSuccess: "注册成功",
    loginFailed: "登录失败",
    registerFailed: "注册失败",
    invalidCredentials: "邮箱或密码错误",
  },

  // Header
  header: {
    dashboard: "工作台",
    projects: "项目",
    settings: "设置",
    language: "语言",
  },

  // Dashboard
  dashboard: {
    title: "工作台",
    welcome: "欢迎回来",
    newProject: "新建项目",
    recentProjects: "最近项目",
    noProjects: "暂无项目",
    createFirst: "创建您的第一个项目开始使用",
    projectName: "项目名称",
    createProject: "创建项目",
    deleteProject: "删除项目",
    confirmDelete: "确定要删除此项目吗？",
  },

  // Workflow
  workflow: {
    title: "工作流",
    backToDashboard: "返回工作台",
    steps: {
      upload: "上传",
      tryOn: "换装",
      background: "换背景",
      video: "生成视频",
    },
    stepDescriptions: {
      upload: "上传模特图和服装图",
      tryOn: "AI虚拟换装",
      background: "更换背景",
      video: "生成视频",
    },
  },

  // Upload Step
  upload: {
    title: "上传图片",
    description: "上传模特图片和服装图片开始处理",
    modelImage: "模特图片",
    modelDescription: "上传全身模特照片",
    clothingImage: "服装图片",
    clothingDescription: "上传服装图片",
    dragDrop: "拖拽或点击上传",
    maxSize: "最大文件大小：10MB",
    supportedFormats: "支持格式：JPG、PNG、WebP",
  },

  // Try-On Step
  tryOn: {
    title: "虚拟换装",
    description: "使用AI生成虚拟换装效果",
    startTryOn: "开始换装",
    model: "模特",
    clothing: "服装",
    result: "换装结果",
  },

  // Background Step
  background: {
    title: "更换背景",
    description: "替换换装结果的背景",
    backgroundImage: "背景图片（可选）",
    backgroundDescription: "上传自定义背景或留空使用AI生成",
    changeBackground: "更换背景",
    result: "换背景结果",
  },

  // Video Step
  video: {
    title: "视频生成",
    description: "从最终图片生成视频",
    generateVideo: "生成视频",
    generatedVideo: "生成的视频",
    motionType: "动作类型",
    duration: "时长",
  },

  // Task Status
  task: {
    pending: "等待中",
    queued: "排队中",
    running: "处理中",
    success: "已完成",
    failed: "失败",
    complete: "完成",
    remaining: "剩余",
    aiProcessing: "AI正在处理您的图片...",
    waitingToStart: "等待开始...",
    processingFailed: "处理失败",
    tryAgain: "请重试，如问题持续请联系客服。",
    taskStarted: "任务已开始",
    taskCompleted: "任务完成",
    taskFailed: "任务失败",
  },

  // Errors
  errors: {
    uploadFailed: "上传失败",
    taskFailed: "启动任务失败",
    projectNotFound: "项目不存在",
    assetNotFound: "资源不存在",
    networkError: "网络错误，请重试",
    unknownError: "发生未知错误",
  },

  // Settings
  settings: {
    title: "设置",
    language: "语言",
    theme: "主题",
    notifications: "通知",
  },
};
