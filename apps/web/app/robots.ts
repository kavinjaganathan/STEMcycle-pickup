import type { MetadataRoute } from "next";

// Only the public pages are for search engines; volunteer and admin areas aren't.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/contact"],
      disallow: ["/admin", "/driver", "/login", "/signup", "/drive", "/cancel", "/api", "/auth"],
    },
  };
}
