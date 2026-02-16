import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
const serverless = require('serverless-http');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;


app.use(express.static(join(__dirname, '../client')));
app.use(express.json());

app.get('/hello', (req, res) => res.json({ message: "Hello from Netlify!" }));

app.get('/api/mcqs', async (req, res) => {
  try {
    const data = await fs.readFile(join(__dirname, '../output/mcqs.json'), 'utf8');
    const mcqs = JSON.parse(data);
    res.json(mcqs);
  } catch (error) {
    console.error('Error loading MCQs:', error);
    res.status(500).json({ error: 'Failed to load MCQs' });
  }
});

app.get('/api/mcqs/:id', async (req, res) => {
  try {
    const data = await fs.readFile(join(__dirname, '../output/mcqs.json'), 'utf8');
    const mcqs = JSON.parse(data);
    const mcq = mcqs.find(m => m.id === parseInt(req.params.id));
    if (mcq) {
      res.json(mcq);
    } else {
      res.status(404).json({ error: 'MCQ not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load MCQ' });
  }
});
  
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    
    const data = await fs.readFile(join(__dirname, '../output/mcqs.json'), 'utf8');
    const mcqs = JSON.parse(data);
    
    const searchTerm = q.toLowerCase();
    const results = mcqs.filter(mcq => 
      mcq.question.toLowerCase().includes(searchTerm) ||
      (mcq.explanation && mcq.explanation.toLowerCase().includes(searchTerm)) ||
      Object.values(mcq.options).some(opt => opt.toLowerCase().includes(searchTerm))
    );
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 MCQ Viewer running at:`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n📚 View your MCQs in the browser!\n`);
});

module.exports.handler = serverless(app);
