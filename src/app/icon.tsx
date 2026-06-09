import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, #ecfdf5 0%, #ffffff 55%, #fff7d6 100%)",
          border: "18px solid #bbf7d0",
          borderRadius: 112,
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
            fontSize: 72,
            fontWeight: 900,
            height: 220,
            justifyContent: "center",
            lineHeight: 1,
            width: 220,
          }}
        >
          P26
        </div>
        <div style={{ display: "flex", fontSize: 90, fontWeight: 900, marginTop: 28 }}>
          P26
        </div>
      </div>
    ),
    size,
  );
}
