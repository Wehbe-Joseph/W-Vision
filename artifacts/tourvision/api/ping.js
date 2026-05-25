/** Tiny probe — if this fails on Vercel, the /api folder is not deploying correctly. */
export default function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ pong: true, root: "tourvision" }));
}
