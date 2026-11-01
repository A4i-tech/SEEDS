function redactUrl(url) {
  return String(url).split("?")[0];
}

module.exports = redactUrl;
