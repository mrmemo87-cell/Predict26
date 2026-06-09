import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, #ecfdf5 0%, #ffffff 55%, #fff7d6 100%)",
          border: "7px solid #bbf7d0",
          borderRadius: 40,
          color: "#064e3b",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, Helvetica, sans-serif",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#047857",
            borderRadius: 999,
            color: "#d4af37",
            display: "flex",
            fontSize: 25,
            fontWeight: 900,
            height: 78,
            justifyContent: "center",
            lineHeight: 1,
            width: 78,
          }}
        >
          P26
        </div>
        <div style={{ display: "flex", fontSize: 31, fontWeight: 900, marginTop: 10 }}>
          P26
        </div>
      </div>
    ),
    size,
  );
}
