import { Router, type Response } from "express";
import { db, productsTable, categoriesTable, blogPostsTable, storesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { extractTenantFromHost } from "@workspace/tenant-routing";
import { type TenantRequest } from "../middleware/tenantContext";

const seoRouter = Router();

async function resolveSeoStore(req: TenantRequest) {
  if (req.store) return req.store;
  const rawHost = (req.get("x-forwarded-host") || req.get("host") || req.hostname || "").split(":")[0].trim().toLowerCase();
  const hostInfo = extractTenantFromHost(rawHost);

  if (hostInfo.type === "custom_domain" && hostInfo.domain) {
    const [found] = await db.select().from(storesTable).where(eq(storesTable.customDomain, hostInfo.domain)).limit(1);
    return found ?? null;
  }
  if (hostInfo.type === "subdomain" && hostInfo.slug) {
    const [found] = await db.select().from(storesTable).where(eq(storesTable.slug, hostInfo.slug.toLowerCase())).limit(1);
    return found ?? null;
  }
  return null;
}

function getEffectiveHost(req: TenantRequest, store?: { slug: string; customDomain: string | null } | null): string {
  const host = req.get("x-forwarded-host") || req.get("host");
  if (host) return host;
  if (store?.customDomain) return store.customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (store?.slug) return `${store.slug}.prigidcommerce.com`;
  return "prigidcommerce.com";
}

// ── GET /robots.txt & /api/robots.txt ───────────────────────────────────────
seoRouter.get(["/robots.txt", "/api/robots.txt"], async (req: TenantRequest, res: Response) => {
  const store = await resolveSeoStore(req).catch(() => null);
  const host = getEffectiveHost(req, store);
  const protocol = req.protocol || "https";
  const baseUrl = `${protocol}://${host}`;

  const content = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /seller
Disallow: /api/
Disallow: /checkout
Disallow: /account

Sitemap: ${baseUrl}/sitemap.xml
`;

  res.header("Content-Type", "text/plain");
  return res.send(content);
});

// ── GET /sitemap.xml & /api/sitemap.xml ──────────────────────────────────────
seoRouter.get(["/sitemap.xml", "/api/sitemap.xml"], async (req: TenantRequest, res: Response) => {
  try {
    const store = await resolveSeoStore(req).catch(() => null);
    const storeId = store?.id || req.storeId;
    const host = getEffectiveHost(req, store);
    const protocol = req.protocol || "https";
    const baseUrl = `${protocol}://${host}`;

    if (!storeId) {
      // Master domain: list only SaaS landing & marketplace routes (never leak tenant products)
      const masterPages = ["", "/marketplace", "/seller/register", "/seller/login"];
      const urls = masterPages.map((page) => `
  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

      res.header("Content-Type", "application/xml");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.status, "ACTIVE"), eq(productsTable.storeId, storeId)))
      .catch(() => []);

    const categories = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.storeId, storeId))
      .catch(() => []);

    const posts = await db
      .select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.storeId, storeId))
      .catch(() => []);

    const staticPages = [
      "",
      "/products",
      "/sustainability",
      "/shipping-returns",
      "/terms",
      "/privacy",
      "/contact",
      "/blog",
    ];

    let urls = staticPages.map((page) => `
  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>${page === "" ? "daily" : "weekly"}</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

    // Add Product URLs
    for (const p of products) {
      const updatedAt = p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString();
      urls += `
  <url>
    <loc>${baseUrl}/products/${p.id}</loc>
    <lastmod>${updatedAt}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
    }

    // Add Category URLs
    for (const c of categories) {
      urls += `
  <url>
    <loc>${baseUrl}/products?category=${c.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    // Add Blog Posts
    for (const post of posts) {
      const updatedAt = post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString();
      urls += `
  <url>
    <loc>${baseUrl}/blog/${post.slug || post.id}</loc>
    <lastmod>${updatedAt}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.header("Content-Type", "application/xml");
    return res.send(xml);
  } catch (err) {
    console.error("Sitemap generation error:", err);
    return res.status(500).send("<error>Failed to generate sitemap</error>");
  }
});

export default seoRouter;
