import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-mark";

export const size = { width: 1024, height: 1024 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <BrandMark width={1024} height={1024} />
      </div>
    ),
    {
      ...size,
    },
  );
}
