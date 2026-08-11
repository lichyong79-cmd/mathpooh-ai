import { sourceWorkflowBucket, sourceWorkflowSummary, type WorkflowBucket, type WorkflowQuestionLike } from "@/lib/source-workflow";
export type { WorkflowBucket, WorkflowQuestionLike };
export type WorkflowSummary = ReturnType<typeof sourceWorkflowSummary>;
export const workflowBucketOf = sourceWorkflowBucket;
export const summarizeWorkflow = sourceWorkflowSummary;
