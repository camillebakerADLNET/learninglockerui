/**
 * Convert from ASCII -> Base64
 * @param {string} asciiString String to decode
 * @returns base64String
 */
function base64(asciiString) {
  return ((new Buffer(asciiString, 'ascii')).toString('base64'));
}

/**
 * Convert from Base 64 -> ASCII
 * @param {string} base64String String to decode
 * @returns 
 */
function unbase64(base64String) {
  return ((new Buffer(base64String, 'base64')).toString('ascii'));
}

export function toCursor(data) {
  return base64(JSON.stringify(data));
}

export function fromCursor(cursor) {
  if (cursor) {
    try {
      return JSON.parse(unbase64(cursor)) || null;
    } catch (err) {
      return null;
    }
  }
  return null;
}
