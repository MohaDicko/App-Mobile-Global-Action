const https = require('https');
const http = require('http');
const { URL } = require('url');

const SAP_BASE =
  process.env.EXPO_PUBLIC_SAP_BASE_URL ||
  'https://ga-sap.safirconsulting.net:50000/b1s/v1';

module.exports = async (req, res) => {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, B1SESSION, X-B1SESSION, Prefer, B1S-ReplaceCollectionsOnPatch'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Set-Cookie, B1SESSION, Location'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const sapUrl = new URL(SAP_BASE);
    let subpath = '';
    if (req.query && req.query.path) {
      if (Array.isArray(req.query.path)) {
        subpath = '/' + req.query.path.join('/');
      } else {
        subpath = '/' + req.query.path.replace(/^\//, '');
      }
    } else {
      subpath = req.url.replace(/^\/api\/sap\/?/, '');
      if (subpath.startsWith('?path=')) {
        subpath = decodeURIComponent(subpath.replace('?path=', ''));
      }
      if (!subpath.startsWith('/')) subpath = '/' + subpath;
    }

    // Récupérer la chaîne de requête (ex: $select, $filter, $top, etc.) sans encoder les '$' d'OData
    let queryString = '';
    const queryIdx = req.url.indexOf('?');
    if (queryIdx !== -1) {
      const rawParts = req.url.slice(queryIdx + 1).split('&');
      const keptParts = rawParts.filter((p) => p && !p.startsWith('path='));
      if (keptParts.length > 0) {
        queryString = '?' + keptParts.join('&');
      }
    }

    const targetPath = `${sapUrl.pathname.replace(/\/$/, '')}${subpath}${queryString}`;

    // Construire des en-têtes propres vers SAP Service Layer
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'identity',
      'Connection': 'close',
    };
    if (req.headers['prefer']) {
      headers['Prefer'] = req.headers['prefer'];
    }
    if (req.headers['b1s-replacecollectionsonpatch']) {
      headers['B1S-ReplaceCollectionsOnPatch'] = req.headers['b1s-replacecollectionsonpatch'];
    }
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
    }

    // Convertir l'en-tête B1SESSION / X-B1SESSION (autorisé en navigateur W3C) en Cookie SAP
    const b1session = req.headers['b1session'] || req.headers['x-b1session'];
    if (b1session) {
      const existing = headers['Cookie'] || '';
      if (!existing.includes('B1SESSION')) {
        headers['Cookie'] = existing ? `${existing}; B1SESSION=${b1session}` : `B1SESSION=${b1session}`;
      }
    }

    const bodyBuffer =
      req.method !== 'GET' && req.method !== 'HEAD' && req.body != null
        ? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
        : null;

    if (bodyBuffer) {
      headers['Content-Length'] = bodyBuffer.length;
    }

    const options = {
      hostname: sapUrl.hostname,
      port: parseInt(sapUrl.port, 10) || 50000,
      path: targetPath,
      method: req.method,
      headers: headers,
      rejectUnauthorized: false,
      timeout: 20000,
    };

    const client = sapUrl.protocol === 'http:' ? http : https;

    const proxyReq = client.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const responseBuffer = Buffer.concat(chunks);
        res.status(proxyRes.statusCode || 200);

        Object.entries(proxyRes.headers).forEach(([key, val]) => {
          const lower = key.toLowerCase();
          if (!['content-length', 'connection', 'transfer-encoding', 'content-encoding', 'keep-alive'].includes(lower) && val !== undefined) {
            res.setHeader(key, val);
          }
        });

        res.setHeader('Content-Length', responseBuffer.length);
        res.end(responseBuffer);
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[SAP Proxy Error]', err.message);
      res.status(502).json({
        error: {
          code: 'PROXY_SAP_ERROR',
          message: { value: `Erreur passerelle SAP: ${err.message}` },
        },
      });
    });

    if (bodyBuffer) {
      proxyReq.write(bodyBuffer);
      proxyReq.end();
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  } catch (error) {
    console.error('[SAP Proxy Handler Error]', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_PROXY_ERROR',
        message: { value: error.message },
      },
    });
  }
};
