import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    app: "GoalSense",
    version: "1.0.0",
    dataMode: process.env.DATA_MODE || "real",
    providers: {
      apiFootballConfigured: Boolean(process.env.API_FOOTBALL_KEY),
      footballDataConfigured: Boolean(process.env.FOOTBALL_DATA_API_KEY),
    },
    firebase: {
      configured: Boolean(process.env.VITE_FIREBASE_PROJECT_ID),
    },
    timestamp: new Date().toISOString(),
  })
}
