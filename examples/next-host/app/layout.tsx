import "@tpdf/pdf-editor/style.css";
import type { ReactNode } from "react";
export const metadata = { title: "TPDF Next.js host adapter example" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, fontFamily: "system-ui" }}>{children}</body></html>;
}
