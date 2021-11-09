const HLSSpliceVod = require('@eyevinn/hls-splice');
const fetch = require('node-fetch');
const querystring = require('querystring');

exports.handler = async event => {
  let response;

  if (event.path === "/stitch/" && event.httpMethod === "POST") {
    response = await handleCreateRequest(event);
  } else if (event.path === "/stitch/master.m3u8") {
    response = await handleMasterManifestRequest(event);
  } else if (event.path === "/stitch/media.m3u8") {
    response = await handleMediaManifestRequest(event);
  } else if (event.path.match(/\/stitch\/assetlist\/.*$/)) {
    response = await handleAssetListRequest(event);
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

const generateJSONResponse = ({ code: code, data: data }) => {
  let response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (data) {
    response.body = JSON.stringify(data);
  } else {
    response.body = "{}";
  }
  return response;
};

const handleCreateRequest = async (event) => {
  try {
    if (!event.body) {
      return generateErrorResponse({ code: 400, message: "Missing request body" });
    } else {
      const payload = JSON.parse(event.body);
      console.log("Received request to create stitched manifest");
      console.log(payload);
      if (!payload.uri) {
        return generateErrorResponse({ code: 400, message: "Missing uri in payload" });
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
    return generateErrorResponse({ code: 500, message: "Failed to create stitch request" });
  }
};

const handleMediaManifestRequest = async (event) => {
  try {
    const bw = event.queryStringParameters.bw;
    const encodedPayload = event.queryStringParameters.payload;
    const useInterstitial = event.queryStringParameters.i && event.queryStringParameters.i === "1";
    console.log(`Received request /media.m3u8 (bw=${bw}, payload=${encodedPayload}, useInterstitial=${useInterstitial})`);
    const hlsVod = await createVodFromPayload(encodedPayload, { 
      baseUrlFromSource: true, 
      subdir: event.queryStringParameters.subdir,
      useInterstitial 
    });
    const mediaManifest = (await hlsVod).getMediaManifest(bw);
    return generateManifestResponse(mediaManifest);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse({ code: 500, message: "Failed to generate media manifest" });
  }
};

const handleMasterManifestRequest = async (event) => {
  try {
    const encodedPayload = event.queryStringParameters.payload;
    console.log(`Received request /master.m3u8 (payload=${encodedPayload})`);
    if (!encodedPayload) {
      console.error(`Request missing payload`);
      console.log(event.queryStringParameters);
      return generateErrorResponse({ code: 400, message: "Missing payload in request" });
    } else {
      const useInterstitial = event.queryStringParameters.i && event.queryStringParameters.i === "1";
      const manifest = await getMasterManifest(encodedPayload);
      const rewrittenManifest = await rewriteMasterManifest(manifest, encodedPayload, { useInterstitial });
      return generateManifestResponse(rewrittenManifest);
    }
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse({ code: 500, message: "Failed to generate master manifest" });
  }
};

const handleAssetListRequest = async (event) => {
  try {
    let encodedPayload;
    const m = event.path.match(/\/assetlist\/(.*)$/);
    if (m) {
      encodedPayload = m[1];
    }
    console.log(`Received request /assetlist (payload=${encodedPayload})`);
    if (!encodedPayload) {
      console.error("Request missing payload");
      console.log(event.queryStringParameters);
      return generateErrorResponse({ code: 400, message: "Missing payload in request" });
    } else {
      const assetlist = await createAssetListFromPayload(encodedPayload);
      return generateJSONResponse({ code: 200, data: assetlist });
    }
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse({ code: 500, message: "Failed to generate an assetlist" });
  }
};

const getMasterManifest = async (encodedPayload, opts) => {
  const payload = deserialize(encodedPayload);
  const response = await fetch(payload.uri);
  return await response.text();
};

const rewriteMasterManifest = async (manifest, encodedPayload, opts) => {
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
      let subdir = "";
      let n = l.match('^(.*)/.*?');
      if (n) {
        subdir = n[1];
      }
      let useInterstitial = opts && opts.useInterstitial;
      rewrittenManifest += "/stitch/media.m3u8?bw=" + bw + 
        "&payload=" + encodedPayload + 
        (subdir ? "&subdir=" + subdir : "") + 
        (useInterstitial ? "&i=1" : "") +
        "\n";
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
    if (opts.subdir) {
      vodOpts.baseUrl += opts.subdir + "/";
    }
  }

  const hlsVod = new HLSSpliceVod(uri, vodOpts);
  await hlsVod.load();
  adpromises = [];
  let id = 0;
  for (let i = 0; i < payload.breaks.length; i++) {
    const b = payload.breaks[i];
    if (opts && opts.useInterstitial) {
      const assetListPayload = {
        assets: [ { uri: b.url, dur: b.duration / 1000 }]
      };
      const encodedAssetListPayload = querystring.escape(serialize(assetListPayload));
      const assetListUri = `/stitch/assetlist/${encodedAssetListPayload}`;
      adpromises.push(() => hlsVod.insertInterstitialAt(b.pos, `${++id}`, assetListUri, true));
    } else {
      adpromises.push(() => hlsVod.insertAdAt(b.pos, b.url));
    }
  }
  for (let promiseFn of adpromises.reverse()) {
    await promiseFn();
  }
  return hlsVod;
};

const createAssetListFromPayload = async (encodedPayload) => {
  const payload = deserialize(querystring.unescape(encodedPayload));
  let assetDescriptions = [];
  for (let i = 0; i < payload.assets.length; i++) {
    const asset = payload.assets[i];
    assetDescriptions.push({
      URI: asset.uri,
      DURATION: asset.dur,
    });
  }
  return { ASSETS: assetDescriptions };
};