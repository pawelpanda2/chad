require('dotenv').config();

const config = {
  port: process.env.PORT || 12026,
  pluginRoot: process.env.PLUGIN_ROOT || '',
};

if (!config.pluginRoot) {
  console.error('ERROR: PLUGIN_ROOT environment variable is required');
  process.exit(1);
}

module.exports = config;