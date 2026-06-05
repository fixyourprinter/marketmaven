const axios = require('axios');
const fs = require('fs');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const VISION_MODEL = process.env.VISION_MODEL || 'llava';

async function processImages(imagePaths) {
  console.log(`[AIService] processImages starting... Using model: "${VISION_MODEL}" on Ollama URL: "${OLLAMA_URL}"`);
  try {
    const imagesBase64 = imagePaths.map(path => {
      return fs.readFileSync(path, { encoding: 'base64' });
    });

    const prompt = `
      Analyze these images of a clothing item. The images include a cover shot, a size/brand tag shot, and a third shot showing the item's weight (e.g., on a shipping scale) and its SKU barcode label.
      Extract information following these rules and return a JSON object:

      RULES:
      1. TITLE: Max 80 chars. Creative, descriptive title. E.g., Brand + Type of Item + Gender/Size + Color/Wash + Relevant Keywords (e.g. Baggy Utility Denim Pants).
      2. CONDITION: Format: "Preowned condition. Please review all photos for details and measurements." Add specific visible flaws or "NWT" (New With Tags) if seen in the photos.
      3. MATERIAL: List fabric content from the tag if visible. If not shown or unreadable, return "Material tag not shown in photos." or "Material tag is missing or unreadable."
      4. MEASUREMENTS_NOTE: Read the size tags (including international sizes like AU/US/EU if shown). Since ruler measurements are not provided, estimate typical measurements for this size and brand, or instruct the buyer to compare with a similar item. Format exactly like this: "Tagged size [list all tag sizes]. Please compare measurements to a similar item you own before purchasing."
      5. STYLE_DETAILS: Provide a comma-separated list of descriptive keywords and style tags (e.g., style, garment details, texture, fit, pattern, closure, rise, occasion). E.g. "Women’s jeans, light wash denim, carpenter jeans, utility style, relaxed leg, baggy fit, wide leg".
      6. COUNTRY_OF_ORIGIN: Return the country name (e.g. "Bangladesh") or "Unknown".
      7. AGE: "Modern / not vintage" or the era (Y2K, 90s, 80s, etc.) based on style and tag.
      8. RETAIL_PRICE: Suggest a resale range (e.g., "$18–$28") based on typical eBay sold comps for this brand/item.
      9. ETSY_TAGS: Provide exactly 13 Poshmark style tags, comma-separated, each under 20 characters (e.g., "Womens Jeans, Cotton On, Carpenter Jeans, Size 4").
      10. WEIGHT: Look at the third photo (scale reading) and extract the weight. E.g. "1.2" (in lbs).
      11. INVENTORY_CODE: Look at the third photo (printed barcode/SKU) and extract the alphanumeric SKU code. E.g. "LM-123456" or similar.

      JSON STRUCTURE:
      {
        "title": "...",
        "brand": "...",
        "size": "...",
        "condition": "...",
        "material": "...",
        "measurements_note": "...",
        "style_details": "...",
        "country_of_origin": "...",
        "age": "...",
        "retail_price": "...",
        "etsy_tags": "...",
        "weight": "...",
        "inventory_code": "..."
      }

      Respond ONLY with the JSON object.
    `;

    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: imagesBase64.slice(0, 3)
        }
      ],
      stream: false,
      format: 'json',
      options: {
        num_ctx: 16384 // Set context size to 16k to comfortably fit multiple high-res vision tokens
      }
    }, {
      timeout: 180000 // 3 minute timeout for complex logic
    });

    return JSON.parse(response.data.message.content);
  } catch (error) {
    if (error.response) {
      console.error('Ollama Error Response:', error.response.data);
    }
    console.error('Error processing images with Ollama:', error.message);
    throw new Error('AI processing failed');
  }
}

module.exports = { processImages };
