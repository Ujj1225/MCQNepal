import fs from 'fs/promises';

const DEFAULT_MCQ_FILE = './mcqs.json';

export async function parseMCQsToJSON(geminiResponse, options = {}) {
  const {
    saveToFile = true,
    outputPath = DEFAULT_MCQ_FILE,
  } = options;

  try {
    const cleanedResponse = cleanGeminiResponse(geminiResponse);
    const newMcqs = extractMCQs(cleanedResponse);
    if (saveToFile && newMcqs.length > 0) {
      return await saveMCQsToFile(newMcqs, outputPath);
    }
    
    return newMcqs;
  } catch (error) {
    console.error('Error parsing MCQs:', error.message);
    return [];
  }
}

function cleanGeminiResponse(response) {
  return response
    .replace(/```json\n?/g, '') // Remove JSON code block markers
    .replace(/```\n?/g, '')      // Remove closing code block markers
    .replace(/^\s*{\s*"mcqs":\s*\[/i, '[') // Handle if wrapped in {"mcqs": [...]}
    .replace(/\s*}\s*$/g, '')     // Remove trailing object wrapper
    .trim();
}

function extractMCQs(text) {
  const mcqs = [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(mcq => standardizeMCQ(mcq));
    } else if (parsed.mcqs && Array.isArray(parsed.mcqs)) {
      return parsed.mcqs.map(mcq => standardizeMCQ(mcq));
    } else if (typeof parsed === 'object') {
      return [standardizeMCQ(parsed)];
    }
  } catch (e) {
    return extractMCQsFromText(text);
  }
  
  return mcqs;
}

function extractMCQsFromText(text) {
  const mcqs = [];
  
  const questionBlocks = text.split(/\*\*\d+\.\s+/).filter(block => block.trim());
  
  for (const block of questionBlocks) {
    const mcq = {
      question: null,
      options: {},
      correctAnswer: null,
      explanation: null
    };
    const lines = block.split('\n').filter(line => line.trim());
    
    if (lines.length > 0) {
      mcq.question = lines[0].replace(/\*\*/g, '').trim();
      const optionLines = lines.filter(line => line.match(/^[a-d]\./i));
      for (const line of optionLines) {
        const match = line.match(/^([a-d])\.\s*(.+)$/i);
        if (match) {
          const optionLetter = match[1].toUpperCase();
          const optionText = match[2].trim();
          mcq.options[optionLetter] = optionText;
        }
      }
      
      const answerLine = lines.find(line => line.toLowerCase().includes('answer:'));
      if (answerLine) {
        const answerMatch = answerLine.match(/answer:\s*([a-d])/i);
        if (answerMatch) {
          mcq.correctAnswer = answerMatch[1].toUpperCase();
        }
      }
      
      const explanationLine = lines.find(line => line.toLowerCase().includes('explanation:'));
      if (explanationLine) {
        mcq.explanation = explanationLine.replace(/explanation:/i, '').trim();
      }
      
      if (mcq.question && Object.keys(mcq.options).length > 0) {
        mcqs.push(standardizeMCQ(mcq));
      }
    }
  }
  
  return mcqs;
}

function standardizeMCQ(mcq) {
  return {
    id: null, 
    question: mcq.question || mcq.text || '',
    options: mcq.options || {},
    correctAnswer: mcq.correctAnswer || mcq.answer || mcq.correct_option || null,
    explanation: mcq.explanation || mcq.explanation_text || null,
    difficulty: mcq.difficulty || 'medium',
    tags: mcq.tags || []
  };
}

function isDuplicateMCQ(newMcq, existingMcqs) {
  const normalizeText = (text) => {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') 
      .replace(/\s+/g, ' ')    
      .trim();
  };
  
  const normalizedNewQuestion = normalizeText(newMcq.question);
  
  return existingMcqs.some(existing => 
    normalizeText(existing.question) === normalizedNewQuestion
  );
}

export async function saveMCQsToFile(newMcqs, filePath = DEFAULT_MCQ_FILE) {
  try {
    let existingMcqs = [];
    let addedCount = 0;
    let duplicateCount = 0;
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      existingMcqs = JSON.parse(fileContent);
      if (!Array.isArray(existingMcqs)) {
        existingMcqs = [existingMcqs];
      }
    } catch (e) {
      existingMcqs = [];
    }
    const uniqueNewMcqs = [];
    let nextId = existingMcqs.length > 0 
      ? Math.max(...existingMcqs.map(m => m.id)) + 1 
      : 1;
    
    for (const newMcq of newMcqs) {
      if (isDuplicateMCQ(newMcq, existingMcqs)) {
        duplicateCount++;
        continue;
      }
      newMcq.id = nextId++;
      uniqueNewMcqs.push(newMcq);
      addedCount++;
    }

    const allMcqs = [...existingMcqs, ...uniqueNewMcqs];
    
    await fs.writeFile(filePath, JSON.stringify(allMcqs, null, 2), 'utf8');
    
    console.log(`\n📊 MCQs Summary:`);
    console.log(`   - New MCQs found: ${newMcqs.length}`);
    console.log(`   - Duplicates skipped: ${duplicateCount}`);
    console.log(`   - New MCQs added: ${addedCount}`);
    console.log(`   - Total MCQs in database: ${allMcqs.length}`);
    console.log(`✅ MCQs saved to ${filePath}`);
    
    return uniqueNewMcqs;
  } catch (error) {
    console.error('Error saving MCQs to file:', error.message);
    return newMcqs;
  }
}

export async function getAllMCQs(filePath = DEFAULT_MCQ_FILE) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const mcqs = JSON.parse(fileContent);
    return Array.isArray(mcqs) ? mcqs : [];
  } catch (error) {
    return [];
  }
}

export async function getMCQById(id, filePath = DEFAULT_MCQ_FILE) {
  const mcqs = await getAllMCQs(filePath);
  return mcqs.find(mcq => mcq.id === id) || null;
}

export function formatMCQs(mcqs, format = 'json') {
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify(mcqs, null, 2);
    
    case 'csv':
      const headers = ['id', 'question', 'options', 'correctAnswer', 'explanation', 'difficulty'];
      const csvRows = [headers.join(',')];
      
      for (const mcq of mcqs) {
        const row = [
          mcq.id,
          `"${mcq.question.replace(/"/g, '""')}"`,
          `"${JSON.stringify(mcq.options).replace(/"/g, '""')}"`,
          mcq.correctAnswer || '',
          `"${(mcq.explanation || '').replace(/"/g, '""')}"`,
          mcq.difficulty
        ];
        csvRows.push(row.join(','));
      }
      
      return csvRows.join('\n');
    
    case 'readable':
      let output = '';
      mcqs.forEach((mcq, index) => {
        output += `\nMCQ #${mcq.id}:\n`;
        output += `Q: ${mcq.question}\n`;
        output += "Options:\n";
        Object.entries(mcq.options).forEach(([key, value]) => {
          output += `  ${key}: ${value}\n`;
        });
        output += `Answer: ${mcq.correctAnswer}\n`;
        if (mcq.explanation) {
          output += `Explanation: ${mcq.explanation}\n`;
        }
        output += "-".repeat(50) + "\n";
      });
      return output;
    
    default:
      return mcqs;
  }
}