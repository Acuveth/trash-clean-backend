const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

// Initialize Google OAuth2 client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google OAuth2 access token and user info
 * @param {string} accessToken - Google OAuth2 access token
 * @param {object} userInfo - User info from frontend
 * @returns {Promise<object|null>} Verified user info or null if invalid
 */
async function verifyGoogleToken(accessToken, userInfo) {
  try {
    // Verify the access token with Google's userinfo endpoint
    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`,
      {
        timeout: 10000, // 10 second timeout
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const googleUserInfo = response.data;

    // Verify the user info matches what was sent from frontend
    if (googleUserInfo.id !== userInfo.id || googleUserInfo.email !== userInfo.email) {
      console.error('Google token verification failed: User info mismatch');
      return null;
    }

    // Return verified user info with standardized format
    return {
      id: googleUserInfo.id,
      email: googleUserInfo.email,
      name: googleUserInfo.name,
      given_name: googleUserInfo.given_name,
      family_name: googleUserInfo.family_name,
      picture: googleUserInfo.picture,
      verified_email: googleUserInfo.verified_email
    };

  } catch (error) {
    console.error('Google token verification failed:', error.message);
    return null;
  }
}


/**
 * Verify OAuth2 token based on provider
 * @param {string} provider - OAuth provider ('google' only)
 * @param {string} accessToken - OAuth2 access token
 * @param {object} userInfo - User info from frontend
 * @returns {Promise<object|null>} Verified user info or null if invalid
 */
async function verifyOAuthToken(provider, accessToken, userInfo) {
  switch (provider.toLowerCase()) {
    case 'google':
      return await verifyGoogleToken(accessToken, userInfo);
    default:
      console.error(`Unsupported OAuth provider: ${provider}. Only Google is supported.`);
      return null;
  }
}

/**
 * Validate OAuth request data
 * @param {object} requestData - Request data from frontend
 * @returns {object} Validation result with errors if any
 */
function validateOAuthRequest(requestData) {
  const errors = [];
  
  if (!requestData.provider) {
    errors.push('OAuth provider is required');
  } else if (!['google'].includes(requestData.provider.toLowerCase())) {
    errors.push('Unsupported OAuth provider. Only Google is supported');
  }
  
  if (!requestData.accessToken) {
    errors.push('Access token is required');
  }
  
  if (!requestData.userInfo) {
    errors.push('User info is required');
  } else {
    if (!requestData.userInfo.id) {
      errors.push('User ID is required in userInfo');
    }
    if (!requestData.userInfo.email) {
      errors.push('Email is required in userInfo');
    }
    if (!requestData.userInfo.name) {
      errors.push('Name is required in userInfo');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generate profile picture URL for user
 * @param {string} provider - OAuth provider
 * @param {string} pictureUrl - Original picture URL from provider
 * @returns {string} Processed picture URL
 */
function processProfilePicture(provider, pictureUrl) {
  if (!pictureUrl) return null;
  
  // For Google, ensure we get a high-quality image
  if (provider === 'google' && pictureUrl.includes('googleusercontent.com')) {
    return pictureUrl.replace(/=s\d+(-c)?$/, '=s400-c');
  }
  
  return pictureUrl;
}

module.exports = {
  verifyGoogleToken,
  verifyOAuthToken,
  validateOAuthRequest,
  processProfilePicture
};