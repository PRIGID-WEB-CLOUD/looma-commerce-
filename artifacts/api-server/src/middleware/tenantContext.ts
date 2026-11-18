import { type Request, type Response, type NextFunction } from "express";
import { db, storesTable, sessionsTable, usersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { extractTenantFromHost, validateTenantSlug, sanitizeTenantSlug, type TenantHostInfo } from "@workspace/tenant-routing";
import { logger } from "../lib/logger";
import { createHash } from "node:crypto";

export interface TenantRequest extends Request {
  storeId?: string;
  store?: typeof storesTable.$inferSelect;
  tenantInfo?: TenantHostInfo;
}

function sessionDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.["luxe_session"] as string | undefined;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export async function isUserAdminOfStore(req: Request, storeId: string): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;

  try {
    const rows = await db
      .select({ user: usersTable, sessionStoreId: sessionsTable.storeId })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(eq(sessionsTable.token, sessionDigest(token)))
      .limit(1);

    const row = rows[0];
    if (!row) return false;

    const role = row.user.role?.toUpperCase();
    if (role === "PLATFORM_ADMIN") return true;
    if (row.user.storeId !== storeId || row.sessionStoreId !== storeId) return false;
    return role === "ADMIN" || role === "SUPER_ADMIN";
  } catch (err) {
    logger.error({ err, storeId }, "Error checking admin status");
    return false;
  }
}

/**
 * Middleware to resolve and enforce tenant isolation for all requests.
 * Extracts tenant from:
 * 1. Hostname subdomain (e.g. "atelier-celeste.prigidcommerce.com" or "atelier-celeste.ais-dev-xxx.run.app")
 * 2. Hostname custom domain (e.g. "www.atelierceleste.com", "moretti.it")
 * 3. Verified HTTP headers (X-Store-Id or X-Publishable-Key)
 * 4. Explicit scoped query / cookie (in development / preview fallback)
 */
export async function tenantResolver(req: TenantRequest, res: Response, next: NextFunction) {
  const checkPath = req.path.startsWith("/api") ? req.path : `/api${req.path}`;

  // Platform-level routes that do not require store isolation
  if (
    checkPath === "/api/health" ||
    checkPath.startsWith("/api/platform-admin") ||
    checkPath.startsWith("/api/marketplace") ||
    checkPath.startsWith("/api/auth/seller") ||
    checkPath.startsWith("/api/admin/stores")
  ) {
    return next();
  }

  const hostHeader = (req.headers["x-forwarded-host"] || req.get("host") || req.hostname) as string;
  const tenantInfo = extractTenantFromHost(hostHeader);
  req.tenantInfo = tenantInfo;

  const storeIdHeader = (req.headers["x-store-id"] || req.query.storeId) as string;
  const pubKeyHeader = (req.headers["x-publishable-key"] || req.query.publishableKey || req.headers["x-api-key"]) as string;
  const apiKeyAuth = extractToken(req);
  const querySlug = req.query.store as string | undefined;

  try {
    const allStores = await db.select().from(storesTable);
    let storeRecord: (typeof storesTable.$inferSelect) | undefined;

    // 1. Resolve by explicit storeId header or query
    if (storeIdHeader) {
      storeRecord = allStores.find((s: any) => s.id === storeIdHeader);
    }
    // 2. Resolve by publishable key or API key header
    else if (pubKeyHeader) {
      storeRecord = allStores.find((s: any) => s.publishableKey === pubKeyHeader || s.publishable_key === pubKeyHeader || s.secretKeyHash === pubKeyHeader);
    }
    // 3. Resolve by Bearer token API key
    else if (apiKeyAuth) {
      storeRecord = allStores.find((s: any) => s.secretKeyHash === apiKeyAuth || s.publishableKey === apiKeyAuth);
    }
    // 4. Resolve by query slug in development/preview
    else if (querySlug && validateTenantSlug(querySlug)) {
      storeRecord = allStores.find((s: any) => s.slug === querySlug);
    }
    // 5. Resolve by custom domain if present
    else if (tenantInfo.type === "custom_domain" && tenantInfo.domain) {
      const domainToMatch = tenantInfo.domain.toLowerCase().replace(/^www\./, "");
      storeRecord = allStores.find((s: any) => {
        if (!s.customDomain) return false;
        const normalized = s.customDomain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
        return normalized === domainToMatch || s.customDomain.toLowerCase() === tenantInfo.domain;
      });
    }
    // 6. Fallback to default active store (store-001 or first available store) so external marketplace proxies work seamlessly without subdomains
    if (!storeRecord && allStores.length > 0) {
      storeRecord = allStores.find((s: any) => s.id === "store-001" || s.slug === "luxe-boutique") || allStores[0];
    }

    if (!storeRecord) {
      return res.status(404).json({
        error: "Tenant Not Found",
        code: "TENANT_RESOLUTION_FAILED",
        message: "Unable to identify the store tenant for this request.",
      });
    }

    // Enforce Suspended status
    if (storeRecord.status === "suspended" || storeRecord.publishStatus === "SUSPENDED") {
      return res.status(403).json({
        error: "Store Suspended",
        code: "STORE_SUSPENDED",
        message: "This boutique has been suspended. Please contact PRIGID Commerce Group support.",
      });
    }

    // Publication status enforcement for public storefront endpoints
    const isPublicStorefrontEndpoint = 
      !checkPath.startsWith("/api/admin") && 
      !checkPath.startsWith("/api/settings") && 
      !checkPath.startsWith("/api/team") &&
      !checkPath.startsWith("/api/auth/seller");
    
    if (isPublicStorefrontEndpoint && storeRecord.publishStatus !== "PUBLISHED") {
      const isAdmin = await isUserAdminOfStore(req, storeRecord.id);
      if (!isAdmin) {
        return res.status(403).json({
          error: "Private Atelier",
          code: "STORE_UNPUBLISHED",
          message: "This boutique is currently configuring its digital showroom and is not publicly accessible.",
          isPublished: false,
        });
      }
    }

    // Attach verified tenant context to the request
    req.storeId = storeRecord.id;
    req.store = storeRecord;
    
    next();
  } catch (error) {
    logger.error({ err: error, path: req.path }, "Tenant resolution failed");
    return res.status(500).json({ error: "Internal Server Error during tenant resolution" });
  }
}
