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

// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { createWorker } from 'tesseract.js';
// import 'dotenv/config';
// import { parseMCQsToJSON, getAllMCQs, formatMCQs } from './mcq-parser.js';

// const genAI = new GoogleGenerativeAI(process.env.API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview"})

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
//   const imagePath = process.argv[2] || '../images/test1.jpeg';

//   console.log(`\n🔍 Processing image: ${imagePath}\n`);

//   const rawText = await extractText(imagePath);

//   if (!rawText || rawText.trim().length === 0) {
//     console.log("No text extracted. Check your image path or quality.");
//     return;
//   }

//   console.log("--- Sending to Gemini ---");

//   const prompt = `
// You are an expert MCQ processor. I have extracted text from a scanned document containing multiple choice questions. 

// The text is in this format:
// **147. Question text here?**
// a. Option A
// b. Option B
// c. Option C
// d. Option D

// **148. Next question text?**
// a. Option A
// b. Option B
// c. Option C
// d. Option D

// TASKS:
// 1. Remove the question numbers (like "147.", "148.") - keep only the question text
// 2. Fix any OCR scanning errors in the questions and options
// 3. Provide the correct answer (A, B, C, or D)
// 4. Provide a brief, educational explanation for why that answer is correct
// 5. Format each question as a complete MCQ with answer and explanation

// IMPORTANT: Return the response as a VALID JSON array of objects with this exact structure:
// [
//   {
//     "question": "In certain higher invertebrates, the specialized rasping organ located in the mouth is known as the:",
//     "options": {
//       "A": "Osphradium",
//       "B": "Radula",
//       "C": "Ctenidia",
//       "D": "Organ of Bojanus"
//     },
//     "correctAnswer": "B",
//     "explanation": "The radula is a chitinous, rasping organ found in mollusks used for feeding. Osphradium is a sensory organ, ctenidia are gills, and the organ of Bojanus is an excretory structure."
//   }
// ]

// DO NOT include any IDs in the response - IDs will be handled separately.
// Return ONLY the JSON array, no additional text or markdown formatting.

// Here is the extracted text:
// ${rawText}
// `;

//   try {
//     const result = await model.generateContent(prompt);
//     const geminiResponse = result.response.text();
    
//     console.log("--- Parsing MCQs to JSON ---");
    
//     const newMcqs = await parseMCQsToJSON(geminiResponse, {
//       saveToFile: true,
//       outputPath: '../output/mcqs.json'
//     });

//     if (newMcqs.length > 0) {
//       console.log(`\n Successfully added ${newMcqs.length} new MCQs to database`);
//       console.log("\n--- Newly Added MCQs ---");
//       newMcqs.forEach((mcq) => {
//         console.log(`\nMCQ #${mcq.id}:`);
//         console.log(`Q: ${mcq.question.substring(0, 100)}...`);
//         console.log(`Answer: ${mcq.correctAnswer}`);
//       });
//       const allMcqs = await getAllMCQs('../output/mcqs.json');
//       console.log(`\n TotalMCQs in database: ${allMcqs.length}`);

//     } else {
//       console.log("\n o new MCQs were added (either parsing failed or all were duplicates)");
//     }

//   } catch (error) {
//     console.error("Gemini Error:", error.message);
//   }
// }

// main();


import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWorker } from 'tesseract.js';
import 'dotenv/config';
import { parseMCQsToJSON, getAllMCQs } from './mcq-parser.js'; 
import sharp from 'sharp'; 
import fs from 'fs/promises'; 
import path from 'path'; 

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

async function extractText(imagePath) {
  console.log("--- Starting Enhanced OCR for Multi-Column Image ---");
  
  const tempDir = path.join(path.dirname(imagePath), 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const processedPath = path.join(tempDir, `processed_${Date.now()}.jpg`);
  
  let worker = null;
  
  try {
    console.log("Preprocessing image...");
    await sharp(imagePath)
      .grayscale()                    
      .normalise()                     
      .median(3)                       
      .threshold(150)                   
      .sharpen()                        
      .toFile(processedPath);
    
    console.log("✅ Image preprocessed");

    worker = await createWorker('eng');
    
    const psms = [
      { mode: '11', name: 'Sparse text (best for multi-column)' },
      { mode: '6', name: 'Uniform block' },
      { mode: '4', name: 'Single column' },
      { mode: '3', name: 'Automatic' }
    ];
    
    let bestText = '';
    let maxLength = 0;
    
    for (const psm of psms) {
      console.log(`Trying PSM ${psm.mode}: ${psm.name}`);

      await worker.setParameters({
        tessedit_pageseg_mode: psm.mode,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?-()[]{} '
      });

      const { data: { text } } = await worker.recognize(processedPath);

      const cleanedText = text
        .replace(/\s+/g, ' ')          
        .replace(/[^\S\r\n]+/g, ' ')    
        .trim();

      const lines = cleanedText.split('\n').filter(l => l.length > 10);
      const score = lines.length * 10 + cleanedText.length;
      
      console.log(`   Found ${lines.length} lines, ${cleanedText.length} chars`);
      
      if (score > maxLength) {
        maxLength = score;
        bestText = cleanedText;
        console.log(`   ✅ This is the best result so far`);
      }
    }

    const finalText = bestText
      .replace(/(\d+)\.\s+/g, '\n$1. ')  
      .replace(/[•●]/g, '')               
      .replace(/\n{3,}/g, '\n\n')         
      .trim();
    
    console.log(`\n✅ OCR Complete! Extracted ${finalText.split('\n').length} lines`);
    
    return finalText;
    
  } catch (error) {
    console.error("OCR Error:", error);
    return null;
  } finally {
    if (worker) {
      await worker.terminate();
    }
    try {
      await fs.unlink(processedPath).catch(() => {});
      await fs.rmdir(tempDir).catch(() => {});
    } catch (e) {

    }
  }
}

async function main() {
  const imagePath = process.argv[2] || '../images/test.jpeg';

  console.log(`\n🔍 Processing image: ${imagePath}\n`);

  const rawText = await extractText(imagePath);

  if (!rawText || rawText.trim().length === 0) {
    console.log("No text extracted. Check your image path or quality.");
    return;
  }
  console.log("\n--- Extracted Text Preview ---");
  console.log(rawText.substring(0, 500) + "...\n");
  console.log(`Total characters: ${rawText.length}`);

  console.log("--- Sending to Gemini ---");

  const prompt = `
You are an expert MCQ processor. I have extracted text from a scanned document containing multiple choice questions. 

The text might be from a multi-column layout, so some questions might appear out of order. Please reorder them correctly by question number.

The text is in this format (but may have OCR errors):
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
3. Provide the correct answer (A, B, C, or D)
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
      console.log(`\n✅ Successfully added ${newMcqs.length} new MCQs to database`);
      console.log("\n--- Newly Added MCQs ---");
      newMcqs.forEach((mcq) => {
        console.log(`\nMCQ #${mcq.id}:`);
        console.log(`Q: ${mcq.question.substring(0, 100)}...`);
        console.log(`Answer: ${mcq.correctAnswer}`);
      });
      const allMcqs = await getAllMCQs('../output/mcqs.json');
      console.log(`\n📊 Total MCQs in database: ${allMcqs.length}`);

    } else {
      console.log("\n⚠️ No new MCQs were added (either parsing failed or all were duplicates)");
    }

  } catch (error) {
    console.error("Gemini Error:", error.message);
  }
}

main();