const HLSSpliceVod = require("@eyevinn/hls-splice");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  let response;
  let prefix = "/stitch";
  if (process.env.PREFIX) {
    prefix = process.env.PREFIX;
  }

  if (event.path === `${prefix}/` && event.httpMethod === "POST") {
    response = await handleCreateRequest(event);
  } else if (event.path.match(`${prefix}*`) && event.httpMethod === "OPTIONS") {
    response = await handleOptionsRequest();
  } else if (event.path === `${prefix}/master.m3u8`) {
    response = await handleMasterManifestRequest(event);
  } else if (event.path === `${prefix}/media.m3u8`) {
    response = await handleMediaManifestRequest(event);
  } else if (event.path === `${prefix}/audio.m3u8`) {
    response = await handleAudioManifestRequest(event);
  } else if (event.path.match(/\/stitch\/assetlist\/.*$/)) {
    response = await handleAssetListRequest(event);
  } else if (event.path === "/" && event.httpMethod === "GET") {
    response = {
      statusCode: 200,
      body: "OK",
    };
  } else {
    response = generateErrorResponse({ code: 404 });
  }

  return response;
};

const deserialize = (base64data) => {
  const buff = Buffer.from(base64data, "base64");
  return JSON.parse(buff.toString("ascii"));
};

const serialize = (payload) => {
  const buff = Buffer.from(JSON.stringify(payload));
  return buff.toString("base64");
};

const generateErrorResponse = ({ code: code, message: message }) => {
  let response = {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };
  if (message) {
    response.body = JSON.stringify({ reason: message });
  }
  return response;
};

const generateManifestResponse = (manifest) => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
    },
    body: manifest,
  };
};

const generateJSONResponse = ({ code: code, data: data }) => {
  let response = {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };
  if (data) {
    response.body = JSON.stringify(data);
  } else {
    response.body = "{}";
  }
  return response;
};

const generateOptionsResponse = () => {
  let response = {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Origin",
      "Access-Control-Max-Age": "86400",
    },
  };
  return response;
};

const handleOptionsRequest = async () => {
  try {
    return generateOptionsResponse();
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse({ code: 500, message: "Failed to respond to OPTIONS request" });
  }
};

const handleCreateRequest = async (event) => {
  const prefix = process.env.PREFIX ? process.env.PREFIX : "/stitch";
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
        uri: `${prefix}/master.m3u8?payload=` + serialize(payload),
      };
      let response = {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(responseBody),
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
    const combineInterstitial = event.queryStringParameters.c && event.queryStringParameters.c === "1";
    console.log(
      `Received request /media.m3u8 (bw=${bw}, payload=${encodedPayload}, useInterstitial=${useInterstitial}, combineInterstitial=${combineInterstitial})`
    );
    const hlsVod = await createVodFromPayload(encodedPayload, {
      baseUrlFromSource: true,
      subdir: event.queryStringParameters.subdir,
      useInterstitial,
      combineInterstitial,
    });
    const mediaManifest = (await hlsVod).getMediaManifest(bw);
    return generateManifestResponse(mediaManifest);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse({ code: 500, message: "Failed to generate media manifest" });
  }
};

const handleAudioManifestRequest = async (event) => {
  try {
    const groupid = event.queryStringParameters.groupid;
    const language = event.queryStringParameters.language;
    const encodedPayload = event.queryStringParameters.payload;
    const useInterstitial = event.queryStringParameters.i && event.queryStringParameters.i === "1";
    const combineInterstitial = event.queryStringParameters.c && event.queryStringParameters.c === "1";
    console.log(
      `Received request /audio.m3u8 (groupid=${groupid}, lang=${language}, payload=${encodedPayload}, useInterstitial=${useInterstitial}, combineInterstitial=${combineInterstitial})`
    );
    const hlsVod = await createVodFromPayload(encodedPayload, {
      baseUrlFromSource: true,
      subdir: event.queryStringParameters.subdir,
      useInterstitial,
      combineInterstitial,
    });
    const audioManifest = await hlsVod.getAudioManifest(groupid, language);
    return generateManifestResponse(audioManifest);
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
      const combineInterstitial = event.queryStringParameters.c && event.queryStringParameters.c === "1";
      const nosubs = event.queryStringParameters.f && event.queryStringParameters.f === "nosubtitles";
      const manifest = await getMasterManifest(encodedPayload);
      const rewrittenManifest = await rewriteMasterManifest(manifest, encodedPayload, {
        useInterstitial,
        combineInterstitial,
        nosubs,
      });
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
  const prefix = process.env.PREFIX ? process.env.PREFIX : "/stitch";
  let rewrittenManifest = "";
  const lines = manifest.split("\n");
  let bw = null;
  let group = null;
  let grouplang = null;
  let trackname = null;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (opts && opts.nosubs) {
      if (l.includes("#EXT-X-MEDIA") && l.includes("TYPE=SUBTITLES")) {
        continue;
      }
      if (l.includes("#EXT-X-STREAM-INF") && l.includes("SUBTITLES")) {
        let splitLines = l.split(",");
        let withoutSubs = splitLines.filter((s) => !s.includes("SUBTITLES"));
        l = withoutSubs.join(",");
      }
    }

    if (l.includes("#EXT-X-MEDIA") && l.includes("TYPE=AUDIO") && l.includes("GROUP-ID")) {
      let subdir = "";
      let splitLines = l.split(",");
      let audioUri = splitLines.filter((s) => s.includes("URI="));
      group = splitLines.filter((s) => s.includes("GROUP-ID="));
      grouplang = splitLines.filter((s) => s.includes("LANGUAGE="));
      trackname = splitLines.filter((s) => s.includes("NAME="));
      group = group.length > 0 ? group[0].split("=").pop().replace('"', "").replace('"', "") : group;
      grouplang =
        grouplang.length > 0
          ? grouplang[0].split("=").pop().replace('"', "").replace('"', "")
          : trackname.length > 0
          ? trackname[0].split("=").pop().replace('"', "").replace('"', "")
          : grouplang;
      if (audioUri.length > 0) {
        let aUri = audioUri[0].slice(5);
        if ((m = aUri.match(/^[^#]/))) {
          let n = aUri.match("^(.*)/.*?");
          if (n) {
            subdir = n[1];
          }
        }
        let newUri = "";
        let useInterstitial = opts && opts.useInterstitial;
        let combineInterstitial = opts && opts.combineInterstitial;
        newUri =
          `${prefix}/audio.m3u8?groupid=` +
          group +
          "&language=" +
          grouplang +
          "&payload=" +
          encodedPayload +
          (subdir ? "&subdir=" + subdir : "") +
          (useInterstitial ? "&i=1" : "") +
          (combineInterstitial ? "&c=1" : "");
        let withoutUri = splitLines.filter((s) => !s.includes("URI="));
        withoutUri.push(`URI="${newUri}"\n`);
        const fixedline = withoutUri.join(",");
        rewrittenManifest += fixedline;
        continue;
      }
    }
    if ((m = l.match(/BANDWIDTH=(.*?)\D+/))) {
      bw = m[1];
      if (!l.match(/^#EXT-X-I-FRAME-STREAM-INF/)) {
        rewrittenManifest += l + "\n";
      }
    } else if ((m = l.match(/^[^#]/))) {
      let subdir = "";
      let n = l.match("^(.*)/.*?");
      if (n) {
        subdir = n[1];
      }
      let useInterstitial = opts && opts.useInterstitial;
      let combineInterstitial = opts && opts.combineInterstitial;
      rewrittenManifest +=
        `${prefix}/media.m3u8?bw=` +
        bw +
        "&payload=" +
        encodedPayload +
        (subdir ? "&subdir=" + subdir : "") +
        (useInterstitial ? "&i=1" : "") +
        (combineInterstitial ? "&c=1" : "") +
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
    merge: true,
  };
  if (opts && opts.baseUrlFromSource) {
    const m = uri.match("^(.*)/.*?");
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

  if (opts && (opts.useInterstitial || opts.combineInterstitial)) {
    const assetListPayload = {
      assets: [],
    };
    const GroupBreaks = (breaks) => {
      console.log(breaks, 10077)
      let groupedBreaks = {};
      breaks.forEach((b) => {
        if (!groupedBreaks[b.pos]) {
          groupedBreaks[b.pos] = [];
        }
        groupedBreaks[b.pos].push(b);
      });

      const breakKeys = Object.keys(groupedBreaks);
      // for each break check if any item in list has 'assetListUrl' property AND no 'url' property
      // if so, then add the 'assetListUrl' property to all items in the list, and remove the item with 'assetListUrl' property and no 'url' property
      for (let i = 0; i < breakKeys.length; i++) {
        let breakItems = groupedBreaks[breakKeys[i]];
        let assetListUrlItem = breakItems.filter((b) => b.assetListUrl && !b.url);
        if (assetListUrlItem.length > 0) {
          const assetListUrl = assetListUrlItem[0].assetListUrl;
          breakItems.forEach((b) => {
            if (b.url) {
              b.assetListUrl = assetListUrl;
            }
          });
          console.log(breakItems, 10079)
          
          breakItems = breakItems.filter((b) => b.url !== undefined);
        }
        groupedBreaks[breakKeys[i]] = breakItems;
      }
      console.log(groupedBreaks, 10078)
      return groupedBreaks;
    };
    // check if any breaks have a 'assetListUrl' property
    // if so, then filter out all breakItems that have 'assetListUrl' property
    let payloadBreaksToUse;
    const breaksWithAssetList = payload.breaks.filter((b) => b.assetListUrl !== undefined);
    if (breaksWithAssetList.length > 0 && !opts.combineInterstitial) {
      payloadBreaksToUse = breaksWithAssetList;
    } else {
      payloadBreaksToUse = payload.breaks;
    }
    const breakGroupsDict = GroupBreaks(payloadBreaksToUse);
    let previousBreakDuration = 0;
    let _id = Object.keys(breakGroupsDict).length + 1;
    for (let bidx = 0; bidx < Object.keys(breakGroupsDict).length; bidx++) {
      assetListPayload.assets = []; // Reset Asset List Payload
      let breakPosition = Object.keys(breakGroupsDict)[bidx];
      const breakGroup = breakGroupsDict[breakPosition];
      let breakDur = 0;
      let interstitialOpts = {
        resumeOffset: 0,
      };
      let ASSET_LIST_URL;
      let insertAtListPromises = [];
      // For every ad with the same position
      for (let ad of breakGroup) {
        // Get All HLS Interstitial options
        if (ad.pol !== undefined) {
          interstitialOpts.playoutLimit = ad.pol;
        }
        if (ad.cue !== undefined) {
          interstitialOpts.cue = ad.cue;
        }
        if (ad.sn !== undefined) {
          interstitialOpts.snap = ad.sn;
        }
        if (ad.ro !== undefined) {
          interstitialOpts.resumeOffset = ad.ro;
        }
        if (ad.ro !== undefined) {
          interstitialOpts.resumeOffset = ad.ro;
        }
        if (ad.re !== undefined) {
          interstitialOpts.restrict = ad.re;
        }
        if (ad.cmv !== undefined) {
          interstitialOpts.contentmayvary = ad.cmv;
        }
        if (ad.tlo !== undefined) {
          interstitialOpts.timelineoccupies = ad.tlo;
        }
        if (ad.tls !== undefined) {
          interstitialOpts.timelinestyle = ad.tls;
        }
        if (ad.cb !== undefined) {
          interstitialOpts.custombeacon = ad.cb;
        }
        if (opts.useInterstitial) {
          interstitialOpts.plannedDuration = ad.duration;
        }
        // Create the Asset List Stitcher Payload
        const assetItem = {
          uri: ad.url,
          dur: ad.duration / 1000,
        };
        breakDur += ad.duration;
        assetListPayload.assets.push(assetItem);
        if (opts.combineInterstitial) {
          insertAtListPromises.push(() => hlsVod.insertAdAt(ad.pos, ad.url));
          interstitialOpts.resumeOffset = breakDur;
        }
      }
      // Set the Asset List URL
      if (breaksWithAssetList.length > 0) {
        // filter for item that has 'assetListUrl' field
        const assetListUrlItems = breaksWithAssetList.filter((b) => b.assetListUrl);
        if (assetListUrlItems.length > 0) {
          ASSET_LIST_URL = new URL(assetListUrlItems[0].assetListUrl);
        }
        if (opts.combineInterstitial) {
          interstitialOpts.plannedDuration = breakDur;
        }
        console.log(10006, interstitialOpts, breakGroupsDict);
      } else {
        try {
          interstitialOpts.plannedDuration = breakDur;
          interstitialOpts.addDeltaOffset = bidx == 0 ? false : true;
          const encodedAssetListPayload = encodeURIComponent(serialize(assetListPayload));
          const baseUrl = process.env.ASSET_LIST_BASE_URL || "";
          ASSET_LIST_URL = new URL(baseUrl + `/stitch/assetlist/${encodedAssetListPayload}`);
        } catch (err) {
          console.error("Failed to make ASSET_LIST_URL->", err);
        }
      }
      // Create Promise to insert Interstitial at Break Position
      if (opts && opts.combineInterstitial) {
        interstitialOpts.previousBreakDuration = previousBreakDuration;
      }
      adpromises.push(() =>
        hlsVod.insertInterstitialAt(
          breakPosition,
          `Ad-Break-${--_id}.${Date.now()}`,
          ASSET_LIST_URL && ASSET_LIST_URL.href ? ASSET_LIST_URL.href : "",
          true,
          interstitialOpts
        )
      );
      insertAtListPromises.forEach((i) => {
        adpromises.push(i);
      });
      previousBreakDuration = breakDur;
    }
  } else {
    for (let i = 0; i < payload.breaks.length; i++) {
      const b = payload.breaks[i];
      adpromises.push(() => hlsVod.insertAdAt(b.pos, b.url));
    }
  }
  for (let promiseFn of adpromises.reverse()) {
    await promiseFn();
  }
  return hlsVod;
};

const createAssetListFromPayload = async (encodedPayload) => {
  const payload = deserialize(decodeURIComponent(encodedPayload));
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
