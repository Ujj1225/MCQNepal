import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MCQ_FILE = join(__dirname, '../output/mcqs.json');

function normalizeText(text) {
  return text
    .toLowerCase()
    // Remove all punctuation and special characters
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?:"']/g, '')
    // Remove common articles, prepositions, and filler words
    .replace(/\b(the|a|an|in|on|at|for|to|of|with|by|is|are|was|were|has|have|had|be|been|being|this|that|these|those|which|what|who|whom|whose|there|here|during|especially|typical|primary|following|known|called|named|termed)\b/g, '')
    // Remove all spaces to compare core content
    .replace(/\s+/g, '')
    .trim();
}

function extractCoreKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?:"']/g, '')
    .split(' ')
    .filter(word => word.length > 3) // Keep only significant words
    .filter(word => !['the', 'and', 'for', 'with', 'that', 'this', 'have', 'from', 'they', 'their', 'which', 'what', 'during', 'especially', 'typical', 'primary', 'following'].includes(word))
    .join(' ');
}

function calculateSimilarity(str1, str2) {
  const keywords1 = new Set(extractCoreKeywords(str1).split(' '));
  const keywords2 = new Set(extractCoreKeywords(str2).split(' '));
  
  const keywordIntersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const keywordUnion = new Set([...keywords1, ...keywords2]);
  
  const keywordSimilarity = keywordUnion.size > 0 ? keywordIntersection.size / keywordUnion.size : 0;

  const norm1 = normalizeText(str1);
  const norm2 = normalizeText(str2);
  

  const contains = norm1.includes(norm2) || norm2.includes(norm1);
  
  // Levenshtein-like simple ratio
  const minLength = Math.min(norm1.length, norm2.length);
  const maxLength = Math.max(norm1.length, norm2.length);
  let matches = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (norm1[i] === norm2[i]) matches++;
  }
  
  const charSimilarity = matches / maxLength;
 
  return {
    keywordScore: keywordSimilarity,
    contains: contains,
    charScore: charSimilarity,
    combined: Math.max(
      keywordSimilarity * 1.2, 
      contains ? 0.9 : 0,
      charSimilarity * 1.1
    )
  };
}

function areQuestionsSimilar(q1, q2) {
  const similarity = calculateSimilarity(q1, q2);
  
  return (
    similarity.combined > 0.65 || // Lowered from 0.85
    similarity.keywordScore > 0.6 || // High keyword overlap
    similarity.contains || // One contains the other
    similarity.charScore > 0.7 // Character match
  );
}

function scoreExplanation(explanation) {
  if (!explanation) return 0;
  
  let score = 0;
  

  const wordCount = explanation.split(' ').length;
  if (wordCount > 30) score += 5;
  else if (wordCount > 20) score += 4;
  else if (wordCount > 15) score += 3;
  else if (wordCount > 10) score += 2;
  else if (wordCount > 5) score += 1;
  
  const scientificTerms = [
    'because', 'therefore', 'thus', 'hence',
    'mechanism', 'process', 'function',
    'results', 'causes', 'leads to',
    'specifically', 'meaning', 'refers to',
    'characterized by', 'known as'
  ];
  
  for (const term of scientificTerms) {
    if (explanation.toLowerCase().includes(term)) {
      score += 2;
      break;
    }
  }
  
  if (explanation.includes(':') || explanation.includes(' - ')) score += 1;
  if (explanation.includes('(') && explanation.includes(')')) score += 1; // Has scientific names
  if (explanation.match(/\b[A-Z][a-z]+ (et al\.|[A-Z][a-z]+)\b/)) score += 2; // Has scientific names
  
  return score;
}

function chooseBestMCQ(mcqs) {
  if (mcqs.length === 1) return mcqs[0];
  
  // Sort by explanation quality and completeness
  const scored = mcqs.map(m => ({
    ...m,
    score: scoreExplanation(m.explanation)
  }));
  
  scored.sort((a, b) => {
    // First by explanation score
    if (a.score !== b.score) return b.score - a.score;
    
    // Then by options completeness
    const aOpts = Object.keys(a.options).length;
    const bOpts = Object.keys(b.options).length;
    if (aOpts !== bOpts) return bOpts - aOpts;
    
    // Then by ID (prefer older)
    return a.id - b.id;
  });
  
  return scored[0];
}

/**
 * Group similar MCQs together (aggressive grouping)
 */
function groupSimilarMCQs(mcqs) {
  const groups = [];
  const processed = new Set();
  
  for (let i = 0; i < mcqs.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [mcqs[i]];
    processed.add(i);
    
    for (let j = i + 1; j < mcqs.length; j++) {
      if (processed.has(j)) continue;
      
      if (areQuestionsSimilar(mcqs[i].question, mcqs[j].question)) {
        group.push(mcqs[j]);
        processed.add(j);
      }
    }
    
    // Check if any remaining items are similar to any in the group
    let foundMore;
    do {
      foundMore = false;
      for (let j = 0; j < mcqs.length; j++) {
        if (processed.has(j)) continue;
        
        for (const member of group) {
          if (areQuestionsSimilar(member.question, mcqs[j].question)) {
            group.push(mcqs[j]);
            processed.add(j);
            foundMore = true;
            break;
          }
        }
      }
    } while (foundMore);
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Merge explanations intelligently
 */
function mergeExplanations(explanations) {
  const uniqueExplanations = [...new Set(explanations.filter(e => e))];
  
  if (uniqueExplanations.length <= 1) {
    return uniqueExplanations[0] || '';
  }
  
  // Split into sentences and collect unique ones
  const allSentences = new Set();
  const scientificTerms = new Set();
  
  uniqueExplanations.forEach(exp => {
    // Extract scientific names (words in parentheses or capitalized)
    const sciMatches = exp.match(/\([^)]+\)|\b[A-Z][a-z]+ (?:et al\.|[A-Z][a-z]+)\b/g);
    if (sciMatches) {
      sciMatches.forEach(m => scientificTerms.add(m));
    }
    
    const sentences = exp.split(/[.!?]+/).filter(s => s.trim().length > 5);
    sentences.forEach(s => allSentences.add(s.trim()));
  });
  
  // Build comprehensive explanation
  let combined = Array.from(allSentences).join('. ') + '.';
  
  // Add scientific terms if not already included
  if (scientificTerms.size > 0) {
    const termsStr = Array.from(scientificTerms).join(', ');
    if (!combined.includes(termsStr)) {
      combined += ` (${termsStr})`;
    }
  }
  
  return combined;
}

/**
 * Main deduplication function
 */
async function deduplicateMCQs() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 MCQ DEDUPLICATION ENGINE");
  console.log("=".repeat(70));

  try {
    const data = await fs.readFile(MCQ_FILE, 'utf8');
    const allMcqs = JSON.parse(data);
    
    console.log(`\n📊 Initial database: ${allMcqs.length} MCQs\n`);

    allMcqs.sort((a, b) => a.id - b.id);
    
    console.log("📌 Analyzing similarities aggressively...");
    const groups = groupSimilarMCQs(allMcqs);
    
    console.log(`   Found ${groups.length} unique question groups`);
    console.log(`   Identified ${allMcqs.length - groups.length} potential duplicates\n`);

    const uniqueMcqs = [];
    const removedDuplicates = [];
    const mergedExplanations = [];

    for (const group of groups) {
      if (group.length === 1) {
        uniqueMcqs.push(group[0]);
      } else {
        console.log(`\n⚠️  Found ${group.length} similar MCQs:`);
        
        group.forEach((mcq, idx) => {
          const expScore = scoreExplanation(mcq.explanation);
          console.log(`   ${idx === 0 ? '┌─' : '├─'} ID ${mcq.id}: ${mcq.question.substring(0, 60)}...`);
          console.log(`   │  📝 Explanation score: ${expScore}/15`);
        });

        const bestMCQ = chooseBestMCQ(group);
        
        // Merge explanations
        const allExplanations = group.map(m => m.explanation).filter(e => e);
        if (allExplanations.length > 1) {
          const combinedExp = mergeExplanations(allExplanations);
          if (combinedExp.length > (bestMCQ.explanation?.length || 0)) {
            bestMCQ.explanation = combinedExp;
            mergedExplanations.push({
              id: bestMCQ.id,
              original: group.map(m => m.id).join(', ')
            });
          }
        }

        uniqueMcqs.push(bestMCQ);
        
        group.forEach(m => {
          if (m.id !== bestMCQ.id) {
            removedDuplicates.push(m);
          }
        });

        console.log(`   └─▶ ✅ Keeping ID ${bestMCQ.id} (score: ${scoreExplanation(bestMCQ.explanation)}/15)`);
      }
    }

    // Sort by original ID and renumber
    uniqueMcqs.sort((a, b) => a.id - b.id);
    
    console.log("\n📋 Renumbering IDs sequentially...");
    const finalMcqs = uniqueMcqs.map((mcq, index) => {
      mcq.id = index + 1;
      return mcq;
    });

    await fs.writeFile(MCQ_FILE, JSON.stringify(finalMcqs, null, 2), 'utf8');

    console.log("\n" + "=".repeat(70));
    console.log("📊 DEDUPLICATION SUMMARY");
    console.log("=".repeat(70));
    console.log(`📈 Before: ${allMcqs.length} MCQs`);
    console.log(`📉 After : ${finalMcqs.length} MCQs`);
    console.log(`🗑️  Removed: ${allMcqs.length - finalMcqs.length} duplicates`);
    console.log(`🔢 New ID range: 1 - ${finalMcqs.length}`);
    
    if (removedDuplicates.length > 0) {
      console.log("\n📌 Removed Duplicates:");
      removedDuplicates.forEach((dup, i) => {
        console.log(`   ${i+1}. ID ${dup.id}: ${dup.question.substring(0, 70)}...`);
      });
    }

    if (mergedExplanations.length > 0) {
      console.log("\n🔄 Enhanced Explanations:");
      mergedExplanations.forEach(item => {
        console.log(`   • MCQ #${item.id} (merged from IDs: ${item.original})`);
      });
    }

    const avgExplanationLength = finalMcqs.reduce((sum, m) => 
      sum + (m.explanation?.split(' ').length || 0), 0) / finalMcqs.length;
    
    console.log("\n📊 Quality Metrics:");
    console.log(`   • Average explanation length: ${Math.round(avgExplanationLength)} words`);
    console.log(`   • MCQs with explanations: ${finalMcqs.filter(m => m.explanation).length}/${finalMcqs.length}`);

    console.log("\n✅ Aggressive deduplication complete!\n");

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

/**
 * Preview duplicates
 */
async function previewDuplicates() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 AGGRESSIVE PREVIEW MODE");
  console.log("=".repeat(70));

  try {
    const data = await fs.readFile(MCQ_FILE, 'utf8');
    const allMcqs = JSON.parse(data);
    
    console.log(`\n📊 Current database: ${allMcqs.length} MCQs\n`);

    allMcqs.sort((a, b) => a.id - b.id);
    const groups = groupSimilarMCQs(allMcqs);
    
    let duplicateCount = 0;

    for (const group of groups) {
      if (group.length > 1) {
        console.log(`\n📌 Group (${group.length} similar MCQs):`);
        group.forEach((mcq, idx) => {
          const similarity = idx > 0 ? calculateSimilarity(group[0].question, mcq.question) : null;
          console.log(`   ${idx + 1}. ID ${mcq.id}:`);
          console.log(`      Q: ${mcq.question.substring(0, 80)}...`);
          if (similarity) {
            console.log(`      📊 Similarity: ${Math.round(similarity.combined * 100)}%`);
          }
          console.log(`      📝 Explanation score: ${scoreExplanation(mcq.explanation)}/15`);
        });
        duplicateCount += group.length - 1;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📊 PREVIEW SUMMARY");
    console.log("=".repeat(70));
    console.log(`📈 Total MCQs: ${allMcqs.length}`);
    console.log(`🗑️  Duplicates to remove: ${duplicateCount}`);
    console.log(`📉 Estimated final count: ${allMcqs.length - duplicateCount}`);
    ``
    if (duplicateCount === 0) {
      console.log("\n✅ No duplicates found!");
    } else {
      console.log("\n💡 Run 'npm run deduplicate' to remove these duplicates.");
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Command line interface
async function main() {
  const command = process.argv[2] || 'run';
  
  switch (command) {
    case 'preview':
      await previewDuplicates();
      break;
    case 'run':
    case 'deduplicate':
      await deduplicateMCQs();
      break;
    case 'help':
      console.log(`
📚 Aggressive MCQ Deduplication Tool

Usage:
  node deduplicate.js [command]

Commands:
  preview     - Preview duplicates (70%+ similarity)
  run         - Run aggressive deduplication (default)
  help        - Show this help

Threshold: 65% similarity (was 85%)
      `);
      break;
    default:
      console.log(`Unknown command: ${command}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { deduplicateMCQs, previewDuplicates };