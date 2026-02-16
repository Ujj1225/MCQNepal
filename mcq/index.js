// import { createWorker } from 'tesseract.js';

// (async () => {
//   const worker = await createWorker('eng');
//   const ret = await worker.recognize('./images/test.jpeg');
//   console.log(ret.data.text);
//   await worker.terminate();
// })();
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { createWorker } from 'tesseract.js';
// import 'dotenv/config';

// const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// async function extractText(imagePath) {
//   console.log("--- Starting OCR ---");
//   const worker = await createWorker('eng');
//   try {
//     const { data: { text } } = await worker.recognize(imagePath);
//     return text;
//   } catch (error) {
//     console.error("OCR Error:", error);
//     return null;
//   } finally {
//     await worker.terminate();
//   }
// }

// async function main() {
//   const rawText = await extractText('./images/test1.jpeg');

//   if (!rawText || rawText.trim().length === 0) {
//     console.log("No text extracted. Check your image path or quality.");
//     return;
//   }

//   console.log("--- Sending to Gemini ---");

//   const prompt = `
//     I have MCQs extracted from scanned text. 
//     There may be scanning errors. 
//     Please fix errors only where they exist, keep correct content unchanged, and lightly paraphrase the wording to make it original while preserving the meaning, then present everything in proper MCQ format.
    
//     TEXT:
//     ${rawText}
//   `;

//   try {
//     const result = await model.generateContent(prompt);
//     console.log("--- Refined MCQs ---");
//     console.log(result.response.text());
//   } catch (error) {
//     console.error("Gemini Error:", error.message);
//   }
// }

// main();

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWorker } from 'tesseract.js';
import 'dotenv/config';
import { parseMCQsToJSON, getAllMCQs, formatMCQs } from './mcq-parser.js';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview"})

async function extractText(imagePath) {
  console.log("--- Starting OCR ---");
  const worker = await createWorker('eng');
  try {
    const { data: { text } } = await worker.recognize(imagePath);
    return text;
  } catch (error) {
    console.error("OCR Error:", error);
    return null;
  } finally {
    await worker.terminate();
  }
}

async function main() {
  const imagePath = process.argv[2] || '../images/test1.jpeg';
  
  console.log(`\n🔍 Processing image: ${imagePath}\n`);
  
  const rawText = await extractText(imagePath);

  if (!rawText || rawText.trim().length === 0) {
    console.log("No text extracted. Check your image path or quality.");
    return;
  }

  console.log("--- Sending to Gemini ---");

  const prompt = `
You are an expert MCQ processor. I have extracted text from a scanned document containing multiple choice questions. 

The text is in this format:
**147. Question text here?**
a. Option A
b. Option B
c. Option C
d. Option D

**148. Next question text?**
a. Option A
b. Option B
c. Option C
d. Option D

TASKS:
1. Remove the question numbers (like "147.", "148.") - keep only the question text
2. Fix any OCR scanning errors in the questions and options
3. Provide the correct answer (A, B, C, or D) based on biological/medical knowledge
4. Provide a brief, educational explanation for why that answer is correct
5. Format each question as a complete MCQ with answer and explanation

IMPORTANT: Return the response as a VALID JSON array of objects with this exact structure:
[
  {
    "question": "In certain higher invertebrates, the specialized rasping organ located in the mouth is known as the:",
    "options": {
      "A": "Osphradium",
      "B": "Radula",
      "C": "Ctenidia",
      "D": "Organ of Bojanus"
    },
    "correctAnswer": "B",
    "explanation": "The radula is a chitinous, rasping organ found in mollusks used for feeding. Osphradium is a sensory organ, ctenidia are gills, and the organ of Bojanus is an excretory structure."
  }
]

DO NOT include any IDs in the response - IDs will be handled separately.
Return ONLY the JSON array, no additional text or markdown formatting.

Here is the extracted text:
${rawText}
`;

  try {
    const result = await model.generateContent(prompt);
    const geminiResponse = result.response.text();
    
    console.log("--- Parsing MCQs to JSON ---");
    
    const newMcqs = await parseMCQsToJSON(geminiResponse, {
      saveToFile: true,
      outputPath: '../output/mcqs.json'
    });
    
    if (newMcqs.length > 0) {
      console.log(`\n Successfully added ${newMcqs.length} new MCQs to database`);
      console.log("\n--- Newly Added MCQs ---");
      newMcqs.forEach((mcq) => {
        console.log(`\nMCQ #${mcq.id}:`);
        console.log(`Q: ${mcq.question.substring(0, 100)}...`);
        console.log(`Answer: ${mcq.correctAnswer}`);
      });
      const allMcqs = await getAllMCQs('../output/mcqs.json');
      console.log(`\n TotalMCQs in database: ${allMcqs.length}`);
      
    } else {
      console.log("\n o new MCQs were added (either parsing failed or all were duplicates)");
    }
    
  } catch (error) {
    console.error("Gemini Error:", error.message);
  }
}

main();