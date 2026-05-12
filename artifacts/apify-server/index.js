require('dotenv/config');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = '/apify-server';

app.use(cors());
app.use(express.json());

app.get([BASE, BASE + '/'], (req, res) => {
  res.send('Server is running');
});

app.post(BASE + '/get-images', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  const apifyUrl = process.env.APIFY_URL;
  if (!apifyUrl) {
    return res.status(500).json({ error: 'APIFY_URL environment variable is not set' });
  }

  try {
    const response = await axios.post(apifyUrl, {
      startUrls: [{ url }]
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: err.message };
    res.status(status).json(data);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
