export type PipelinePhase =
  | "setup"
  | "phase1"
  | "phase2"
  | "phase3"
  | "complete";

export type PipelineLogLevel = "info" | "warn" | "error";

export type PipelineLogEntry = {
  timestamp: string;
  level: PipelineLogLevel;
  phase?: PipelinePhase;
  message: string;
  pageTitle?: string;
  pageId?: number;
};

export type PipelineStatus = {
  dbStatus: string;
  log: PipelineLogEntry;
};

export type ScaffoledPage = {
  id: number;
  /** Stable label from pagesToBuild (e.g. "About"), not the SEO title in WordPress. */
  title: string;
  scaffoldTitle: string;
  slug: string;
  status: string;
};

export type Phase2Result = {
  pageId: number;
  pageTitle: string;
  html: string;
};

export type SeoValidationPayload = {
  seo_title: string;
  meta_description: string;
  slug: string;
  h1_count: number;
  heading_hierarchy_valid: boolean;
  keyword_density_passed: boolean;
  validation_passed: boolean;
  corrected_html: string;
};
