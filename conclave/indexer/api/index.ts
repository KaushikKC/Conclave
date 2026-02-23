/**
 * Vercel serverless entry: forward all requests to the Express app.
 * Deploy the indexer from conclave/indexer with: vercel
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../index");

export default function handler(req: any, res: any) {
  // Vercel may mount at /api/index; strip so Express sees /rooms not /api/index/rooms
  const path = req.url?.replace(/^\/api\/index/, "") || "/";
  req.url = path || "/";
  return app(req, res);
}
