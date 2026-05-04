export const SCORE_WEIGHTS = {
  EXACT_PHRASE: 0.35,
  TOKEN_OVERLAP: 0.25,
  FUZZY_MATCH: 0.15,
  RECENCY: 0.10,
  REPO_CONTEXT: 0.08,
  ENGINEERING_IMPORTANCE: 0.07,
} as const;

export const SOURCE_BOOST: Record<string, number> = {
  prompt: 1.0,
  commit_message: 0.9,
  session_name: 0.85,
  branch_name: 0.8,
  repo_name: 0.75,
  file_path: 0.6,
};

export const RECENCY_DECAY_HOURS = 168;
export const CURRENT_REPO_BOOST = 1.3;
export const CURRENT_BRANCH_BOOST = 1.15;
export const MAX_RESULTS = 15;
export const MIN_SCORE_THRESHOLD = 0.15;

export const ENGINEERING_STEMS: Record<string, string[]> = {
  auth: ["authentication", "authorize", "authorization", "oauth", "jwt", "token", "login", "session"],
  api: ["endpoint", "route", "handler", "controller", "rest", "graphql", "grpc"],
  db: ["database", "migration", "schema", "query", "sql", "postgres", "mysql", "sqlite", "mongo"],
  test: ["testing", "spec", "unit", "integration", "e2e", "coverage", "mock", "stub"],
  fix: ["bug", "patch", "hotfix", "repair", "resolve", "issue", "error"],
  refactor: ["restructure", "cleanup", "reorganize", "simplify", "extract", "decompose"],
  perf: ["performance", "optimize", "speed", "cache", "latency", "throughput"],
  deploy: ["deployment", "release", "ci", "cd", "pipeline", "docker", "k8s", "kubernetes"],
  config: ["configuration", "settings", "env", "environment", "dotenv"],
  ui: ["frontend", "component", "react", "vue", "css", "style", "layout", "responsive"],
};

export const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was",
  "were", "been", "have", "has", "had", "will", "would", "could",
  "should", "can", "may", "not", "but", "all", "its", "also",
  "into", "more", "some", "than", "then", "them", "these", "those",
  "what", "when", "where", "which", "who", "how", "why",
  "just", "about", "like", "very", "really", "much", "well",
]);
