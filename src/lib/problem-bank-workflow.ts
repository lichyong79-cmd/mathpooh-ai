import {
  classifyQuestionStage,
  countSourceWorkflow,
  summarizeSourceWorkflow,
} from "@/lib/source-workflow";

export const workflowBucketOf = (question:any) =>
  classifyQuestionStage(question?.status, Boolean(question?.bankRegistered));

export const summarizeWorkflow = (questions:any[]) =>
  summarizeSourceWorkflow(countSourceWorkflow(
    questions.map((q:any)=>({status:q?.status,bankRegistered:Boolean(q?.bankRegistered)}))
  ));
