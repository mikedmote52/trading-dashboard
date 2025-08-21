import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({ error: 'Moved: use Express /api/discovery/contenders' });
}