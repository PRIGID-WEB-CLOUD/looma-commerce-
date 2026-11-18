import { Router, type Request, type Response } from "express";
import { db, storesTable, productsTable, categoriesTable, reviewsTable, appSettingsTable, ordersTable } from "@workspace/db";
import { buildTenantUrl, validateTenantSlug, sanitizeTenantSlug } from "@workspace/tenant-routing";

const router = Router();

router.get("/marketplace/stores", async (req: Request, res: Response) => {
  try {
    const stores = await db.select().from(storesTable);
    const publishedStores = stores.filter((s: any) =>
      (s.publishStatus === "PUBLISHED" || s.isPublished === true) &&
      s.status !== "suspended" &&
      s.publishStatus !== "SUSPENDED"
    );

    const [allSettings, allProducts, allCategories, allReviews] = await Promise.all([
      db.select().from(appSettingsTable).catch(() => []),
      db.select().from(productsTable).catch(() => []),
      db.select().from(categoriesTable).catch(() => []),
      db.select().from(reviewsTable).catch(() => []),
    ]);

    const categoryMap = new Map<string, string>();
    allCategories.forEach((c: any) => {
      if (c.id && c.name) categoryMap.set(c.id, c.name);
    });

    const hostHeader = (req.headers["x-forwarded-host"] || req.get("host") || req.hostname) as string;
    const isPreview = !hostHeader || hostHeader.includes("localhost") || hostHeader.endsWith(".run.app") || hostHeader.endsWith(".aistudio.app") || hostHeader.startsWith("127.0.0.1");

    const enriched = publishedStores.map((store: any) => {
      const storeSettingsRows = allSettings.filter((s: any) => s.storeId === store.id);
      const settings = Object.fromEntries(storeSettingsRows.map((s: any) => [s.key, s.value]));

      const storeProducts = allProducts.filter((p: any) => p.storeId === store.id || p.store_id === store.id);
      const storeReviews = allReviews.filter((r: any) => r.storeId === store.id || r.store_id === store.id);

      const rating = storeReviews.length > 0
        ? Number((storeReviews.reduce((sum: number, r: any) => sum + Number(r.rating || 5), 0) / storeReviews.length).toFixed(2))
        : 5.0;

      const firstProduct = storeProducts[0];
      const productCategoryName = firstProduct?.categoryId ? categoryMap.get(firstProduct.categoryId) : null;
      const categoryName = settings["brand_category"] || settings["category"] || productCategoryName || "Luxury Collection";

      // Derive key for filtering
      let categoryKey = "all";
      const catLower = categoryName.toLowerCase();
      if (catLower.includes("couture") || catLower.includes("rtw") || catLower.includes("wear")) categoryKey = "couture";
      else if (catLower.includes("leather") || catLower.includes("shoe") || catLower.includes("footwear")) categoryKey = "leather";
      else if (catLower.includes("jewel") || catLower.includes("gem") || catLower.includes("diamond")) categoryKey = "jewels";
      else if (catLower.includes("watch") || catLower.includes("horolog") || catLower.includes("timepiece")) categoryKey = "horology";
      else if (catLower.includes("silk") || catLower.includes("evening")) categoryKey = "silk";
      else categoryKey = sanitizeTenantSlug(categoryName) || store.slug.toLowerCase();

      const tagline = settings["brand_tagline"] || settings["tagline"] || settings["store_tagline"] ||
        (firstProduct?.description ? firstProduct.description : `${store.name} — Handcrafted Artisanal Collection`);

      const location = settings["store_location"] || settings["store_city"] || settings["brand_location"] || "Global Atelier";

      const heroImage = settings["brand_hero_image"] || settings["hero_image"] || firstProduct?.imageUrl || "";

      const badge = settings["brand_badge"] || (
        store.planTier === "enterprise" ? "Flagship Maison" :
        store.planTier === "growth" ? "Heritage Atelier" :
        "Verified Maison"
      );

      let highlights: string[] = [];
      if (settings["brand_highlights"]) {
        try {
          const parsed = JSON.parse(settings["brand_highlights"]);
          if (Array.isArray(parsed)) highlights = parsed;
        } catch {
          highlights = String(settings["brand_highlights"]).split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
      if (highlights.length === 0 && storeProducts.length > 0) {
        const tags = new Set<string>();
        storeProducts.forEach((p: any) => {
          if (p.tags) {
            String(p.tags).split(",").forEach((t) => tags.add(t.trim()));
          }
        });
        highlights = Array.from(tags).slice(0, 3);
        if (highlights.length === 0) {
          highlights = storeProducts.slice(0, 3).map((p: any) => p.name);
        }
      }

      const cleanSlug = store.slug.toLowerCase().trim();
      const customDomain = store.customDomain && store.customDomain.trim() ? store.customDomain.trim().toLowerCase() : null;
      const canonicalDomain = customDomain || `${cleanSlug}.prigidcommerce.com`;
      const canonicalUrl = `https://${canonicalDomain}`;
      const previewUrl = `/?store=${encodeURIComponent(cleanSlug)}`;

      return {
        id: store.id,
        name: store.name,
        slug: cleanSlug,
        planTier: store.planTier,
        currency: store.currency || "USD",
        customDomain,
        canonicalDomain,
        canonicalUrl,
        isPublished: true,
        tagline,
        category: categoryName,
        categoryKey,
        location,
        heroImage,
        badge,
        highlights,
        rating,
        established: settings["store_established"] || "Verified Atelier",
        storeUrl: canonicalUrl,
        previewUrl,
        productCount: storeProducts.length,
      };
    });

    return res.json({
      success: true,
      count: enriched.length,
      stores: enriched,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load marketplace stores" });
  }
});

router.get("/marketplace/stats", async (_req: Request, res: Response) => {
  try {
    const [stores, products, reviews, orders] = await Promise.all([
      db.select().from(storesTable).catch(() => []),
      db.select().from(productsTable).catch(() => []),
      db.select().from(reviewsTable).catch(() => []),
      db.select().from(ordersTable).catch(() => []),
    ]);

    const published = stores.filter((s: any) =>
      (s.publishStatus === "PUBLISHED" || s.isPublished === true) &&
      s.status !== "suspended" &&
      s.publishStatus !== "SUSPENDED"
    );

    const publishedStoreIds = new Set(published.map((s: any) => s.id));
    const activeProducts = products.filter((p: any) => publishedStoreIds.has(p.storeId || p.store_id));
    const activeReviews = reviews.filter((r: any) => publishedStoreIds.has(r.storeId || r.store_id));

    let satisfaction = "100%";
    if (activeReviews.length > 0) {
      const positive = activeReviews.filter((r: any) => Number(r.rating || 5) >= 4);
      satisfaction = ((positive.length / activeReviews.length) * 100).toFixed(1) + "%";
    }

    const destinationCountries = new Set<string>();
    orders.forEach((o: any) => {
      const addr = o.shippingAddress;
      if (addr && typeof addr === "object" && addr.country) destinationCountries.add(String(addr.country).toUpperCase());
    });
    const uniqueDestinationsCount = Math.max(destinationCountries.size, published.length);

    return res.json({
      success: true,
      stats: {
        totalMaisons: published.length,
        handcraftedPieces: activeProducts.length,
        deliveryCountries: uniqueDestinationsCount,
        clientSatisfaction: satisfaction,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load stats" });
  }
});

export default router;
