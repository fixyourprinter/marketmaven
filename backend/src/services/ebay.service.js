const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

class EbayService {
  constructor() {
    this.clientId = null;
    this.clientSecret = null;
    this.ruName = null;
    this.accessToken = null;
    this.isSandbox = true;
    this.baseUrl = 'https://api.sandbox.ebay.com';
    this.authUrl = 'https://auth.sandbox.ebay.com';

    this.refreshConfig().catch(err => console.error('EbayService initialization error:', err.message));
  }

  refreshConfig() {
    return new Promise((resolve, reject) => {
      db.get("SELECT value FROM settings WHERE key = 'ebay_env'", [], (err, row) => {
        if (err) {
          console.error('Failed to load eBay environment setting from DB:', err.message);
          this.isSandbox = true;
          this.clientId = process.env.EBAY_CLIENT_ID;
          this.clientSecret = process.env.EBAY_CLIENT_SECRET;
          this.ruName = process.env.EBAY_REDIRECT_URI;
        } else {
          const envSetting = row ? row.value : 'sandbox';
          this.isSandbox = envSetting === 'sandbox';

          if (this.isSandbox) {
            this.clientId = process.env.EBAY_SANDBOX_CLIENT_ID || process.env.EBAY_CLIENT_ID;
            this.clientSecret = process.env.EBAY_SANDBOX_CLIENT_SECRET || process.env.EBAY_CLIENT_SECRET;
            this.ruName = process.env.EBAY_SANDBOX_REDIRECT_URI || process.env.EBAY_REDIRECT_URI;
          } else {
            this.clientId = process.env.EBAY_PROD_CLIENT_ID || process.env.EBAY_CLIENT_ID;
            this.clientSecret = process.env.EBAY_PROD_CLIENT_SECRET || process.env.EBAY_CLIENT_SECRET;
            this.ruName = process.env.EBAY_PROD_REDIRECT_URI || process.env.EBAY_REDIRECT_URI;
          }
        }

        // Load the stored access token from the database if present for this environment
        const dbKey = `ebay_access_token_${this.isSandbox ? 'sandbox' : 'prod'}`;
        db.get("SELECT value FROM settings WHERE key = ?", [dbKey], (err, tokenRow) => {
          if (!err && tokenRow) {
            this.accessToken = tokenRow.value;
            console.log(`[EbayService] Loaded stored accessToken from DB for ${this.isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
          } else {
            this.accessToken = null;
          }
          this.baseUrl = this.isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
          this.authUrl = this.isSandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';

          console.log(`EbayService configured for: ${this.isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
          resolve();
        });
      });
    });
  }

  getAuthUrl() {
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account'
    ].join(' ');
    
    const encodedRedirect = encodeURIComponent(this.ruName);
    const encodedScopes = encodeURIComponent(scopes);
    
    return `${this.authUrl}/oauth2/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=${encodedRedirect}&scope=${encodedScopes}`;
  }

  async exchangeCodeForToken(code) {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const tokenUrl = `${this.baseUrl}/identity/v1/oauth2/token`;
    
    try {
      const response = await axios.post(tokenUrl, 
        `grant_type=authorization_code&code=${code}&redirect_uri=${this.ruName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      this.accessToken = response.data.access_token;

      // Persist the token to the settings table
      const dbKey = `ebay_access_token_${this.isSandbox ? 'sandbox' : 'prod'}`;
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
        [dbKey, this.accessToken, this.accessToken],
        (err) => {
          if (err) {
            console.error('[EbayService] Failed to persist eBay access token to database:', err.message);
          } else {
            console.log('[EbayService] Successfully persisted eBay access token to database.');
          }
        }
      );

      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      console.error('eBay Token Exchange Error:', errorMsg);
      throw new Error(JSON.stringify(errorMsg));
    }
  }

  async uploadImageToEPS(localFilePath) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');

    // Resolve path relative to backend directory
    const resolvedPath = path.isAbsolute(localFilePath)
      ? localFilePath
      : path.resolve(__dirname, '../../', localFilePath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`Image path does not exist: ${resolvedPath}`);
      return null;
    }

    const tradingUrl = this.isSandbox
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
          'X-EBAY-API-IAF-TOKEN': this.accessToken
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

  async createInventoryItem(sku, itemData) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay. Please connect your account first.');

    // Upload local images to eBay Picture Services (EPS)
    const epsUrls = [];
    if (itemData.images) {
      try {
        const localPaths = JSON.parse(itemData.images);
        if (Array.isArray(localPaths)) {
          for (const localPath of localPaths) {
            console.log(`Uploading ${localPath} to eBay Picture Services...`);
            const epsUrl = await this.uploadImageToEPS(localPath);
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

    const body = {
      product: {
        title: itemData.title.substring(0, 80), // Max 80 chars
        description: itemData.style_details,
        imageUrls: epsUrls,
        aspects: {
          Brand: [itemData.brand || 'Unbranded'],
          Size: [itemData.size || 'N/A'],
          Material: [itemData.material || 'N/A'],
          Color: [(itemData.title.match(/Blue|Red|Black|White|Green|Orange|Purple|Yellow/i) || ['Multicolor'])[0]]
        }
      },
      condition: "USED_EXCELLENT",
      availability: {
        shipToLocationAvailability: { quantity: 1 }
      }
    };

    try {
      await axios.put(`${this.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, body, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
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

  async getInventoryItems() {
    console.log(`[EbayService] getInventoryItems starting... Token available: ${!!this.accessToken}`);
    if (!this.accessToken) {
      console.error('[EbayService] getInventoryItems called but accessToken is null!');
      throw new Error('Not authenticated with eBay');
    }

    // 1. Fetch modern SKU-based items
    let modernItems = [];
    console.log(`[EbayService] Fetching modern items from: ${this.baseUrl}/sell/inventory/v1/inventory_item`);
    try {
      const response = await axios.get(`${this.baseUrl}/sell/inventory/v1/inventory_item`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      if (response.data && response.data.inventoryItems) {
        modernItems = response.data.inventoryItems;
        console.log(`[EbayService] Found ${modernItems.length} modern items. Fetching offer details for Item IDs...`);
        // Fetch listingId for each item in parallel by querying offers
        await Promise.all(modernItems.map(async (item) => {
          try {
            const offerResponse = await axios.get(`${this.baseUrl}/sell/inventory/v1/offer?sku=${item.sku}`, {
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Language': 'en-US'
              }
            });
            const offers = offerResponse.data?.offers;
            if (offers && offers.length > 0) {
              const publishedOffer = offers.find(o => o.status === 'PUBLISHED') || offers[0];
              item.listingId = publishedOffer.listingId;
            }
          } catch (e) {
            console.error(`Failed to fetch offers for SKU ${item.sku}:`, e.message);
          }
        }));
      } else {
        console.log('[EbayService] Modern inventory response returned no inventoryItems.');
      }
    } catch (error) {
      console.error('[EbayService] Get Modern Inventory Error:', error.response?.data || error.message);
    }

    // 2. Fetch traditional listings
    let traditionalItems = [];
    console.log('[EbayService] Fetching traditional listings...');
    try {
      traditionalItems = await this.getTraditionalListings();
      console.log(`[EbayService] Found ${traditionalItems.length} traditional items.`);
    } catch (error) {
      console.error('[EbayService] Failed to retrieve traditional listings:', error.message);
    }

    // 3. Deduplicate and merge
    const modernListingIds = new Set(
      modernItems.map(item => item.listingId).filter(Boolean)
    );
    console.log('[EbayService] Modern Listing IDs:', Array.from(modernListingIds));

    const uniqueTraditional = traditionalItems.filter(item => {
      if (item.listingId && modernListingIds.has(item.listingId)) {
        console.log(`[EbayService] Traditional item ID ${item.listingId} skipped (already present in modern list).`);
        return false;
      }
      if (modernItems.some(mi => mi.sku === item.sku)) {
        console.log(`[EbayService] Traditional item SKU ${item.sku} skipped (already present in modern list).`);
        return false;
      }
      return true;
    });

    const combinedItems = [...modernItems, ...uniqueTraditional];
    console.log(`[EbayService] Merged inventory. Total items: ${combinedItems.length}`);
    return {
      inventoryItems: combinedItems,
      total: combinedItems.length
    };
  }

  async getTraditionalListings() {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');

    const tradingUrl = this.isSandbox
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    console.log(`[EbayService] Making GetMyeBaySelling call to: ${tradingUrl}`);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;

    try {
      const response = await axios.post(tradingUrl, xml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1235',
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': this.accessToken,
          'Content-Type': 'text/xml'
        }
      });

      const data = response.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid response from eBay Trading API');
      }

      const ackMatch = data.match(/<Ack>(.*?)<\/Ack>/);
      const ack = ackMatch ? ackMatch[1] : '';
      console.log(`[EbayService] GetMyeBaySelling Ack: ${ack}`);
      if (ack !== 'Success' && ack !== 'Warning') {
        const errorMatch = data.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMsg = errorMatch ? errorMatch[1] : 'Unknown eBay GetMyeBaySelling error';
        throw new Error(errorMsg);
      }

      return parseItemsFromXml(data);
    } catch (error) {
      console.error('[EbayService] Get Traditional Listings Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async endTraditionalListing(listingId) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');

    const tradingUrl = this.isSandbox
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
          'X-EBAY-API-IAF-TOKEN': this.accessToken,
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

  async deleteInventoryItem(sku) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');
    try {
      await axios.delete(`${this.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      return { status: 'success', sku };
    } catch (error) {
      console.error(`Delete Item ${sku} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getInventoryItem(sku) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');
    try {
      const response = await axios.get(`${this.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Language': 'en-US'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Get Item ${sku} Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  async updateInventoryItem(sku, updateData) {
    if (!this.accessToken) throw new Error('Not authenticated with eBay');
    try {
      // First get current item to ensure we have required fields
      const current = await this.getInventoryItem(sku);
      
      const body = {
        ...current,
        product: {
          ...current.product,
          ...updateData.product
        }
      };

      await axios.put(`${this.baseUrl}/sell/inventory/v1/inventory_item/${sku}`, body, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
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

  async createDraft(itemData) {
    const sku = `LM-${itemData.inventory_code || Date.now()}`;
    try {
      await this.createInventoryItem(sku, itemData);
      return { status: 'success', sku, message: 'Inventory item created successfully on eBay' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
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

function parseItemsFromXml(xml) {
  const items = [];
  const itemBlocks = xml.split('<Item>');
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i].split('</Item>')[0];

    const itemIdMatch = block.match(/<ItemID>(.*?)<\/ItemID>/);
    const titleMatch = block.match(/<Title>(.*?)<\/Title>/);
    const skuMatch = block.match(/<SKU>(.*?)<\/SKU>/);
    
    const qtyMatch = block.match(/<QuantityAvailable>(.*?)<\/QuantityAvailable>/) || block.match(/<Quantity>(.*?)<\/Quantity>/);
    
    const galleryUrlMatch = block.match(/<GalleryURL>(.*?)<\/GalleryURL>/);
    const pictureUrlMatches = block.match(/<PictureURL>(.*?)<\/PictureURL>/g) || [];
    
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

    items.push({
      sku: sku,
      listingId: itemId,
      product: {
        title: title,
        imageUrls: imageUrls
      },
      condition: "USED_EXCELLENT",
      availability: {
        shipToLocationAvailability: {
          quantity: quantity
        }
      },
      isTraditional: true
    });
  }
  return items;
}

module.exports = new EbayService();
