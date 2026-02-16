import express from 'express';
import serverless from 'serverless-http';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const router = express.Router();

const getMcqPath = () => {
  const localPath = path.join(process.cwd(), 'output', 'mcqs.json');
  
  const deployedPath = path.join('/var/task', 'output', 'mcqs.json');

  console.log('Environment:', process.env.NODE_ENV);
  console.log('Local path:', localPath);
  console.log('Deployed path:', deployedPath);
  return localPath;
};

app.use(express.json());

router.get('/hello', (req, res) => res.json({ message: "Hello from Netlify!" }));

router.get('/mcqs', async (req, res) => {
  try {
    const filePath = getMcqPath();
    console.log("Reading file from:", filePath);
    
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: error.message,
      path: getMcqPath(),
      cwd: process.cwd(),
      files: await getDirectoryContents(process.cwd())
    });
  }
});


async function getDirectoryContents(dir) {
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file'
    }));
  } catch (error) {
    return `Cannot read directory: ${error.message}`;
  }
}

router.get('/debug', async (req, res) => {
  const debug = {
    cwd: process.cwd(),
    rootContents: await getDirectoryContents(process.cwd()),
    outputPath: getMcqPath(),
    env: process.env.NODE_ENV
  };
  res.json(debug);
});

app.use('/.netlify/functions/api', router);

export const handler = serverless(app);