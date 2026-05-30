export const MOCK_USER_PROFILE = {
  user_id: "usr_8a3f1b",
  name: "Priya Sharma",
  email: "priya.sharma@university.edu",
  role: "student",
  enrollment: "MS Computer Science",
  interests: ["MLOps", "model deployment", "CI/CD for ML"],
  completed_courses: ["Intro to ML", "Deep Learning Fundamentals", "Cloud Computing"],
  current_month: 2,
  joined_at: "2025-09-01",
};

export const MOCK_ROADMAP = {
  slug: "mlops-fundamentals",
  title: "MLOps Fundamentals Learning Path",
  user_id: "usr_8a3f1b",
  total_months: 6,
  months: [
    {
      month: 1,
      title: "Foundations of MLOps",
      goals: [
        "Understand the ML lifecycle end-to-end",
        "Set up a reproducible ML project structure",
        "Learn version control for data and models with DVC",
      ],
      resources: [
        "Made With ML – MLOps Course",
        "DVC official documentation",
        "Google MLOps whitepaper (Level 0–2)",
      ],
      status: "completed",
    },
    {
      month: 2,
      title: "Experiment Tracking & Model Registry",
      goals: [
        "Set up MLflow for experiment tracking",
        "Log metrics, params, and artifacts",
        "Register and version models in MLflow Model Registry",
      ],
      resources: [
        "MLflow quickstart guide",
        "Weights & Biases intro tutorial",
        "Neptune.ai comparison blog",
      ],
      status: "in_progress",
    },
    {
      month: 3,
      title: "CI/CD for Machine Learning",
      goals: [
        "Build a CI pipeline for model training with GitHub Actions",
        "Automate model validation and testing",
        "Implement continuous training triggers",
      ],
      resources: [
        "GitHub Actions ML workflow templates",
        "CML by Iterative.ai docs",
        "Martin Fowler – CD4ML article",
      ],
      status: "not_started",
    },
    {
      month: 4,
      title: "Model Serving & Deployment",
      goals: [
        "Deploy a model with FastAPI and Docker",
        "Set up A/B testing for model versions",
        "Learn Kubernetes basics for ML workloads",
      ],
      resources: [
        "FastAPI ML serving tutorial",
        "Docker for Data Science book (ch. 5–7)",
        "Seldon Core documentation",
      ],
      status: "not_started",
    },
    {
      month: 5,
      title: "Monitoring & Observability",
      goals: [
        "Implement data drift detection with Evidently AI",
        "Set up model performance monitoring dashboards",
        "Build alerting pipelines for degraded predictions",
      ],
      resources: [
        "Evidently AI quickstart",
        "Prometheus + Grafana for ML metrics",
        "Google – Monitoring ML Models in Production",
      ],
      status: "not_started",
    },
    {
      month: 6,
      title: "Capstone: End-to-End MLOps Pipeline",
      goals: [
        "Build a full pipeline: data → train → deploy → monitor",
        "Use Airflow or Prefect for orchestration",
        "Write project documentation and retrospective",
      ],
      resources: [
        "Apache Airflow tutorial for ML pipelines",
        "Prefect 2.0 docs",
        "MLOps community project templates",
      ],
      status: "not_started",
    },
  ],
};

export const MOCK_KB_ARTICLES = [
  {
    id: "kb_001",
    title: "Getting Started with MLflow Tracking",
    content:
      "MLflow Tracking lets you log parameters, metrics, and artifacts during ML experiments. Start by installing mlflow via pip, then use mlflow.start_run() to begin logging. Key functions: mlflow.log_param(), mlflow.log_metric(), mlflow.log_artifact(). The tracking UI can be launched with 'mlflow ui' and accessed at localhost:5000.",
    tags: ["mlflow", "experiment-tracking", "getting-started"],
    relevance_score: 0.95,
  },
  {
    id: "kb_002",
    title: "DVC for Data Versioning",
    content:
      "DVC (Data Version Control) extends Git to handle large files, datasets, and ML models. Use 'dvc init' to initialize, 'dvc add' to track files, and 'dvc push/pull' for remote storage. DVC pipelines (dvc.yaml) let you define reproducible ML workflows.",
    tags: ["dvc", "data-versioning", "reproducibility"],
    relevance_score: 0.72,
  },
  {
    id: "kb_003",
    title: "CI/CD Pipelines for ML with GitHub Actions",
    content:
      "GitHub Actions can automate model training, testing, and deployment. Create a workflow YAML that triggers on push, runs training scripts, validates model metrics against a threshold, and optionally deploys. CML (Continuous Machine Learning) adds ML-specific reporting to PRs.",
    tags: ["ci-cd", "github-actions", "automation"],
    relevance_score: 0.85,
  },
  {
    id: "kb_004",
    title: "Model Deployment with FastAPI",
    content:
      "FastAPI is ideal for serving ML models as REST APIs. Load your model at startup, define a Pydantic schema for input validation, and create a /predict endpoint. Use uvicorn as the ASGI server. Dockerize the application for consistent deployments.",
    tags: ["fastapi", "model-serving", "deployment"],
    relevance_score: 0.68,
  },
  {
    id: "kb_005",
    title: "Monitoring ML Models with Evidently AI",
    content:
      "Evidently AI provides tools for monitoring data drift, target drift, and model performance in production. Generate reports with evidently.report.Report and integrate with dashboards. Set up automated checks to detect when retraining is needed.",
    tags: ["monitoring", "evidently", "drift-detection"],
    relevance_score: 0.60,
  },
  {
    id: "kb_006",
    title: "MLOps Maturity Model",
    content:
      "Google defines three levels of MLOps maturity: Level 0 (manual), Level 1 (ML pipeline automation), Level 2 (CI/CD pipeline automation). Most teams start at Level 0 and should aim for Level 1 before attempting Level 2. Each level builds on the previous.",
    tags: ["mlops", "maturity-model", "best-practices"],
    relevance_score: 0.78,
  },
  {
    id: "kb_007",
    title: "Weights & Biases vs MLflow Comparison",
    content:
      "Both W&B and MLflow offer experiment tracking, but differ in approach. MLflow is open-source and self-hosted; W&B is cloud-first with a generous free tier. W&B excels at visualization and collaboration; MLflow offers tighter integration with the model registry and deployment pipelines.",
    tags: ["mlflow", "wandb", "comparison", "experiment-tracking"],
    relevance_score: 0.88,
  },
];
