// ── Official starter-pack mock data ──

export const MOCK_USER_PROFILE = {
  user_id: "usr_8842",
  name: "Priya Sharma",
  goal_track: "data_science",
  active_roadmap_id: "rdmp_9f2a",
  roadmap_slug: "priya-ds-2026",
  graduation_year: 2027,
};

export const MOCK_ROADMAP = {
  id: "rdmp_9f2a",
  slug: "priya-ds-2026",
  title: "6-month Data Science Path",
  months: [
    {
      month: 1,
      title: "Python & data basics",
      activities: ["python_fundamentals", "pandas_basics", "data_visualization_intro"],
    },
    {
      month: 2,
      title: "Statistics & visualization",
      activities: ["statistics_101", "matplotlib_labs", "seaborn_labs"],
    },
    {
      month: 3,
      title: "ML foundations",
      activities: ["regression", "classification", "model_evaluation"],
    },
    {
      month: 4,
      title: "Model tuning & ensembles",
      activities: [
        "feature_engineering",
        "random_forests",
        "gradient_boosting",
        "capstone_week_1",
      ],
    },
    {
      month: 5,
      title: "Applied ML project",
      activities: ["team_project", "model_deployment_intro"],
    },
    {
      month: 6,
      title: "Portfolio & interview prep",
      activities: ["portfolio_site", "mock_interviews"],
    },
  ],
  revision_history: [
    { at: "2026-02-01", note: "Initial create" },
    { at: "2026-03-10", note: "Added visualization to month 2" },
  ],
};

export const MOCK_KB_CHUNKS = [
  {
    id: "mlops_month4",
    keywords: ["mlops", "month 4", "deployment", "mlflow"],
    estimated_tokens: 120,
    text: "MLOps for month 4: experiment tracking with MLflow, model registry basics, CI for training pipelines, deploy to staging. Prerequisite: ML foundations complete.",
  },
  {
    id: "internships",
    keywords: ["internship", "summer"],
    estimated_tokens: 90,
    text: "Summer internships: apply Jan–Mar after core ML skills (typically post month 3).",
  },
  {
    id: "transfer_learning",
    keywords: ["transfer learning"],
    estimated_tokens: 200,
    text: "Transfer learning uses pretrained weights and fine-tuning… (long explanatory content — low value for roadmap edit)",
  },
  {
    id: "housing",
    keywords: ["housing", "campus"],
    estimated_tokens: 80,
    text: "On-campus housing lottery opens in April.",
  },
];
