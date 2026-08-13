export type MembershipSelection = {
  planId: string | null
  planName: string | null
  proofUrl: string | null
  proofName: string | null
  proofPath: string | null
  selectedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  status: string | null
  extraDays: number
  expiresAt: string | null
}

export const getMembershipSelection = (
  config?: Record<string, any>,
): MembershipSelection => {
  const raw = (config?.membership_payment_proof ?? {}) as Record<string, any>

  return {
    planId: raw.plan_id ?? raw.planId ?? null,
    planName: raw.plan_name ?? raw.planName ?? null,
    proofUrl: raw.proof_url ?? raw.proofUrl ?? null,
    proofName: raw.proof_name ?? raw.proofName ?? null,
    proofPath: raw.proof_path ?? raw.proofPath ?? null,
    selectedAt: raw.selected_at ?? raw.selectedAt ?? null,
    approvedAt: raw.approved_at ?? raw.approvedAt ?? null,
    rejectedAt: raw.rejected_at ?? raw.rejectedAt ?? null,
    status: raw.status ?? raw.payment_status ?? null,
    extraDays: Number.isFinite(Number(raw.extra_days ?? raw.extraDays))
      ? Number(raw.extra_days ?? raw.extraDays)
      : 0,
    expiresAt: raw.expires_at ?? raw.expiresAt ?? null,
  }
}

export const hasMembershipPlan = (
  config: Record<string, any> | undefined,
  planIdOrName: string,
) => {
  const selection = getMembershipSelection(config)
  return [selection.planId, selection.planName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase() === planIdOrName.toLowerCase())
}
