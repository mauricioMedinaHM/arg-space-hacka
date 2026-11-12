import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sitio de una sola página. Sin lastModified dinámico: el archivo se genera estático en el build.
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
