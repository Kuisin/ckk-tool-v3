import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Emit a self-contained server bundle (.next/standalone) for a lean Docker image.
  output: "standalone",
  // PDF route handlers read HTML/CSS templates from src/pdf-templates at runtime;
  // file tracing can't see fs.readFile paths, so include them in the bundle.
  outputFileTracingIncludes: {
    "/api/pdf/**": ["src/pdf-templates/**/*"],
  },
};

export default nextConfig;
