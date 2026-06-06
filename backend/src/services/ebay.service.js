const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

class EbayService {
  constructor() {}

  async loadUserConfig(userId) {
    return new Promise((resolve, reject) => {
      db.all("SELECT key, value FROM settings WHERE user_id = ?", [userId], (err, rows) => {
        if (err) {
          return reject(err);
        }
        const settings = {};
        if (rows) {
          rows.forEach(r => {
            settings[r.key] = r.value;
          });
        }
        
        const env = settings.ebay_env || 'sandbox';
        const isSandbox = env === 'sandbox';
        
        let clientId = null;
        let clientSecret = null;
        let ruName = null;
        
        if (isSandbox) {
          clientId = process.env.EBAY_SANDBOX_CLIENT_ID || process.env.EBAY_CLIENT_ID;
          clientSecret = process.env.EBAY_SANDBOX_CLIENT_SECRET || process.env.EBAY_CLIENT_SECRET;
          ruName = process.env.EBAY_SANDBOX_REDIRECT_URI || process.env.EBAY_REDIRECT_URI;
        } else {
          clientId = process.env.EBAY_PROD_CLIENT_ID || process.env.EBAY_CLIENT_ID;
          clientSecret = process.env.EBAY_PROD_CLIENT_SECRET || process.env.EBAY_CLIENT_SECRET;
          ruName = process.env.EBAY_PROD_REDIRECT_URI || process.env.EBAY_REDIRECT_URI;
        }
        
        const dbKey = `ebay_access_token_${isSandbox ? 'sandbox' : 'prod'}`;
        const accessToken = settings[dbKey] || null;
        const baseUrl = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
        const authUrl = isSandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
        
        resolve({
          isSandbox,
          clientId,
          clientSecret,
          ruName,
          accessToken,
          baseUrl,
          authUrl
        });
      });
    });
  }

  async getAuthUrl(userId) {
    const config = await this.loadUserConfig(userId);
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account'
    ].join(' ');
    
    const encodedRedirect = encodeURIComponent(config.ruName);
    const encodedScopes = encodeURIComponent(scopes);
    
    return `${config.authUrl}/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${encodedRedirect}&scope=${encodedScopes}&state=${userId}`;
  }

  async exchangeCodeForToken(code, userId) {
    const config = await this.loadUserConfig(userId);
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const tokenUrl = `${config.baseUrl}/identity/v1/oauth2/token`;
    
    try {
      const response = await axios.post(tokenUrl, 
        `grant_type=authorization_code&code=${code}&redirect_uri=${config.ruName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      const accessToken = response.data.access_token;
      const dbKey = `ebay_access_token_${config.isSandbox ? 'sandbox' : 'prod'}`;

      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?',
          [userId, dbKey, accessToken, accessToken],
          (err) => {
            if (err) {
              console.error('[EbayService] Failed to persist eBay access token to database:', err.message);
              reject(err);
            } else {
              console.log('[EbayService] Successfully persisted eBay access token to database.');
              resolve(response.data);
            }
          }
        );
      });
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      console.error('eBay Token Exchange Error:', errorMsg);
      throw new Error(JSON.stringify(errorMsg));
    }
  }

  async uploadImageToEPS(localFilePath, config) {
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    const resolvedPath = path.isAbsolute(localFilePath)
      ? localFilePath
      : path.resolve(__dirname, '../../', localFilePath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`Image path does not exist: ${resolvedPath}`);
      return null;
    }

    const tradingUrl = config.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>ListingImage</PictureName>
  <PictureSet>Supersize</PictureSet>
</UploadSiteHostedPicturesRequest>`;

    const formData = new FormData();
    formData.append('xml', new Blob([xml], { type: 'text/xml' }), 'request.xml');

    const fileBuffer = fs.readFileSync(resolvedPath);
    formData.append('image', new Blob([fileBuffer], { type: 'image/jpeg' }), path.basename(resolvedPath));

    try {
      const response = await axios.post(tradingUrl, formData, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': config.accessToken
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      if (ack !== 'Success' && ack !== 'Warning') {
        const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay EPS upload error';
        throw new Error(errorMsg);
      }

      const urlMatch = data.match(/<FullURL>(.*?)<\/FullURL>/);
      if (!urlMatch || !urlMatch[1]) {
        throw new Error('Could not find FullURL in EPS response');
      }

      return urlMatch[1];
    } catch (error) {
      console.error('EPS Upload Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async createInventoryItem(sku, itemData, config) {
    if (!config.accessToken) throw new Error('Not authenticated with eBay. Please connect your account first.');

    const epsUrls = [];
    if (itemData.images) {
      try {
        const localPaths = JSON.parse(itemData.images);
        if (Array.isArray(localPaths)) {
          for (const localPath of localPaths) {
            console.log(`Uploading ${localPath} to eBay Picture Services...`);
            const epsUrl = await this.uploadImageToEPS(localPath, config);
            if (epsUrl) {
              console.log(`Uploaded successfully! EPS URL: ${epsUrl}`);
              epsUrls.push(epsUrl);
            }
          }
        }
      } catch (e) {
        console.error('Error parsing/uploading item images:', e.message);
      }
    }

    let department = 'Men';
    const titleAndCategory = `${itemData.title} ${itemData.category || ''}`.toLowerCase();
    if (titleAndCategory.includes('women')) {
      department = 'Women';
    } else if (titleAndCategory.includes('girls') || titleAndCategory.includes("girl's")) {
      department = 'Girls';
    } else if (titleAndCategory.includes('boys') || titleAndCategory.includes("boy's")) {
      department = 'Boys';
    } else if (titleAndCategory.includes('unisex kid') || titleAndCategory.includes('kids') || titleAndCategory.includes('youth')) {
      department = 'Unisex Kids';
    } else if (titleAndCategory.includes('baby') || titleAndCategory.includes('infant') || titleAndCategory.includes('toddler')) {
      department = 'Baby';
    }

    let type = 'Jeans';
    if (titleAndCategory.includes('t-shirt') || titleAndCategory.includes('tee')) {
      type = 'T-Shirt';
    } else if (titleAndCategory.includes('shirt') || titleAndCategory.includes('button')) {
      type = 'Button-Up';
    } else if (titleAndCategory.includes('sweater') || titleAndCategory.includes('pullover') || titleAndCategory.includes('cardigan')) {
      type = 'Sweater';
    } else if (titleAndCategory.includes('hoodie') || titleAndCategory.includes('sweatshirt')) {
      type = 'Hoodie';
    } else if (titleAndCategory.includes('jacket') || titleAndCategory.includes('coat') || titleAndCategory.includes('outerwear')) {
      type = 'Jacket';
    } else if (titleAndCategory.includes('pants') || titleAndCategory.includes('trousers') || titleAndCategory.includes('chinos')) {
      type = 'Pants';
    } else if (titleAndCategory.includes('shorts')) {
      type = 'Shorts';
    } else if (titleAndCategory.includes('dress')) {
      type = 'Dress';
    } else if (titleAndCategory.includes('skirt')) {
      type = 'Skirt';
    } else if (titleAndCategory.includes('leggings') || titleAndCategory.includes('activewear')) {
      type = 'Leggings';
    }

    let sizeType = 'Regular';
    if (titleAndCategory.includes('tall') || titleAndCategory.includes('big')) {
      sizeType = 'Big & Tall';
    } else if (titleAndCategory.includes('plus')) {
      sizeType = 'Plus';
    } else if (titleAndCategory.includes('petite')) {
      sizeType = 'Petite';
    } else if (titleAndCategory.includes('junior')) {
      sizeType = 'Juniors';
    } else if (titleAndCategory.includes('maternity')) {
      sizeType = 'Maternity';
    }

    const colorMatch = itemData.title.match(/Blue|Red|Black|White|Green|Orange|Purple|Yellow|Brown|Gray|Pink|Tan|Beige|Cream|Navy|Olive|Maroon|Khaki|Denim/i);
    const color = colorMatch ? colorMatch[0] : 'Multicolor';

    let style = 'Basic';
    if (itemData.style_details) {
      const parts = itemData.style_details.split(',').map(s => s.trim()).filter(Boolean);
      const genericWords = ['jeans', 'pants', 'shirt', 'clothing', 'women', 'men', 'boy', 'girl', 'unisex', 'kid', 'apparel', 'trousers', 'shorts', 'sweatshirt', 'hoodie', 'jacket', 'coat', 'sweater', 'tee', 't-shirt'];
      const filtered = parts.filter(p => {
        const lower = p.toLowerCase();
        return !genericWords.some(word => lower === word || lower.includes(word));
      });
      const candidate = filtered[0] || parts[0];
      if (candidate) {
        style = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }

    const body = {
      product: {
        title: itemData.title.substring(0, 80),
        description: itemData.style_details,
        imageUrls: epsUrls,
        aspects: {
          Brand: [itemData.brand || 'Unbranded'],
          Size: [itemData.size || 'N/A'],
          Material: resolveEbayMaterials(itemData.material),
          Color: [color],
          Department: [department],
          Type: [type],
          "Size Type": [sizeType],
          Style: [style],
          Vintage: ['No'],
          Handmade: ['No'],
          Personalize: ['No'],
          "Garment Care": ['Machine Washable']
        }
      },
      condition: "USED_EXCELLENT",
      availability: {
        shipToLocationAvailability: { quantity: 1 }
      }
    };

    const weightVal = parseFloat(itemData.weight);
    if (!isNaN(weightVal) && weightVal > 0) {
      body.packageWeightAndSize = {
        weight: {
          value: weightVal,
          unit: "POUND"
        },
        packageType: "PACKAGE_THICK_ENVELOPE"
      };
    }

    if (itemData.style_details) {
      const parts = itemData.style_details.split(',').map(s => s.trim()).filter(Boolean);
      parts.forEach(part => {
        if (part.includes(':')) {
          const colonIndex = part.indexOf(':');
          const key = part.substring(0, colonIndex).trim();
          const val = part.substring(colonIndex + 1).trim();
          if (key && val) {
            const formattedKey = key.replace(/\b\w/g, c => c.toUpperCase());
            if (formattedKey.toLowerCase() === 'upc') {
              body.product.upc = [val];
            } else {
              let valArray = [val];
              if (val.includes('&') || val.includes('/') || /\band\b/i.test(val)) {
                valArray = val.split(/&|\/|\band\b/i).map(v => v.trim()).filter(Boolean);
              }
              const mappedArray = valArray.map(v => mapToEbayStandardValue(formattedKey, v));
              body.product.aspects[formattedKey] = mappedArray;
            }
          }
        }
      });
    }

    try {
      await axios.put(`${config.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, body, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US',
          'Content-Type': 'application/json'
        }
      });
      return true;
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      console.error('Create Inventory Item Error:', errorMsg);
      throw new Error(JSON.stringify(errorMsg));
    }
  }

  async getFulfillmentPolicyId(config) {
    try {
      const response = await axios.get(`${config.baseUrl}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, {
        headers: { 'Authorization': `Bearer ${config.accessToken}` }
      });
      return response.data.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
    } catch (e) {
      console.error('Fulfillment policy fetch error:', e.response?.data || e.message);
      return null;
    }
  }

  async getReturnPolicyId(config) {
    try {
      const response = await axios.get(`${config.baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
        headers: { 'Authorization': `Bearer ${config.accessToken}` }
      });
      return response.data.returnPolicies?.[0]?.returnPolicyId;
    } catch (e) {
      console.error('Return policy fetch error:', e.response?.data || e.message);
      return null;
    }
  }

  async getPaymentPolicyId(config) {
    try {
      const response = await axios.get(`${config.baseUrl}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, {
        headers: { 'Authorization': `Bearer ${config.accessToken}` }
      });
      return response.data.paymentPolicies?.[0]?.paymentPolicyId;
    } catch (e) {
      console.error('Payment policy fetch error:', e.response?.data || e.message);
      return null;
    }
  }

  async getSuggestedCategoryId(title, config) {
    try {
      const response = await axios.get(`${config.baseUrl}/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title)}`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`
        }
      });
      const suggestions = response.data.categorySuggestions;
      if (suggestions && suggestions.length > 0) {
        return suggestions[0].category.categoryId;
      }
    } catch (e) {
      console.error('Category suggestion error:', e.response?.data || e.message);
    }
    return '11450';
  }

  async getMerchantLocationKey(config) {
    try {
      const response = await axios.get(`${config.baseUrl}/sell/inventory/v1/location`, {
        headers: { 'Authorization': `Bearer ${config.accessToken}` }
      });
      if (response.data.locations && response.data.locations.length > 0) {
        return response.data.locations[0].merchantLocationKey;
      }
    } catch (e) {
      console.log('Failed to get location, will try to create default-location');
    }
    
    const defaultLocationKey = 'default-location';
    try {
      await axios.post(`${config.baseUrl}/sell/inventory/v1/location/${defaultLocationKey}`, {
        location: {
          address: {
            addressLine1: "123 Main St",
            city: "San Jose",
            stateOrProvince: "CA",
            postalCode: "95125",
            country: "US"
          }
        },
        locationWebUrl: "http://example.com",
        name: "Main Warehouse",
        merchantLocationStatus: "ENABLED",
        locationTypes: ["STORE"]
      }, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return defaultLocationKey;
    } catch (error) {
      console.error('Failed to create location:', error.response?.data || error.message);
      return defaultLocationKey;
    }
  }

  async publishOffer(offerId, config) {
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    try {
      const response = await axios.post(`${config.baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {}, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`[EbayService] publishOffer Error for offer #${offerId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  getNextSaturdayISO() {
    const now = new Date();
    const day = now.getDay();
    let diff = 6 - day;
    if (diff <= 0) {
      diff += 7;
    }
    const nextSaturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 9, 0, 0);
    return nextSaturday.toISOString();
  }

  async createDraft(itemData, userId) {
    const config = await this.loadUserConfig(userId);
    const sku = `LM-${itemData.inventory_code || Date.now()}`;
    try {
      await this.createInventoryItem(sku, itemData, config);

      const [fulfillmentPolicyId, returnPolicyId, paymentPolicyId, locationKey, categoryId] = await Promise.all([
        this.getFulfillmentPolicyId(config),
        this.getReturnPolicyId(config),
        this.getPaymentPolicyId(config),
        this.getMerchantLocationKey(config),
        this.getSuggestedCategoryId(itemData.title, config)
      ]);

      if (!fulfillmentPolicyId || !returnPolicyId || !paymentPolicyId) {
        throw new Error("Could not fetch active listing policy profiles (shipping, return, or payment) from your eBay account. Please set up default policies in your eBay Seller Hub first.");
      }

      let priceVal = 19.99;
      if (itemData.retail_price) {
        const match = itemData.retail_price.match(/[\d.]+/);
        if (match) {
          priceVal = parseFloat(match[0]);
        }
      }

      const descHtml = `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
          <h2 style="font-size: 1.25rem; font-weight: bold; border-bottom: 1px solid #eaeaea; padding-bottom: 8px; margin-bottom: 15px; color: #111;">${itemData.title}</h2>
          <p><strong>MATERIAL:</strong><br/>${itemData.material || 'N/A'}</p>
          <p><strong>CONDITION:</strong><br/>${itemData.condition || 'N/A'}</p>
          <p><strong>MEASUREMENTS NOTE:</strong><br/>${itemData.measurements_note || 'N/A'}</p>
          <p><strong>SHIPPING NOTE:</strong><br/>Items ship next business day.</p>
          ${itemData.etsy_tags ? `<p><strong>STYLE TAGS / KEYWORDS:</strong><br/>${itemData.etsy_tags}</p>` : ''}
        </div>
      `.trim().replace(/\s+/g, ' ');

      const offerBody = {
        sku: sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId: categoryId,
        listingDescription: descHtml,
        pricingSummary: {
          price: {
            value: priceVal.toString(),
            currency: "USD"
          }
        },
        listingPolicies: {
          fulfillmentPolicyId: fulfillmentPolicyId,
          returnPolicyId: returnPolicyId,
          paymentPolicyId: paymentPolicyId
        },
        merchantLocationKey: locationKey,
        listingStartDate: this.getNextSaturdayISO()
      };

      const offerResponse = await axios.post(`${config.baseUrl}/sell/inventory/v1/offer`, offerBody, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US',
          'Content-Type': 'application/json'
        }
      });

      const offerId = offerResponse.data.offerId;
      console.log(`[EbayService] Draft Offer #${offerId} created successfully on eBay for SKU ${sku}`);

      console.log(`[EbayService] Publishing scheduled offer #${offerId}...`);
      let listingId = null;
      try {
        const publishResponse = await this.publishOffer(offerId, config);
        listingId = publishResponse.listingId;
        console.log(`[EbayService] Scheduled offer #${offerId} published successfully! Listing ID: ${listingId}`);
      } catch (publishErr) {
        console.error(`[EbayService] Failed to publish scheduled offer #${offerId}:`, publishErr.message);
        throw new Error(`Failed to publish scheduled listing: ${publishErr.message}`);
      }

      return { 
        status: 'success', 
        sku: sku, 
        listingId: listingId, 
        offerId: offerId 
      };
    } catch (error) {
      console.error(`[EbayService] createDraft Error for SKU ${sku}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getInventoryItems(userId) {
    const config = await this.loadUserConfig(userId);
    console.log(`[EbayService] getInventoryItems starting... Token available: ${!!config.accessToken}`);
    if (!config.accessToken) {
      console.error('[EbayService] getInventoryItems called but accessToken is null!');
      throw new Error('Not authenticated with eBay');
    }

    let modernItems = [];
    try {
      const response = await axios.get(`${config.baseUrl}/sell/inventory/v1/inventory_item`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      if (response.data && response.data.inventoryItems) {
        modernItems = response.data.inventoryItems;
        await Promise.all(modernItems.map(async (item) => {
          try {
            const offerResponse = await axios.get(`${config.baseUrl}/sell/inventory/v1/offer?sku=${item.sku}`, {
              headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Language': 'en-US'
              }
            });
            const offers = offerResponse.data?.offers;
            if (offers && offers.length > 0) {
              const publishedOffer = offers.find(o => o.status === 'PUBLISHED') || offers[0];
              item.listingId = publishedOffer.listingId;
              item.price = publishedOffer.price;
              
              if (publishedOffer.listingStartDate) {
                const startTime = new Date(publishedOffer.listingStartDate);
                if (startTime > new Date()) {
                  item.status = 'scheduled';
                } else {
                  item.status = 'active';
                }
              } else if (publishedOffer.status === 'PUBLISHED') {
                item.status = 'active';
              } else {
                item.status = 'draft';
              }
            } else {
              item.status = 'draft';
            }
          } catch (e) {
            console.error(`Failed to fetch offers for SKU ${item.sku}:`, e.message);
            item.status = 'draft';
          }
        }));
      }
    } catch (error) {
      console.error('[EbayService] Get Modern Inventory Error:', error.response?.data || error.message);
    }

    let traditionalItems = [];
    try {
      traditionalItems = await this.getTraditionalListings(userId, config);
    } catch (error) {
      console.error('[EbayService] Failed to retrieve traditional listings:', error.message);
    }

    // Merge cached specifics, description, and price for traditional items
    const cachedItems = await new Promise((resolve) => {
      db.all("SELECT * FROM ebay_cache WHERE user_id = ?", [userId], (err, rows) => {
        if (err || !rows) {
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });

    const cacheMap = new Map();
    cachedItems.forEach(c => {
      cacheMap.set(c.listing_id, c);
    });

    traditionalItems.forEach(item => {
      if (item.listingId && cacheMap.has(item.listingId)) {
        const cached = cacheMap.get(item.listingId);
        try {
          if (cached.specifics) {
            item.product.aspects = JSON.parse(cached.specifics);
          }
          if (cached.description) {
            item.product.description = cached.description;
          }
          if (cached.price) {
            item.price = JSON.parse(cached.price);
          }
        } catch (e) {
          console.error('[Cache] Parse error for listing:', item.listingId, e);
        }
      }
    });

    const modernListingIds = new Set(
      modernItems.map(item => item.listingId).filter(Boolean)
    );

    const uniqueTraditional = traditionalItems.filter(item => {
      if (item.listingId && modernListingIds.has(item.listingId)) {
        return false;
      }
      if (modernItems.some(mi => mi.sku === item.sku)) {
        return false;
      }
      return true;
    });

    const combinedItems = [...modernItems, ...uniqueTraditional];
    return {
      inventoryItems: combinedItems,
      total: combinedItems.length
    };
  }

  async getTraditionalListings(userId, config) {
    if (!config) config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    try {
      const [activeItems, scheduledItems] = await Promise.all([
        this.fetchTraditionalListType(config, 'ActiveList'),
        this.fetchTraditionalListType(config, 'ScheduledList')
      ]);

      return [...activeItems, ...scheduledItems];
    } catch (error) {
      console.error('[EbayService] Get Traditional Listings Error:', error.message);
      throw error;
    }
  }

  async fetchTraditionalListType(config, listType) {
    const tradingUrl = config.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    let page = 1;
    let totalPages = 1;
    const items = [];
    const status = listType === 'ActiveList' ? 'active' : 'scheduled';
    const sort = listType === 'ActiveList' ? 'TimeLeft' : 'StartTime';

    do {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <${listType}>
    <Sort>${sort}</Sort>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </${listType}>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;

      const response = await axios.post(tradingUrl, xml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': config.accessToken,
          'Content-Type': 'text/xml'
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      if (ack !== 'Success' && ack !== 'Warning') {
        const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay GetMyeBaySelling error';
        throw new Error(errorMsg);
      }

      let listXml = '';
      const listMatch = data.match(new RegExp(`<${listType}>([\\s\\S]*?)</${listType}>`));
      if (listMatch) listXml = listMatch[1];

      if (page === 1) {
        const pagesMatch = listXml.match(/<TotalNumberOfPages>(.*?)<\/TotalNumberOfPages>/);
        if (pagesMatch) {
          totalPages = parseInt(pagesMatch[1], 10) || 1;
        }
      }

      const parsedItems = parseItemsFromXml(listXml, status);
      items.push(...parsedItems);

      page++;
    } while (page <= totalPages);

    return items;
  }

  async getSalesDashboard(userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) {
      return { isMock: true, ...getMockSalesDashboardData() };
    }

    try {
      const tradingUrl = config.isSandbox
        ? 'https://api.sandbox.ebay.com/ws/api.dll'
        : 'https://api.ebay.com/ws/api.dll';

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <NumberOfDays>30</NumberOfDays>
  <OrderRole>Seller</OrderRole>
  <DetailLevel>ReturnAll</DetailLevel>
</GetOrdersRequest>`;

      const response = await axios.post(tradingUrl, xml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'GetOrders',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': config.accessToken,
          'Content-Type': 'text/xml'
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      if (ack !== 'Success' && ack !== 'Warning') {
        throw new Error('eBay GetOrders API failed');
      }

      const orders = parseOrdersFromXml(data);

      return {
        isMock: false,
        stats: calculateStats(orders),
        brandBreakdown: calculateBrandBreakdown(orders),
        categoryBreakdown: calculateCategoryBreakdown(orders),
        dailySales: calculateDailySales(orders),
        recentOrders: formatRecentOrders(orders)
      };
    } catch (apiErr) {
      console.warn('[EbayService] Live orders API failed, falling back to mock data:', apiErr.message);
      return { isMock: true, ...getMockSalesDashboardData() };
    }
  }

  async getInventoryItem(sku, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');
    try {
      const response = await axios.get(`${config.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Get Item ${sku} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async updateInventoryItem(sku, updateData, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');
    try {
      const current = await this.getInventoryItem(sku, userId);
      
      const body = {
        ...current,
        product: {
          ...current.product,
          ...updateData.product,
          aspects: {
            ...current.product?.aspects,
            ...(updateData.product?.aspects || {})
          }
        }
      };

      await axios.put(`${config.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, body, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US',
          'Content-Type': 'application/json'
        }
      });
      return { status: 'success', sku };
    } catch (error) {
      console.error(`Update Item ${sku} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async deleteInventoryItem(sku, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');
    try {
      await axios.delete(`${config.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      return { status: 'success', sku };
    } catch (error) {
      console.error(`Delete Item ${sku} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async endTraditionalListing(listingId, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    const tradingUrl = config.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${listingId}</ItemID>
  <EndingReason>LostOrBroken</EndingReason>
</EndItemRequest>`;

    try {
      const response = await axios.post(tradingUrl, xml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'EndItem',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': config.accessToken,
          'Content-Type': 'text/xml'
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      if (ack !== 'Success' && ack !== 'Warning') {
        const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay EndItem error';
        throw new Error(errorMsg);
      }

      return { status: 'success', listingId };
    } catch (error) {
      console.error(`End Traditional Listing ${listingId} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async bulkReviseTraditionalListings(items, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    const tradingUrl = config.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    const results = [];

    for (const item of items) {
      const { listingId, title, price, quantity, specifics } = item;
      
      let specificsXml = '';
      if (specifics && Object.keys(specifics).length > 0) {
        specificsXml = '<ItemSpecifics>';
        for (const [name, value] of Object.entries(specifics)) {
          if (value !== null && value !== undefined && value !== '') {
            specificsXml += `
            <NameValueList>
              <Name>${escapeXml(name)}</Name>
              <Value>${escapeXml(String(value))}</Value>
            </NameValueList>`;
          }
        }
        specificsXml += '</ItemSpecifics>';
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${listingId}</ItemID>
    ${title ? `<Title>${escapeXml(title)}</Title>` : ''}
    ${price ? `<StartPrice>${price}</StartPrice>` : ''}
    ${quantity !== undefined ? `<Quantity>${quantity}</Quantity>` : ''}
    ${specificsXml}
  </Item>
</ReviseItemRequest>`;

      console.log(`[EbayService] ReviseItem for ${listingId}...`);
      try {
        const response = await axios.post(tradingUrl, xml, {
          headers: {
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
            'X-EBAY-API-CALL-NAME': 'ReviseItem',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-IAF-TOKEN': config.accessToken,
            'Content-Type': 'text/xml'
          }
        });

        const data = response.data;
        const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
        const ack = ackMatch ? ackMatch[1] : '';
        if (ack !== 'Success' && ack !== 'Warning') {
          const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
          const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay ReviseItem error';
          results.push({ listingId, status: 'error', error: errorMsg });
        } else {
          results.push({ listingId, status: 'success' });
        }
      } catch (err) {
        console.error(`Failed to revise traditional item ${listingId}:`, err.message);
        results.push({ listingId, status: 'error', error: err.message });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    return results;
  }

  async fetchExternalItemDetails(itemId, userId) {
    const config = await this.loadUserConfig(userId);
    if (!config.accessToken) throw new Error('Not authenticated with eBay');

    const tradingUrl = config.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    console.log(`[EbayService] Making GetItem call for ItemID ${itemId}...`);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

    try {
      const response = await axios.post(tradingUrl, xml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'GetItem',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': config.accessToken,
          'Content-Type': 'text/xml'
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      if (ack !== 'Success' && ack !== 'Warning') {
        const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay GetItem error';
        throw new Error(errorMsg);
      }

      const titleMatch = data.match(/<Title>(.*?)<\/Title>/);
      const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

      const descMatch = data.match(/<Description>([\s\S]*?)<\/Description>/);
      const descriptionHtml = descMatch ? descMatch[1].trim() : '';
      const description = descriptionHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      // Parse Price
      let priceVal = '0.0';
      let currency = 'USD';
      
      const buyItNowMatch = data.match(/<BuyItNowPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/BuyItNowPrice>/);
      const currentPriceMatch = data.match(/<CurrentPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/CurrentPrice>/);
      const startPriceMatch = data.match(/<StartPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/StartPrice>/);

      const binVal = buyItNowMatch ? parseFloat(buyItNowMatch[2].trim()) : 0;
      const curVal = currentPriceMatch ? parseFloat(currentPriceMatch[2].trim()) : 0;
      const stVal = startPriceMatch ? parseFloat(startPriceMatch[2].trim()) : 0;

      if (binVal > 0) {
        priceVal = String(binVal);
        currency = buyItNowMatch[1] || 'USD';
      } else if (curVal > 0) {
        priceVal = String(curVal);
        currency = currentPriceMatch[1] || 'USD';
      } else if (stVal > 0) {
        priceVal = String(stVal);
        currency = startPriceMatch[1] || 'USD';
      } else if (buyItNowMatch) {
        priceVal = buyItNowMatch[2].trim();
        currency = buyItNowMatch[1] || 'USD';
      } else if (currentPriceMatch) {
        priceVal = currentPriceMatch[2].trim();
        currency = currentPriceMatch[1] || 'USD';
      }

      const specifics = {};
      const specificsBlockMatch = data.match(/<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/);
      if (specificsBlockMatch) {
        const block = specificsBlockMatch[1];
        const regex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
        let match;
        while ((match = regex.exec(block)) !== null) {
          const inner = match[1];
          const nameM = inner.match(/<Name>(.*?)<\/Name>/);
          const valRegex = /<Value>(.*?)<\/Value>/g;
          const values = [];
          let valM;
          while ((valM = valRegex.exec(inner)) !== null) {
            values.push(decodeXmlEntities(valM[1].trim()));
          }
          if (nameM && values.length > 0) {
            specifics[nameM[1].trim()] = values.join(', ');
          }
        }
      }

      return {
        title,
        description,
        specifics,
        price: { value: priceVal, currency }
      };
    } catch (error) {
      console.error(`[EbayService] GetItem Error for ItemID ${itemId}:`, error.response?.data || error.message);
      throw error;
    }
  }
}

function resolveEbayMaterials(materialStr) {
  if (!materialStr || materialStr.toLowerCase().includes('missing') || materialStr.toLowerCase().includes('not shown')) {
    return ['N/A'];
  }

  const materials = new Set();
  const lower = materialStr.toLowerCase();

  const fiberMappings = [
    { pattern: /cotton/i, name: 'Cotton' },
    { pattern: /polyester/i, name: 'Polyester' },
    { pattern: /(spandex|elastane|lycra)/i, name: 'Spandex' },
    { pattern: /(rayon|viscose|modal|lyocell|tencel)/i, name: 'Rayon' },
    { pattern: /(wool|cashmere|merino|angora)/i, name: 'Wool' },
    { pattern: /silk/i, name: 'Silk' },
    { pattern: /linen/i, name: 'Linen' },
    { pattern: /nylon/i, name: 'Nylon' },
    { pattern: /acrylic/i, name: 'Acrylic' },
    { pattern: /(leather|suede)/i, name: 'Leather' }
  ];

  const foundFibers = [];
  fiberMappings.forEach(({ pattern, name }) => {
    if (pattern.test(lower)) {
      materials.add(name);
      foundFibers.push(name);
    }
  });

  if (foundFibers.length > 1) {
    if (foundFibers.includes('Cotton')) {
      materials.add('Cotton Blend');
    }
    if (foundFibers.includes('Polyester')) {
      materials.add('Polyester Blend');
    }
    if (foundFibers.includes('Wool')) {
      materials.add('Wool Blend');
    }
  }

  materials.add(materialStr);
  return Array.from(materials);
}

function mapToEbayStandardValue(aspectKey, value) {
  const lowerVal = value.toLowerCase();
  
  if (aspectKey === 'Rise') {
    if (lowerVal.includes('mid')) return 'Mid (8.5-10.5 in)';
    if (lowerVal.includes('ultra low')) return 'Ultra Low (Less than 6.5 in)';
    if (lowerVal.includes('low')) return 'Low (6.5-8.5 in)';
    if (lowerVal.includes('high')) return 'High (Greater than 10.5 in)';
  }
  
  if (aspectKey === 'Garment Care') {
    if (lowerVal.includes('machine')) return 'Machine Washable';
    if (lowerVal.includes('dry clean')) return 'Dry Clean Only';
    if (lowerVal.includes('hand wash')) return 'Hand Wash Only';
  }

  if (['Vintage', 'Handmade', 'Personalize'].includes(aspectKey)) {
    if (lowerVal === 'yes' || lowerVal === 'true') return 'Yes';
    if (lowerVal === 'no' || lowerVal === 'false') return 'No';
  }
  
  return value;
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseItemsFromXml(xml, status) {
  const items = [];
  if (!xml) return items;
  const itemBlocks = xml.split('<Item>');
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i].split('</Item>')[0];

    const itemIdMatch = block.match(/<ItemID>(.*?)<\/ItemID>/);
    const titleMatch = block.match(/<Title>(.*?)<\/Title>/);
    const skuMatch = block.match(/<SKU>(.*?)<\/SKU>/);
    
    const qtyMatch = block.match(/<QuantityAvailable>(.*?)<\/QuantityAvailable>/) || block.match(/<Quantity>(.*?)<\/Quantity>/);
    
    const galleryUrlMatch = block.match(/<GalleryURL>(.*?)<\/GalleryURL>/);
    const pictureUrlMatches = block.match(/<PictureURL>(.*?)<\/PictureURL>/g) || [];
    
    // Parse Price
    let priceVal = '0.0';
    let currency = 'USD';
    
    const buyItNowMatch = block.match(/<BuyItNowPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/BuyItNowPrice>/);
    const currentPriceMatch = block.match(/<CurrentPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/CurrentPrice>/);
    const startPriceMatch = block.match(/<StartPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/StartPrice>/);

    const binVal = buyItNowMatch ? parseFloat(buyItNowMatch[2].trim()) : 0;
    const curVal = currentPriceMatch ? parseFloat(currentPriceMatch[2].trim()) : 0;
    const stVal = startPriceMatch ? parseFloat(startPriceMatch[2].trim()) : 0;

    if (binVal > 0) {
      priceVal = String(binVal);
      currency = buyItNowMatch[1] || 'USD';
    } else if (curVal > 0) {
      priceVal = String(curVal);
      currency = currentPriceMatch[1] || 'USD';
    } else if (stVal > 0) {
      priceVal = String(stVal);
      currency = startPriceMatch[1] || 'USD';
    } else if (buyItNowMatch) {
      priceVal = buyItNowMatch[2].trim();
      currency = buyItNowMatch[1] || 'USD';
    } else if (currentPriceMatch) {
      priceVal = currentPriceMatch[2].trim();
      currency = currentPriceMatch[1] || 'USD';
    }

    const imageUrls = [];
    if (galleryUrlMatch && galleryUrlMatch[1]) {
      imageUrls.push(galleryUrlMatch[1].trim());
    }
    
    pictureUrlMatches.forEach(pMatch => {
      const urlM = pMatch.match(/<PictureURL>(.*?)<\/PictureURL>/);
      if (urlM && urlM[1]) {
        const url = urlM[1].trim();
        if (url && !imageUrls.includes(url)) {
          imageUrls.push(url);
        }
      }
    });

    const itemId = itemIdMatch ? itemIdMatch[1].trim() : '';
    if (!itemId) continue;

    const sku = skuMatch && skuMatch[1] && skuMatch[1].trim() ? skuMatch[1].trim() : `TRADITIONAL-${itemId}`;
    const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : 'Untitled Item';
    const quantity = qtyMatch ? parseInt(qtyMatch[1].trim(), 10) || 0 : 1;

    const startTimeMatch = block.match(/<StartTime>(.*?)<\/StartTime>/);
    const endTimeMatch = block.match(/<EndTime>(.*?)<\/EndTime>/);
    const startTime = startTimeMatch ? startTimeMatch[1].trim() : '';
    const endTime = endTimeMatch ? endTimeMatch[1].trim() : '';

    items.push({
      sku: sku,
      listingId: itemId,
      product: {
        title: title,
        imageUrls: imageUrls
      },
      price: {
        value: priceVal,
        currency: currency
      },
      condition: "USED_EXCELLENT",
      availability: {
        shipToLocationAvailability: {
          quantity: quantity
        }
      },
      status: status,
      isTraditional: true,
      startTime: startTime,
      endTime: endTime
    });
  }
  return items;
}

function parseOrdersFromXml(xml) {
  const orders = [];
  if (!xml) return orders;

  const orderBlocks = xml.split('<Order>');
  for (let i = 1; i < orderBlocks.length; i++) {
    const block = orderBlocks[i].split('</Order>')[0];

    const orderId = block.match(/<OrderID>(.*?)<\/OrderID>/)?.[1] || '';
    const status = block.match(/<OrderStatus>(.*?)<\/OrderStatus>/)?.[1] || '';
    const createdTime = block.match(/<CreatedTime>(.*?)<\/CreatedTime>/)?.[1] || '';
    const total = parseFloat(block.match(/<Total(?:\s+currencyID="([^"]+)")?>([^<]+)<\/Total>/)?.[2] || '0.0');
    const subtotal = parseFloat(block.match(/<Subtotal(?:\s+currencyID="([^"]+)")?>([^<]+)<\/Subtotal>/)?.[2] || '0.0');
    const amountPaid = parseFloat(block.match(/<AmountPaid(?:\s+currencyID="([^"]+)")?>([^<]+)<\/AmountPaid>/)?.[2] || '0.0');

    const items = [];
    const transBlocks = block.split('<Transaction>');
    for (let j = 1; j < transBlocks.length; j++) {
      const transBlock = transBlocks[j].split('</Transaction>')[0];

      const itemId = transBlock.match(/<ItemID>(.*?)<\/ItemID>/)?.[1] || '';
      const title = decodeXmlEntities(transBlock.match(/<Title>(.*?)<\/Title>/)?.[1] || '');
      const sku = transBlock.match(/<SKU>(.*?)<\/SKU>/)?.[1] || '';
      const qty = parseInt(transBlock.match(/<QuantityPurchased>(.*?)<\/QuantityPurchased>/)?.[1] || '1', 10);
      const price = parseFloat(transBlock.match(/<TransactionPrice(?:\s+currencyID="([^"]+)")?>([^<]+)<\/TransactionPrice>/)?.[2] || '0.0');

      items.push({ itemId, title, sku, quantity: qty, price });
    }

    orders.push({
      orderId,
      status,
      createdTime,
      total,
      subtotal,
      amountPaid,
      items
    });
  }
  return orders;
}

function calculateStats(orders) {
  const totalSales = parseFloat(orders.reduce((sum, o) => sum + o.total, 0).toFixed(2));
  const totalOrders = orders.length;
  const itemsSold = orders.reduce((sum, o) => {
    return sum + o.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);
  const aov = totalOrders > 0 ? parseFloat((totalSales / totalOrders).toFixed(2)) : 0.0;
  const pendingShipments = orders.filter(o => o.status !== 'Completed').length;

  return {
    totalSales,
    totalOrders,
    itemsSold,
    aov,
    pendingShipments,
    activeListings: 511
  };
}

function calculateBrandBreakdown(orders) {
  const brandSales = {};
  let totalSales = 0;

  orders.forEach(o => {
    o.items.forEach(item => {
      const brand = detectBrandFromTitle(item.title);
      const itemPrice = item.price * item.quantity;
      brandSales[brand] = (brandSales[brand] || 0) + itemPrice;
      totalSales += itemPrice;
    });
  });

  const breakdown = Object.entries(brandSales).map(([brand, sales]) => ({
    brand,
    sales: parseFloat(sales.toFixed(2)),
    percentage: totalSales > 0 ? parseFloat(((sales / totalSales) * 100).toFixed(1)) : 0
  }));

  breakdown.sort((a, b) => b.sales - a.sales);
  return breakdown;
}

function calculateCategoryBreakdown(orders) {
  const catSales = {};
  let totalSales = 0;

  orders.forEach(o => {
    o.items.forEach(item => {
      const category = detectCategoryFromTitle(item.title);
      const itemPrice = item.price * item.quantity;
      catSales[category] = (catSales[category] || 0) + itemPrice;
      totalSales += itemPrice;
    });
  });

  const breakdown = Object.entries(catSales).map(([category, sales]) => ({
    category,
    sales: parseFloat(sales.toFixed(2)),
    percentage: totalSales > 0 ? parseFloat(((sales / totalSales) * 100).toFixed(1)) : 0
  }));

  breakdown.sort((a, b) => b.sales - a.sales);
  return breakdown;
}

function calculateDailySales(orders) {
  const daily = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    daily[dateStr] = { date: dateStr, sales: 0.0, orders: 0 };
  }

  orders.forEach(o => {
    if (o.createdTime) {
      const dateStr = o.createdTime.split('T')[0];
      if (daily[dateStr]) {
        daily[dateStr].sales = parseFloat((daily[dateStr].sales + o.total).toFixed(2));
        daily[dateStr].orders += 1;
      }
    }
  });

  return Object.values(daily);
}

function formatRecentOrders(orders) {
  return orders.slice(0, 10).map(o => {
    const firstItem = o.items[0] || {};
    return {
      orderId: o.orderId,
      buyerName: 'Buyer',
      title: firstItem.title || 'eBay Item',
      brand: detectBrandFromTitle(firstItem.title),
      price: firstItem.price || 0.0,
      shippingCost: parseFloat((o.total - o.subtotal).toFixed(2)),
      totalPaid: o.total,
      status: o.status === 'Completed' ? 'Shipped' : 'Pending Shipment',
      date: o.createdTime
    };
  });
}

function detectBrandFromTitle(title) {
  if (!title) return 'Other Brands';
  const lower = title.toLowerCase();
  if (lower.includes('talbots')) return 'Talbots';
  if (lower.includes('kut from the kloth') || lower.includes('kut')) return 'Kut from the Kloth';
  if (lower.includes('maurice')) return 'Maurices';
  if (lower.includes('anthropologie') || lower.includes('moth')) return 'Anthropologie';
  if (lower.includes('wrangler')) return 'Wrangler';
  if (lower.includes('lucky brand') || lower.includes('lucky')) return 'Lucky Brand';
  if (lower.includes('billabong')) return 'Billabong';
  if (lower.includes('toad&co') || lower.includes('toad')) return 'Toad&Co';
  if (lower.includes('loft')) return 'LOFT';
  if (lower.includes('torrid')) return 'Torrid';
  if (lower.includes('earring') || lower.includes('cow')) return 'Aztec Wooden';
  return 'Other Brands';
}

function detectCategoryFromTitle(title) {
  if (!title) return 'Other';
  const lower = title.toLowerCase();
  if (lower.includes('jean') || lower.includes('denim')) return 'Jeans & Denim';
  if (lower.includes('shirt') || lower.includes('top') || lower.includes('polo') || lower.includes('blouse') || lower.includes('tee')) return 'Tops & Shirts';
  if (lower.includes('dress') || lower.includes('skirt')) return 'Dresses & Skirts';
  if (lower.includes('earring') || lower.includes('necklace') || lower.includes('bracelet')) return 'Accessories (Earrings)';
  if (lower.includes('jacket') || lower.includes('coat') || lower.includes('sweater') || lower.includes('blazer')) return 'Outerwear';
  return 'Other';
}

function getMockSalesDashboardData() {
  const stats = {
    totalSales: 2840.50,
    totalOrders: 98,
    itemsSold: 115,
    aov: 28.98,
    pendingShipments: 4,
    activeListings: 511
  };

  const brandBreakdown = [
    { brand: 'Talbots', sales: 450, percentage: 15.8 },
    { brand: 'Kut from the Kloth', sales: 380, percentage: 13.4 },
    { brand: 'LOFT', sales: 320, percentage: 11.3 },
    { brand: 'Lucky Brand', sales: 290, percentage: 10.2 },
    { brand: 'Maurices', sales: 240, percentage: 8.5 },
    { brand: 'Anthropologie', sales: 210, percentage: 7.4 },
    { brand: 'Toad&Co', sales: 180, percentage: 6.3 },
    { brand: 'Other Brands', sales: 770.5, percentage: 27.1 }
  ];

  const categoryBreakdown = [
    { category: 'Jeans & Denim', sales: 1150, percentage: 40.5 },
    { category: 'Tops & Shirts', sales: 780, percentage: 27.5 },
    { category: 'Dresses & Skirts', sales: 420, percentage: 14.8 },
    { category: 'Accessories (Earrings)', sales: 320, percentage: 11.3 },
    { category: 'Outerwear', sales: 170.5, percentage: 6.0 }
  ];

  const dailySales = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseSales = isWeekend ? 120 : 60;
    const sales = parseFloat((baseSales + Math.random() * 80).toFixed(2));
    const orders = Math.floor(sales / 25) + 1;

    dailySales.push({
      date: dateStr,
      sales,
      orders
    });
  }

  stats.totalSales = parseFloat(dailySales.reduce((sum, item) => sum + item.sales, 0).toFixed(2));
  stats.totalOrders = dailySales.reduce((sum, item) => sum + item.orders, 0);
  stats.aov = parseFloat((stats.totalSales / stats.totalOrders).toFixed(2));

  const recentOrders = [
    {
      orderId: 'MM-100234',
      buyerName: 'Sarah M.',
      title: 'Kut From The Kloth Jeans Alanna Size 12',
      brand: 'Kut from the Kloth',
      price: 23.74,
      shippingCost: 8.50,
      totalPaid: 32.24,
      status: 'Pending Shipment',
      date: new Date().toISOString()
    },
    {
      orderId: 'MM-100233',
      buyerName: 'Emily R.',
      title: 'Lightweight Western Style Teal Brown Cow Aztec Wooden Earrings',
      brand: 'Aztec Wooden',
      price: 5.99,
      shippingCost: 4.50,
      totalPaid: 10.49,
      status: 'Pending Shipment',
      date: new Date().toISOString()
    },
    {
      orderId: 'MM-100232',
      buyerName: 'Jennifer K.',
      title: 'Talbots Slim Ankle Jeans Denim Women Size 8',
      brand: 'Talbots',
      price: 24.99,
      shippingCost: 8.50,
      totalPaid: 33.49,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      orderId: 'MM-100231',
      buyerName: 'Robert B.',
      title: 'Wrangler Western Shirt Mens 2XLT',
      brand: 'Wrangler',
      price: 30.68,
      shippingCost: 7.20,
      totalPaid: 37.88,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 48).toISOString()
    },
    {
      orderId: 'MM-100230',
      buyerName: 'Amanda S.',
      title: 'Toad&Co Womens Small Polo Shirt',
      brand: 'Toad&Co',
      price: 19.99,
      shippingCost: 5.50,
      totalPaid: 25.49,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 72).toISOString()
    },
    {
      orderId: 'MM-100229',
      buyerName: 'Melissa L.',
      title: 'Lucky Brand Sofia Boot Jeans Size 8',
      brand: 'Lucky Brand',
      price: 26.34,
      shippingCost: 8.50,
      totalPaid: 34.84,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 96).toISOString()
    },
    {
      orderId: 'MM-100228',
      buyerName: 'Ashley H.',
      title: 'Maurices Striped Maxi Dress',
      brand: 'Maurices',
      price: 16.14,
      shippingCost: 6.50,
      totalPaid: 22.64,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 120).toISOString()
    },
    {
      orderId: 'MM-100227',
      buyerName: 'Megan P.',
      title: 'Moth Anthropologie Womens Sweater',
      brand: 'Anthropologie',
      price: 19.99,
      shippingCost: 6.50,
      totalPaid: 26.49,
      status: 'Shipped',
      date: new Date(Date.now() - 3600000 * 144).toISOString()
    }
  ];

  return {
    stats,
    brandBreakdown,
    categoryBreakdown,
    dailySales,
    recentOrders
  };
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

module.exports = new EbayService();
