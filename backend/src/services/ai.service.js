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
      Analyze these images of a clothing item. The images include a cover shot (front of the item), a material tag shot (fabric contents & origin), and a size/brand tag shot.
      Extract information following these rules and return a JSON object:

      RULES:
      1. TITLE: Exactly 80 characters or as close to 80 characters as possible (do not exceed 80).
         The order of the title MUST be: Brand, Type (e.g. Sweater, Jeans, T-Shirt, Jacket), Gender, Size, Style (e.g. Cable Knit, Distressed, Light Wash), and relevant keywords from the lists below based on the item's style.
         CRITICAL: Do NOT use commas in the title. Separator must be spaces only. Try to maximize title length up to 80 characters using keywords.
         Select relevant keywords from these categories:
         - CLOSURE: Buckle, Button, Drawstring, Hook & Eye, Hook & Loop, Lace up, Magnetic, Pullover, Snap, Tie, Zip
         - COLORS: Buttery Yellow, Eggplant Purple, Kelly Green, Petal Pink, Pistachio Green, Plum Purple, Powder Pink, Sage Green
         - FABRIC TYPE: Canvas, Chambray, Chiffon, Corduroy, Crochet, Damask, Denim, Flannel, Fleece, French Terry, Jacquard, Jersey, Knit, Lace, Latex, Mesh, Microfiber, Rayon, Satin, Shearling, Terry, Tulie, Tweed, Velour, Velvet, Woven
         - NECKLINE: Sweetheart, V Neck, Waterfall
         - PATTERN: Animal Print, Argyle/diamond, Batik, Camouflage, Check, Chevron, Color Block, Fair Isle, Floral, Geometric (geo), Gingham, Herringbone, Houndstooth, Paisley, Patchwork, Plaid, Polka Dot, Solid, Striped, Tie Dye
         - SLEEVE: Asymmetrical, Balloon, Bell, Cap, Cold Shoulder, Dolman, Flared, Flutter, Kimono, Off the Shoulder, One Shoulder, Puff, Raglan, Roll Tab, Slit, Strapless, Strappy
         - WAIST: Babydoll, Drop Waist, Empire Waist
         - THEMES/AESTHETICS:
           * TV: Bridgerton, Clueless, Friends, Gilmore Girls, Gossip Girl, Mean Girls, New Girl, Vampire Diaries
           * Spring: Rain, Flowers, Pastel, Easter, Floral, Bloomcore, Colorful, Soft girl
           * Summer: Iridescent, Vacation, Swim, Travel, Mermaid, Nautical, Boat, Sea, Island, Beach, Fisherman, Navy, Tropical, Sailor, Stripes
           * Fall: Halloween, Thanksgiving, Autumn, Cool weather, Cozy, Comfy
           * Winter: Cold weather, Holidays, Christmas, Layers, Cozy
           * Eras: Retro, Y2K, 70s, 80s, 90s, 90s Urban, Vintage, Pinup, Disco
           * Romantic: Romantic, Regency (core), Soft, Ethereal, Royalcore, Sheer, Victorian, Natural, Dainty, Prairie, Angel core, Soft Girl, Coquette, Fairy, Whimsical, Whimsy, Balletcore, Renaissance, Cottagecore, Feminine, Milkmaid
           * Military/Structured: Military, Corporeal, Army, Double Breasted, Field, Structured, Gorpcore
           * Kidcore/Nostalgia: Kidcore, Pride, Cartoon, Twee, Cosplay, Nostalgia, Kawaii, Anime, Clowncore, E-Girl, rainbow
           * Eco/Earthy: Nature, Organic, Ethical, Herbalist, Eco Friendly, Earthy, Sustainable
           * Goth/Grunge: Goth, Victorian, Punk, Devilcore, Alternative, Steampunk, Whimisgoth, Emo, Witchy, E-Girl, Cyber, Biker, Baddie, Leather, Racer, Rugged, Moto, Rockability, Grunge, Rocker, Edgy, Distressed, Androgynous, Fairy Grunge
           * Minimalist/Basic: Streetwear, Hip Hop, Babydoll, Normcore, Staple, Lounge, Everyday, Timeless, Capsule, Minimalist, Neutral, Basic, Essential, French, Simple, Casual, Modest
           * Academia/Preppy: Academia, Schoolgirl, Ivy League, Old Money, Dark Academia, University, Scholar, Professor, Preppy, Shakespeare, Nerd, Twee, Officecore, Boardroom chic, Corpcore, Office Sire, Prep (school), Quiet Luxury, Business Casual, Work, Career, Business, Corporate, Formal, Professional, Sophisticated, Artsy, Futuristic, Avant Garde, Multicolor, Rare, Kaleidoscope, Eclectic, Wacky, Art to wear, Unique, Hippie
           * Outdoors: Outdoors, Trails, Hiking, Utility, Walking, Windproof, Camping, Waterproof, Rugged, Tactical, Gorpcore, Granola
           * Bohemian: Bohemian, Gypsy, Editorial, Celestial, Sun, Flowers, Moon, Festival, Stars, Cottagecore, Peasant, Scandi, Patchwork
           * Athleisure: Athleisure, Dance, Athletic, Sport, Lifting, Gym, Workout, Running, Exercise, Training, Fitness
           * Western/Country: Barn, Fringe, Ranch, Southwestern, Western, Rodeo, Cowboy, Cowgirl, Equestrian, Chore, Aztec, Serape
           * Intimates: Intimates, Feminine, Sexy, Lacey, Lacy, Wireless, Wired
           * Occasion: Event, NYE, Holiday, Glam, Elegant, Bling, Cocktail, LBD, LWD, Rave, Coachella, Wedding Guest, Bridesmaid, Bride

      2. CONDITION: Format: "Excellent preowned condition, no stains or tears - please see pictures for details" if no flaws are visible. If you see specific flaws (e.g. stains, tears, fraying, fading), describe them clearly (e.g., "Preowned condition, has a small stain on the left sleeve - please see pictures"). If it is brand new with tags, use "NWT (New with tags) - please see pictures".
      3. MATERIAL: List fabric content from the tag if visible. If not shown or unreadable, return "Material tag not shown in photos." or "Material tag is missing or unreadable."
      4. MEASUREMENTS_NOTE: Read the size tags (including international sizes like AU/US/EU if shown). Since ruler measurements are not provided, estimate typical measurements for this size and brand, or instruct the buyer to compare with a similar item. Format exactly like this: "Tagged size [list all tag sizes]. Please compare measurements to a similar item you own before purchasing."
      5. STYLE_DETAILS: Provide a comma-separated list of descriptive keywords, style tags, and key-value aspect pairs. Format all key-value pairs with a colon (e.g., "Key: Value") so our backend parser can extract them.
         CRITICAL: Scan carefully and output the following key-value pairs whenever applicable:
         - Closure: (e.g. Button, Zip, Pull On, Snaps, Drawstring)
         - Fabric Wash: (e.g. Dark, Medium, Light, Acid Wash, Distressed)
         - Rise: (e.g. Low, Mid, High)
         - Waist Size: (For jeans/pants/skirts, estimate in inches, e.g. "32 in")
         - Inseam: (For jeans/pants, estimate in inches, e.g. "28 in")
         - Garment Care: (e.g. Machine Washable, Hand Wash, Dry Clean Only)
         - Vintage: (Yes or No)
         - Handmade: (Yes or No)
         - Personalize: (Yes or No)
         - Fit: (e.g. Slim, Relaxed, Regular, Skinny)
         - Pattern: (e.g. Solid, Striped, Plaid, Floral)
         Include other standard aspects like Sleeve Length, Neckline, Occasion, etc. when identifiable.
      6. COUNTRY_OF_ORIGIN: Scan the brand and size tag photos carefully for text indicating the country of manufacture (e.g., "Made in China", "Made in USA", "Fabriqué en..."). Return the country name (e.g. "China") or "Unknown" if not shown or unreadable.
      7. AGE: "Modern / not vintage" or the era (Y2K, 90s, 80s, etc.) based on style and tag.
      8. RETAIL_PRICE: Suggest a resale range (e.g., "$18–$28") based on typical eBay sold comps for this brand/item.
      9. ETSY_TAGS: Provide exactly 13 Poshmark style tags, comma-separated, each under 20 characters (e.g., "Womens Jeans, Cotton On, Carpenter Jeans, Size 4").
      10. WEIGHT: Estimate the shipping weight in decimal pounds. If a shipping scale photo showing weight is visible in the additional photos, calculate the weight from it (converting ounces to decimal pounds: e.g., 1 lb 3.1 oz = 1.19 lbs; 10.2 oz = 0.64 lbs). If no shipping scale is visible, estimate a realistic shipping weight for the garment type (e.g., Jeans: 1.25, T-Shirt: 0.45, Sweater: 0.9, Jacket: 1.6, Dress: 0.65, Shoes: 1.8, Socks: 0.1). Return only a clean decimal string (e.g. "1.25").
      11. INVENTORY_CODE: Look for a printed barcode/SKU label in the photos and extract the alphanumeric SKU code (e.g., "LM-123456"). If no SKU label is visible, return null or omit it.

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

async function extractAspectsFromText(title, description) {
  console.log(`[AIService] extractAspectsFromText starting... Using model: "${VISION_MODEL}"`);
  try {
    const prompt = `
      You are an expert assistant for eBay listings. Analyze the following clothing listing title and description.
      Extract standard eBay item specifics and return a clean JSON object.

      Title: ${title}
      Description: ${description}

      Extract only fields that are explicitly stated or strongly implied in the text. If a field cannot be determined, set it to null. Do NOT hallucinate.
      
      JSON keys to extract:
      1. Brand
      2. Size
      3. Size Type (e.g., Regular, Petite, Plus, Big & Tall)
      4. Department (e.g., Women, Men, Girls, Boys, Unisex Kids)
      5. Type (e.g., Jeans, Sweater, T-Shirt, Leggings, Pants, Blouse)
      6. Color
      7. Material (e.g., 70% Cotton, 30% Polyester)
      8. Rise (e.g., Low, Mid, High)
      9. Closure (e.g., Button, Pull On, Zip, Tie, Drawstring)
      10. Fit (e.g., Slim, Relaxed, Skinny, Regular)
      11. Pattern (e.g., Solid, Striped, Floral, Geometric)
      12. Fabric Type (e.g., Denim, Waffle Knit, Knit, Rayon, Fleece)
      13. Sleeve Length (e.g., Long Sleeve, Short Sleeve, Sleeveless)
      14. Country/Region of Manufacture

      Return ONLY a valid JSON object matching this structure:
      {
        "Brand": "...",
        "Size": "...",
        "Size Type": "...",
        "Department": "...",
        "Type": "...",
        "Color": "...",
        "Material": "...",
        "Rise": "...",
        "Closure": "...",
        "Fit": "...",
        "Pattern": "...",
        "Fabric Type": "...",
        "Sleeve Length": "...",
        "Country/Region of Manufacture": "..."
      }
    `;

    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false,
      format: 'json'
    }, {
      timeout: 90000 // 1.5 minute timeout
    });

    return JSON.parse(response.data.message.content);
  } catch (error) {
    if (error.response) {
      console.error('Ollama Aspect Extract Error Response:', error.response.data);
    }
    console.error('Error extracting aspects from text:', error.message);
    throw new Error('AI aspect extraction failed');
  }
}

async function generateSearchQueryFromImage(imagePath) {
  console.log(`[AIService] generateSearchQueryFromImage starting... Using model: "${VISION_MODEL}"`);
  try {
    const base64Image = fs.readFileSync(imagePath, { encoding: 'base64' });
    const prompt = `
      Analyze this image of a clothing item or product. Describe it in 4-6 highly specific keywords (e.g. brand, style, model, color, gender/size if visible) to create a perfect eBay search query for sold listings.
      Return a JSON object containing:
      {
        "query": "the optimized search query string"
      }
      Ensure the query is concise, accurate, and contains only keywords that would appear in an eBay title. E.g. "Kut From The Kloth Alanna Jeans". Do not use punctuation or quotes in the query.
    `;

    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [base64Image]
        }
      ],
      stream: false,
      format: 'json'
    }, {
      timeout: 90000
    });

    const parsed = JSON.parse(response.data.message.content);
    return parsed.query || '';
  } catch (error) {
    if (error.response) {
      console.error('Ollama Visual Query Error Response:', error.response.data);
    }
    console.error('Error in visual search query generation:', error.message);
    throw new Error('Visual AI query generation failed');
  }
}

module.exports = { processImages, extractAspectsFromText, generateSearchQueryFromImage };

