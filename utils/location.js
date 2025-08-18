// Location utility functions

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Validate GPS coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {boolean} True if coordinates are valid
 */
function validateCoordinates(latitude, longitude) {
  return (
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Check if user is within allowed radius of trash location
 * @param {number} userLat 
 * @param {number} userLon 
 * @param {number} trashLat 
 * @param {number} trashLon 
 * @param {number} maxDistance - Maximum allowed distance in meters (default: 50)
 * @returns {object} { isWithinRadius: boolean, distance: number }
 */
function checkProximity(userLat, userLon, trashLat, trashLon, maxDistance = 50) {
  const distance = calculateDistance(userLat, userLon, trashLat, trashLon);
  return {
    isWithinRadius: distance <= maxDistance,
    distance: Math.round(distance)
  };
}

module.exports = {
  calculateDistance,
  validateCoordinates,
  checkProximity
};