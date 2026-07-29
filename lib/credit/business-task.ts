export type BusinessType =
  | "video_digital_human"
  | "geo_article_batch"
  | "geo_matrix"
  | "geo_enterprise_skill"

export type BillingStage =
  | "script"
  | "voice_clone"
  | "video_generation"
  | "video_retry"
  | "llm_generation"

export type BusinessTaskBilling = {
  businessTaskId: string
  businessType: BusinessType
  billingStage: BillingStage
}

export function businessTaskPayload(task?: BusinessTaskBilling): Record<string, string> {
  if (!task) return {}
  return {
    business_task_id: task.businessTaskId,
    business_type: task.businessType,
    billing_stage: task.billingStage,
  }
}
