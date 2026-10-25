import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/base-path";

// Only the public pages are for search engines; volunteer and admin areas aren't.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/contact"].map((p) => BASE_PATH + p),
      disallow: [
        "/admin",
        "/driver",
        "/login",
        "/signup",
        "/drive",
        "/cancel",
        "/api",
        "/auth",
      ].map((p) => BASE_PATH + p),
    },
  };
}
