import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const lanOrigins = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter(
    (networkInterface) =>
      networkInterface.family === "IPv4" &&
      !networkInterface.internal &&
      !networkInterface.address.startsWith("169.254."),
  )
  .map((networkInterface) => networkInterface.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set(["10.50.70.43", "10.50.70.60", ...lanOrigins])],
};

export default nextConfig;
