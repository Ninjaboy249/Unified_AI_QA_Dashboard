export type Priority = "Low" | "Medium" | "High" | "Critical";

export interface TestCase {
  attachments?: ScreenshotReference[];
  id: string;
  title: string;
  type: "Positive" | "Negative" | "Edge";
  priority: Priority;
  preconditions: string;
  steps: string[];
  expectedResult: string;
}

export interface ScreenshotReference {
  url: string;
  sourceUrl: string;
  title: string;
}

export interface RequirementDocument {
  fileName: string;
  requirements: Array<{ id: string; title: string; description: string }>;
  text: string;
  mode: "ai" | "extracted";
  notice: string;
}

export interface PolicySetupPlan {
  portal: { id: string; name: string; url: string };
  explanation: string;
  steps: string[];
  mode: "openai";
}

export interface BugDraft {
  title: string;
  requirement: string;
  summary: string;
  environment: string;
  version: string;
  occurrence: string;
  severity: Priority;
  priority: Priority;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  tags: string[];
  humanApprovalRequired: true;
}

export interface PolicyAnswer {
  answer: string;
  found: boolean;
  confidence: number;
  sourceTitle?: string;
  fileName?: string;
  sourceUrl?: string;
}

export interface DirectoryRecord {
  id: string;
  serialGroup: number;
  owner: string;
  device: string;
  os: string;
  completeOsVersion: string;
  serialNo: string;
  accessories: string;
  platform: "Android" | "iOS" | "iPadOS" | "Unknown";
  status: "Active" | "Obsolete";
  notes: string;
}

export type DeviceFields = Omit<DirectoryRecord, "id">;

export type DirectoryChange =
  | { type: "add"; record: DeviceFields }
  | { type: "update"; id: string; fields: Partial<DeviceFields> }
  | { type: "delete"; id: string };

export interface DirectorySnapshot {
  records: DirectoryRecord[];
  revision: number;
  persistence: "postgres" | "unconfigured";
  message: string;
}

export interface DirectoryProposal {
  revision: number;
  summary: string;
  changes: DirectoryChange[];
  preview: Array<{
    type: DirectoryChange["type"];
    before: DirectoryRecord | null;
    after: DirectoryRecord | null;
  }>;
}

export interface Account {
  username: string;
  role: "admin" | "dev";
  expiresAt: string;
}

export interface AccountSummary {
  username: string;
  role: "admin" | "dev";
  updatedAt: string;
}

export type Ring = "R0" | "R1" | "R2" | "R3" | "R4";

export interface TestAccount {
  id: string;
  ring: Ring;
  username: string;
  notes: string;
  updatedBy: string;
  updatedAt: string;
}
