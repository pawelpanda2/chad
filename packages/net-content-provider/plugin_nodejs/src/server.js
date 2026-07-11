const http = require('http');
const url = require('url');
const config = require('./config');
const { resolvePath } = require('./pathResolver');
const { openFileInNova, openFolder, openTerminal } = require('./osaRunner');

// Swagger UI HTML (served from CDN)
const swaggerUIHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plugin Node.js - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/swagger.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`;

// Swagger JSON specification
function getSwaggerSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Plugin Node.js API',
      version: '1.0.0',
      description: 'Local HTTP plugin for opening files and terminals on macOS'
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development server'
      }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Returns the health status of the plugin',
          responses: {
            '200': {
              description: 'Plugin is running',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/openconfig/{address}': {
        get: {
          summary: 'Open config file',
          description: 'Opens config.yaml file in Nova editor',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Address in format: {UUID}-{local} or {32-hex}-{local}. Examples: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01 or 6a2c9428afbc81918be759b6e4e8493d-01-02',
              example: '0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01'
            }
          ],
          responses: {
            '200': {
              description: 'File opened successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'File opened' },
                      path: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Invalid address format' },
            '404': { description: 'File not found' }
          }
        }
      },
      '/openbody/{address}': {
        get: {
          summary: 'Open body file',
          description: 'Opens body.txt file in Nova editor',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Address in format: {UUID}-{local} or {32-hex}-{local}. Examples: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01 or 6a2c9428afbc81918be759b6e4e8493d-01-02',
              example: '0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01'
            }
          ],
          responses: {
            '200': {
              description: 'File opened successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'File opened' },
                      path: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Invalid address format' },
            '404': { description: 'File not found' }
          }
        }
      },
      '/openfolder/{address}': {
        get: {
          summary: 'Open folder in Finder',
          description: 'Opens the folder in Finder. Supports full UUID address or just UUID to open repo root.',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Address in format: {UUID}-{local} or just {UUID}. Examples: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01 or 0fc7da8d-3466-4964-a24c-dfc0d0fef87c',
              example: '0fc7da8d-3466-4964-a24c-dfc0d0fef87c'
            }
          ],
          responses: {
            '200': {
              description: 'Folder opened successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Folder opened' },
                      path: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Invalid address format' },
            '404': { description: 'Folder not found' }
          }
        }
      },
      '/terminal/{address}': {
        get: {
          summary: 'Open terminal',
          description: 'Opens Terminal in the specified folder',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Address in format: {UUID}-{local} or {32-hex}-{local}. Examples: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01 or 6a2c9428afbc81918be759b6e4e8493d-01-02',
              example: '0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01'
            }
          ],
          responses: {
            '200': {
              description: 'Terminal opened successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Terminal opened' },
                      path: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Invalid address format' },
            '404': { description: 'Folder not found' }
          }
        }
      }
    }
  };
}

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper function to send HTML response
function sendHTML(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html' });
  res.end(html);
}

// Extract address from URL path
function extractAddress(pathname, basePath) {
  if (!pathname.startsWith(basePath)) {
    return null;
  }
  const address = pathname.substring(basePath.length + 1);
  return address || null;
}

// Request handler
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: /health
  if (pathname === '/health' && method === 'GET') {
    sendJSON(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Route: /swagger
  if (pathname === '/swagger' && method === 'GET') {
    sendHTML(res, 200, swaggerUIHtml);
    return;
  }

  // Route: /swagger.json
  if (pathname === '/swagger.json' && method === 'GET') {
    sendJSON(res, 200, getSwaggerSpec());
    return;
  }

  // Route: /openconfig/{address}
  if (pathname.startsWith('/openconfig/') && method === 'GET') {
    const address = extractAddress(pathname, '/openconfig');
    if (!address) {
      sendJSON(res, 400, { error: 'Address parameter is required' });
      return;
    }

    try {
      const filePath = resolvePath(address, 'config.yaml');
      
      // Check if file exists
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        sendJSON(res, 404, { error: `File not found: ${filePath}` });
        return;
      }

      await openFileInNova(filePath);
      sendJSON(res, 200, { message: 'File opened', path: filePath });
    } catch (error) {
      sendJSON(res, 400, { error: error.message });
    }
    return;
  }

  // Route: /openbody/{address}
  if (pathname.startsWith('/openbody/') && method === 'GET') {
    const address = extractAddress(pathname, '/openbody');
    if (!address) {
      sendJSON(res, 400, { error: 'Address parameter is required' });
      return;
    }

    try {
      const filePath = resolvePath(address, 'body.txt');
      
      // Check if file exists
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        sendJSON(res, 404, { error: `File not found: ${filePath}` });
        return;
      }

      await openFileInNova(filePath);
      sendJSON(res, 200, { message: 'File opened', path: filePath });
    } catch (error) {
      sendJSON(res, 400, { error: error.message });
    }
    return;
  }

  // Route: /openfolder/{address}
  if (pathname.startsWith('/openfolder/') && method === 'GET') {
    const address = extractAddress(pathname, '/openfolder');
    if (!address) {
      sendJSON(res, 400, { error: 'Address parameter is required' });
      return;
    }

    try {
      const folderPath = resolvePath(address);
      
      // Check if folder exists
      const fs = require('fs');
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        sendJSON(res, 404, { error: `Folder not found: ${folderPath}` });
        return;
      }

      await openFolder(folderPath);
      sendJSON(res, 200, { message: 'Folder opened', path: folderPath });
    } catch (error) {
      sendJSON(res, 400, { error: error.message });
    }
    return;
  }

  // Route: /terminal/{address}
  if (pathname.startsWith('/terminal/') && method === 'GET') {
    const address = extractAddress(pathname, '/terminal');
    if (!address) {
      sendJSON(res, 400, { error: 'Address parameter is required' });
      return;
    }

    try {
      const folderPath = resolvePath(address);
      
      // Check if folder exists
      const fs = require('fs');
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        sendJSON(res, 404, { error: `Folder not found: ${folderPath}` });
        return;
      }

      await openTerminal(folderPath);
      sendJSON(res, 200, { message: 'Terminal opened', path: folderPath });
    } catch (error) {
      sendJSON(res, 400, { error: error.message });
    }
    return;
  }

  // 404 for unknown routes
  sendJSON(res, 404, { error: 'Not found', path: pathname });
}

// Create and start the server
const server = http.createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`Plugin Node.js server running on http://localhost:${config.port}`);
  console.log(`Swagger UI available at http://localhost:${config.port}/swagger`);
  console.log(`Swagger JSON available at http://localhost:${config.port}/swagger.json`);
  console.log(`Health check available at http://localhost:${config.port}/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});