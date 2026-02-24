export default async function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({ 
    hasKey: !!apiKey, 
    keyStart: apiKey ? apiKey.substring(0, 10) : "none",
    keyLength: apiKey ? apiKey.length : 0
  });
}
