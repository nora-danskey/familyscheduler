const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  return new Promise((resolve) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            resolve({ statusCode: res.statusCode, body: JSON.stringify({ error: "Anthropic error", details: parsed }) });
          } else {
            resolve({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
          }
        } catch (e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Bad JSON from Anthropic", raw: data.slice(0, 200) }) });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });

    req.write(body);
    req.end();
  });
};
