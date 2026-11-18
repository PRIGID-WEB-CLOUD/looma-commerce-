import { db, productsTable, teamMembersTable, type Store } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface PlanQuota {
  maxProducts: number;
  maxTeamMembers: number;
}

export const PLAN_LIMITS: Record<string, PlanQuota> = {
  starter: {
    maxProducts: 150,
    maxTeamMembers: 3,
  },
  growth: {
    maxProducts: 2500,
    maxTeamMembers: 15,
  },
  enterprise: {
    maxProducts: Number.POSITIVE_INFINITY,
    maxTeamMembers: Number.POSITIVE_INFINITY,
  },
};

export function getPlanLimits(planTier?: string | null): PlanQuota {
  const tier = (planTier || "starter").toLowerCase().trim();
  return PLAN_LIMITS[tier] || PLAN_LIMITS.starter;
}

export type QuotaCheckResult = {
  allowed: boolean;
  limit?: number;
  current?: number;
  planTier?: string;
};

export async function checkProductQuota(storeId: string, store?: Store): Promise<QuotaCheckResult> {
  const planTier = (store?.planTier || "starter").toLowerCase();
  const limits = getPlanLimits(planTier);
  if (!Number.isFinite(limits.maxProducts)) {
    return { allowed: true };
  }

  const rows = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId));

  const current = rows.length;
  if (current >= limits.maxProducts) {
    return { allowed: false, limit: limits.maxProducts, current, planTier };
  }
  return { allowed: true };
}

export async function checkTeamQuota(storeId: string, store?: Store): Promise<QuotaCheckResult> {
  const planTier = (store?.planTier || "starter").toLowerCase();
  const limits = getPlanLimits(planTier);
  if (!Number.isFinite(limits.maxTeamMembers)) {
    return { allowed: true };
  }

  const rows = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.storeId, storeId));

  const current = rows.length;
  if (current >= limits.maxTeamMembers) {
    return { allowed: false, limit: limits.maxTeamMembers, current, planTier };
  }
  return { allowed: true };
}
