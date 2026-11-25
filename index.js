// Load variables from .env into process.env (locally only - on Render
// the variables come from the dashboard, and .env does not exist there).
require('dotenv').config({ quiet: true });

const express = require('express');

const app = express();

// Render tells us which port to listen on via the PORT env variable.
// Locally it falls back to 3000.
const PORT = process.env.PORT || 3000;

const RENDER_API_URL = 'https://api.render.com/v1/services';

// Health check - lets us (and Render) see that the service is alive.
app.get('/', (req, res) => {
  res.json({ message: 'Render Services API is running. Try GET /services' });
});

// Returns the list of services in the Render account.
// Add ?full=true to get the complete objects instead of the short version.
app.get('/services', async (req, res) => {
  const apiKey = process.env.RENDER_API_KEY;

  // 1. Fail fast if the key is missing - no point calling Render without it.
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing RENDER_API_KEY. Add it to .env (locally) or to Environment Variables (on Render).',
    });
  }

  try {
    // 2. Call the Render API with the key in the Authorization header.
    const response = await fetch(`${RENDER_API_URL}?limit=100`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000), // give up after 10 seconds
    });

    // 3. Render answered, but with an error status (401, 429, 500...).
    if (!response.ok) {
      const details = await response.text();
      const status = [401, 403, 429].includes(response.status) ? response.status : 502;
      return res.status(status).json({
        error: `Render API returned ${response.status} ${response.statusText}`,
        hint: response.status === 401 ? 'The API key is invalid or was revoked.' : undefined,
        details,
      });
    }

    // 4. Render returns an array of { cursor, service } objects.
    const data = await response.json();
    const services = data.map((item) => item.service);

    if (req.query.full === 'true') {
      return res.json({ count: services.length, services });
    }

    // 5. Short version - only the fields we care about.
    const short = services.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      url: s.serviceDetails?.url || null, // only web services / static sites have a URL
      dashboardUrl: s.dashboardUrl,
    }));

    res.json({ count: short.length, services: short });
  } catch (err) {
    // Network error, DNS failure, timeout...
    console.error('Failed to reach Render API:', err.message);
    res.status(502).json({ error: 'Could not reach Render API', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
