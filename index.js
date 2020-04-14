const HLSSpliceVod = require('@eyevinn/hls-splice');
const fetch = require('node-fetch');

exports.handler = async event => {
  let response;

  if (event.path === "/" && event.httpMethod === "POST") {
    response = await handleCreateRequest(event);
  } else if (event.path === "/stitch/master.m3u8") {
    response = await handleMasterManifestRequest(event);
  } else if (event.path === "/stitch/media.m3u8") {
    response = await handleMediaManifestRequest(event);
  } else {
    response = generateErrorResponse({ code: 404 });
  }

  return response;
};

const deserialize = base64data => {
  const buff = Buffer.from(base64data, 'base64');
  return JSON.parse(buff.toString('ascii'))
};

const serialize = payload => {
  const buff = Buffer.from(JSON.stringify(payload));
  return buff.toString('base64');
};

const generateErrorResponse = ({ code: code, message: message }) => {
  let response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (message) {
    response.body = JSON.stringify({ reason: message });
  }
  return response;
};

const generateManifestResponse = manifest => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl'
    },
    body: manifest
  }
};

const handleCreateRequest = async (event) => {
  try {
    if (!event.body) {
      return generateErrorResponse(400, "Missing request body");
    } else {
      const payload = JSON.parse(event.body);
      console.log("Received request to create stitched manifest");
      console.log(payload);
      if (!payload.uri) {
        return generateErrorResponse(400, "Missing uri in payload");
      }
      let responseBody = {
        uri: "/stitch/master.m3u8?payload=" + serialize(payload)
      };
      let response = {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(responseBody)
      };
      return response;
    }

  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500, "Failed to create stitch request");
  }
};

const handleMediaManifestRequest = async (event) => {
  try {
    const bw = event.queryStringParameters.bw;
    const encodedPayload = event.queryStringParameters.payload;
    console.log(`Received request /media.m3u8 (bw=${bw}, payload=${encodedPayload})`);
    const hlsVod = await createVodFromPayload(encodedPayload, { baseUrlFromSource: true });
    const mediaManifest = (await hlsVod).getMediaManifest(bw);
    return generateManifestResponse(mediaManifest);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500, "Failed to generate media manifest");
  }
};

const handleMasterManifestRequest = async (event) => {
  try {
    const encodedPayload = event.queryStringParameters.payload;
    console.log(`Received request /master.m3u8 (payload=${encodedPayload})`);
    const manifest = await getMasterManifest(encodedPayload);
    const rewrittenManifest = await rewriteMasterManifest(manifest, encodedPayload);
    return generateManifestResponse(rewrittenManifest);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500, "Failed to generate master manifest");
  }
};

const getMasterManifest = async (encodedPayload, opts) => {
  const payload = deserialize(encodedPayload);
  const response = await fetch(payload.uri);
  return await response.text();
};

const rewriteMasterManifest = async (manifest, encodedPayload) => {
  let rewrittenManifest = "";
  const lines = manifest.split("\n");
  let bw = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if ((m = l.match(/BANDWIDTH=(.*?)\D+/))) {
      bw = m[1];
      if (!l.match(/^#EXT-X-I-FRAME-STREAM-INF/)) {
        rewrittenManifest += l + "\n";
      }
    } else if ((m = l.match(/^[^#]/))) {
      rewrittenManifest += "/stitch/media.m3u8?bw=" + bw + "&payload=" + encodedPayload + "\n";
    } else {
      rewrittenManifest += l + "\n";
    }
  }
  return rewrittenManifest;
};

const createVodFromPayload = async (encodedPayload, opts) => {
  const payload = deserialize(encodedPayload);

  const uri = payload.uri;
  let vodOpts = {
    merge: true
  };
  if (opts && opts.baseUrlFromSource) {
    const m = uri.match('^(.*)/.*?');
    if (m) {
      vodOpts.baseUrl = m[1] + "/";
    }
  }

  const hlsVod = new HLSSpliceVod(uri, vodOpts);
  await hlsVod.load();
  adpromises = [];
  for (let i = 0; i < payload.breaks.length; i++) {
    const b = payload.breaks[i];
    adpromises.push(() => hlsVod.insertAdAt(b.pos, b.url));
  }
  for (let promiseFn of adpromises.reverse()) {
    await promiseFn();
  }
  return hlsVod;
};