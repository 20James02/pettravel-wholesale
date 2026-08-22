import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/orders", "/profile"]
    },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
    host: siteUrl.origin
  };
}
