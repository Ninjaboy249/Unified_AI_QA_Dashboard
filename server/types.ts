export type Priority = "Low" | "Medium" | "High" | "Critical";

export interface TestCase {
  id: string;
  title: string;
  type: "Positive" | "Negative" | "Edge";
  priority: Priority;
  preconditions: string;
  steps: string[];
  expectedResult: string;
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

export interface AccountRecord {
  id: string;
  type: "Account";
  owner: string;
  name: string;
  platform: string;
  status: string;
  lastSeen: string;
  notes: string;
}

export interface PolicyAnswer {
  answer: string;
  found: boolean;
  confidence: number;
  sourceTitle?: string;
  fileName?: string;
  sourceUrl?: string;
}
