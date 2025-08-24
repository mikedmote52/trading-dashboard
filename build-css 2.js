#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { compile } = require('tailwindcss');

async function buildCSS() {
  try {
    const inputPath = path.join(__dirname, 'public/tw.css');
    const outputPath = path.join(__dirname, 'public/assets/tailwind.css');
    const configPath = path.join(__dirname, 'tailwind.config.js');
    
    const inputCSS = fs.readFileSync(inputPath, 'utf8');
    const config = require(configPath);
    
    const compiledCSS = await compile(inputCSS, { config });
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, compiledCSS);
    
    console.log('✅ Tailwind CSS compiled successfully');
    console.log(`📁 Output: ${outputPath}`);
    console.log(`📏 Size: ${(compiledCSS.length / 1024).toFixed(2)}KB`);
  } catch (error) {
    console.error('❌ Failed to compile CSS:', error.message);
    process.exit(1);
  }
}

buildCSS();