export const dynamic = "force-dynamic";
export async function GET() {
  const pages = Array.from({ length: 100 }, (_, i) => ({
    width: i % 2 ? 2384.3 : 3370.5, height: i % 2 ? 3370.5 : 2384.3,
  }));
  return Response.json({ versionId: "synthetic-a0-v1", pages },
    { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
