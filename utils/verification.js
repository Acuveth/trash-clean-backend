const sharp = require('sharp');
const crypto = require('crypto');

/**
 * Mock AI verification function
 * In production, this would call OpenAI Vision API or similar
 * @param {Buffer} imageBuffer 
 * @param {string} trashDescription 
 * @returns {Promise<object>} Verification result
 */
async function verifyPickupPhoto(imageBuffer, trashDescription) {
  // Mock implementation for development
  // In production, integrate with OpenAI Vision API or similar
  
  try {
    // For now, return mock verification with random confidence
    // Replace this with actual AI API call
    const mockConfidence = 0.7 + Math.random() * 0.3; // Random between 0.7 and 1.0
    
    return {
      isHoldingTrash: true,
      confidence: mockConfidence,
      matchesDescription: true,
      message: "Verification successful (mock)"
    };
    
    /* Production implementation would look like:
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: "You are verifying if someone is holding trash in their hand for a cleanup verification system."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Is someone holding trash in their hand in this photo? 
                     Expected trash: ${trashDescription}
                     Return JSON: { "isHoldingTrash": boolean, "confidence": 0-1, "matchesDescription": boolean }`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 150
    });
    
    return JSON.parse(response.choices[0].message.content);
    */
  } catch (error) {
    console.error('Error in AI verification:', error);
    throw new Error('Failed to verify image');
  }
}

/**
 * Generate a hash for an image to detect duplicates
 * @param {Buffer} imageBuffer 
 * @returns {string} Image hash
 */
function generateImageHash(imageBuffer) {
  return crypto.createHash('sha256').update(imageBuffer).digest('hex');
}

/**
 * Compress and resize image for storage
 * @param {Buffer} imageBuffer 
 * @param {object} options 
 * @returns {Promise<Buffer>} Compressed image buffer
 */
async function processImage(imageBuffer, options = {}) {
  const { maxWidth = 1920, maxHeight = 1080, quality = 85 } = options;
  
  try {
    return await sharp(imageBuffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality })
      .toBuffer();
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image');
  }
}

/**
 * Check if pickup attempt is within rate limits
 * @param {Array} recentPickups 
 * @param {number} maxPickupsPerHour 
 * @returns {object} { allowed: boolean, remaining: number }
 */
function checkRateLimit(recentPickups, maxPickupsPerHour = 10) {
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recentCount = recentPickups.filter(
    pickup => new Date(pickup.created_at) > oneHourAgo
  ).length;
  
  return {
    allowed: recentCount < maxPickupsPerHour,
    remaining: Math.max(0, maxPickupsPerHour - recentCount)
  };
}

module.exports = {
  verifyPickupPhoto,
  generateImageHash,
  processImage,
  checkRateLimit
};