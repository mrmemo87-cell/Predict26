import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, #f7faf8 0%, #ecfdf5 58%, #fff7d6 100%)",
          color: "#111827",
          display: "flex",
          fontFamily: "Arial, Helvetica, sans-serif",
          height: "100%",
          justifyContent: "center",
          padding: 70,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(90deg, rgba(22, 101, 52, 0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(22, 101, 52, 0.08) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            display: "flex",
            inset: 0,
            opacity: 0.85,
            position: "absolute",
          }}
        />
        <div
          style={{
            background: "rgba(34, 197, 94, 0.18)",
            borderRadius: 999,
            display: "flex",
            filter: "blur(2px)",
            height: 360,
            left: -90,
            position: "absolute",
            top: -110,
            width: 360,
          }}
        />
        <div
          style={{
            background: "rgba(187, 247, 208, 0.45)",
            borderRadius: 999,
            display: "flex",
            height: 440,
            position: "absolute",
            right: -120,
            top: 240,
            width: 440,
          }}
        />

        <div
          style={{
            background: "rgba(255, 255, 255, 0.9)",
            border: "3px solid #bbf7d0",
            borderRadius: 54,
            boxShadow: "0 30px 80px rgba(6, 78, 59, 0.14)",
            display: "flex",
            height: 490,
            padding: 38,
            position: "relative",
            width: 1060,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ alignItems: "center", display: "flex" }}>
              <div
                style={{
                  alignItems: "center",
                  background: "#ecfdf5",
                  border: "5px solid #bbf7d0",
                  borderRadius: 32,
                  display: "flex",
                  height: 144,
                  justifyContent: "center",
                  marginRight: 34,
                  width: 144,
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    background: "#047857",
                    borderRadius: 999,
                    color: "#d4af37",
                    display: "flex",
                    fontSize: 42,
                    fontWeight: 900,
                    height: 96,
                    justifyContent: "center",
                    lineHeight: 1,
                    width: 96,
                  }}
                >
                  P26
                </div>
              </div>
              <div
                style={{
                  color: "#064e3b",
                  display: "flex",
                  fontSize: 72,
                  fontWeight: 900,
                  letterSpacing: -2,
                }}
              >
                Predict26
              </div>
            </div>

            <div
              style={{
                color: "#111827",
                display: "flex",
                flexDirection: "column",
                fontSize: 66,
                fontWeight: 900,
                letterSpacing: -2,
                lineHeight: 1.12,
                marginTop: 54,
              }}
            >
              <div>Predict World Cup 2026</div>
              <div>&amp; Win Real Prizes</div>
            </div>

            <div
              style={{
                alignItems: "center",
                background: "#047857",
                borderRadius: 999,
                color: "#ffffff",
                display: "flex",
                fontSize: 30,
                fontWeight: 800,
                height: 58,
                marginTop: 48,
                paddingLeft: 28,
                width: 382,
              }}
            >
              <div
                style={{
                  background: "#34d399",
                  borderRadius: 999,
                  display: "flex",
                  height: 20,
                  marginRight: 18,
                  width: 20,
                }}
              />
              predict26.live
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              alignSelf: "center",
              background: "#064e3b",
              borderRadius: 999,
              color: "#d4af37",
              display: "flex",
              fontSize: 86,
              fontWeight: 900,
              height: 224,
              justifyContent: "center",
              lineHeight: 1,
              marginLeft: 24,
              width: 224,
            }}
          >
            P26
          </div>
        </div>
      </div>
    ),
    size,
  );
}
