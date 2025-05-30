// comment to trigger first stage deploy
const HLSSpliceVod = require("@eyevinn/hls-splice");
const Readable = require("stream").Readable;
const fetch = require("node-fetch");
const exactMath = require("exact-math");
const DefaultDummySubtitleEndpoint = "textstream/empty.vtt";
const DUMMY_SUBTITLE_URL =
  "https://trailer-admin-cdn.a2d.tv/virtualchannels/webvtt/empty.vtt" || DefaultDummySubtitleEndpoint;
const createTextStreamFromString = (str) => {
  const textStream = new Readable({
    read() {
      this.push(str);
      this.push(null);
    },
  });

  return textStream;
};
const NUM_RETRIES = 1;
const OVERRIDE_HOSTNAME = null; //"vod.streaming.a2d.tv" || null;
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const findNearestBw = (bw, array) => {
  array = array.filter((i) => i !== null);
  const sorted = array.sort((a, b) => b - a);
  return sorted.reduce((a, b) => {
    return Math.abs(b - bw) < Math.abs(a - bw) ? b : a;
  });
};

const modifyBandwidth = (inputString) => {
  const regex = /BANDWIDTH=(\d+)/;
  const match = inputString.match(regex);
  if (match && match[1]) {
    const originalBandwidth = parseInt(match[1]);
    const newBandwidth = originalBandwidth - 100;
    return inputString.replace(regex, `BANDWIDTH=${newBandwidth}`);
  }
  return inputString;
};

const ADSM3U_CACHE = {}; // stores ad m3u objects { <uri>: { master: m3u8, video: m3u, audio: m3u } }

const hasM3UinCache = (cacheItem, targetBw) => {
  if (cacheItem.bandwidths.length === 0) {
    return false;
  }
  const targetCacheItemBW = findNearestBw(targetBw, cacheItem.bandwidths);
  if (cacheItem[targetCacheItemBW]) {
    return true;
  }
  return false;
};

exports.handler = async (event) => {
  let response;
  console.log("event:", event);
  let prefix = "/stitch";
  if (process.env.PREFIX) {
    prefix = process.env.PREFIX;
  }

  if (event.path === `${prefix}/` && event.httpMethod === "POST") {
    response = await handleCreateRequest(event);
  } else if (event.path.match(`${prefix}*`) && event.httpMethod === "OPTIONS") {
    response = await handleOptionsRequest();
  } else if (event.path.match(`${prefix}*`) && event.httpMethod === "GET") {
    response = await handleMasterManifestRequest(event);
  } else if (event.path === `${prefix}/media.m3u8`) {
    response = await handleMediaManifestRequest(event);
  } else if (event.path === `${prefix}/audio.m3u8`) {
    response = await handleAudioManifestRequest(event);
  } else if (event.path === `${prefix}/subtitle.m3u8`) {
    response = await handleSubtitleManifestRequest(event);
  } else if (event.path === `${prefix}/dummy-subtitle.m3u8`) {
    response = await handleDummySubtitleManifestRequest(event);
  } else if (event.path === `${prefix}/` + DefaultDummySubtitleEndpoint) {
    response = await handleEmptyVTTSegmentRequest(event);
  } else if (event.path.match(`${prefix}/assetlist\/.*$/`)) {
    response = await handleAssetListRequest(event);
  } else {
    response = generateErrorResponse({ code: 404 });
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

const generateErrorResponse = ({ code: code, message: message }) => {
  let response = {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (message) {
    response.body = JSON.stringify({ reason: message });
  }
  return response;
};

const handleMediaManifestRequest = async (event) => {
  try {
    let ts = Date.now();
    for (let i = 0; i <= NUM_RETRIES; i++) {
      let mediaManifest = await getMediaManifest(event);
      if (mediaManifest) {
        console.log("Media Response Time:", Date.now() - ts);
        return generateManifestResponse(mediaManifest);
      }
      if (i < NUM_RETRIES) {
        await sleep(100);
      }
    }
    // none of the tries worked, return error
    return generateErrorResponse(500);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500);
  }
};

const handleDummySubtitleManifestRequest = async (event) => {
  try {
    let ts = Date.now();
    for (let i = 0; i <= NUM_RETRIES; i++) {
      const mediaManifest = await getMediaManifest(event);
      let dummySubtitleManifest = await rewriteIntoSubtitleManifest(mediaManifest);
      if (dummySubtitleManifest) {
        console.log("Dummy Subtitle Response Time:", Date.now() - ts);
        return generateManifestResponse(dummySubtitleManifest);
      }
      if (i < NUM_RETRIES) {
        await sleep(100);
      }
    }
    // none of the tries worked, return error
    return generateErrorResponse(500);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500);
  }
};

const handleEmptyVTTSegmentRequest = async (event) => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    },
    body: `WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000\n\n`,
  };
};

const handleSubtitleManifestRequest = async (event) => {
  try {
    let ts = Date.now();
    for (let i = 0; i <= NUM_RETRIES; i++) {
      let subtitleManifest = await getSubtitleManifest(event);
      if (subtitleManifest) {
        console.log("Subtitle Response Time:", Date.now() - ts);
        return generateManifestResponse(subtitleManifest);
      }
      if (i < NUM_RETRIES) {
        await sleep(100);
      }
    }
    // none of the tries worked, return error
    return generateErrorResponse(500);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500);
  }
};

const handleAudioManifestRequest = async (event) => {
  try {
    let ts = Date.now();
    for (let i = 0; i <= NUM_RETRIES; i++) {
      let audioManifest = await getAudioManifest(event);
      if (audioManifest) {
        console.log("Audio Response Time:", Date.now() - ts);
        return generateManifestResponse(audioManifest);
      }
      if (i < NUM_RETRIES) {
        await sleep(100);
      } 
    }
    // none of the tries worked, return error
    return generateErrorResponse(500);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500);
  }
};

const getMediaManifest = async (event) => {
  try {
    const bw = event.queryStringParameters.bw;
    const encodedPayload = event.queryStringParameters.payload;
    const override = event.queryStringParameters.o === "1" ? true : false;
    const useInterstitial = event.queryStringParameters.i && event.queryStringParameters.i === "1";
    const combineInterstitial = event.queryStringParameters.c && event.queryStringParameters.c === "1";

    console.log(`Received request /media.m3u8 (bw=${bw}, payload=${encodedPayload}, override=${override}, useInterstitial=${useInterstitial}, combineInterstitial=${combineInterstitial})`);

    const hlsVod = await createVodFromPayload(encodedPayload, {
      baseUrlFromSource: true,
      overrideHostname: OVERRIDE_HOSTNAME,
      targetBandwidth: bw,
      clearCueTagsInSource: true,
      useInterstitial,
      combineInterstitial
    });

    const mediaManifest = hlsVod.getMediaManifest(bw);
    return mediaManifest;
  } catch (exc) {
    console.error("getMediaManifest:", exc);
    return;
  }
};

const getDurationUpToFirstSegItemWithDisc = (start_index, m3u, videoSize, vodDur) => {
  let duration = 0;
  let newVodDur = vodDur;
  let inbreak = false;
  for (let x = start_index; x < videoSize; x++) {
    const _SEG = m3u.items.PlaylistItem[x];
    const nextIdx = x + 1 >= videoSize ? videoSize - 1 : x + 1;
    let NEXT_SEG = m3u.items.PlaylistItem[nextIdx];
    if (_SEG.get("cuein") && !_SEG.get("cueout")) {
      inbreak = false;
    }
    if (_SEG.get("cueout")) {
      inbreak = true;
    }
    if (inbreak) {
      if (_SEG.get("duration")) {
        duration += _SEG.get("duration");
      }
      if (NEXT_SEG.get("discontinuity")) {
        return [duration, x, nextIdx, newVodDur];
      }
    } else {
      if (_SEG.get("duration")) {
        newVodDur += _SEG.get("duration");
      }
    }
  }
  return [duration, videoSize - 1, videoSize, newVodDur];
};

const calcDiff = (a, b) => {
  let diff = a * 1000000 - b * 1000000;
  diff = Math.floor(diff * 1) / 1000000;
  if (diff < 0) {
    console.log(`Video Duration(${b}) > Audio Duration(${a})`);
  }
  return diff;
};

const applyDiff = (a, b) => {
  let c = a * 100 - b * 100;
  return Math.round(exactMath.div(c, 100) * 100) / 100; //Math.floor(c) / 100;
};

const to4Decimals = (a) => {
  return Math.floor(a * 10000) / 10000;
};

const rewriteEndingSegmentDurations = async (hlsVod) => {
  return new Promise((resolve, reject) => {
    try {
      // get video total dur
      const summary = [];
      const bw = Object.keys(hlsVod.playlists)[0];
      const groups = Object.keys(hlsVod.playlistsAudio);
      const langs = Object.keys(hlsVod.playlistsAudio[groups[0]]);
      const videoM3u = hlsVod.playlists[bw];
      const audioM3u = hlsVod.playlistsAudio[groups[0]][langs[0]];
      const videoSize = videoM3u.items.PlaylistItem.length;
      let audioSize = audioM3u.items.PlaylistItem.length;
      let videoStart = 0;
      let audioStart = 0;
      let it = 999;
      let TDVSource = 0; // Total Duration Video Source
      let TDASource = 0; // Total Duration Audio Source
      while (videoStart < videoSize && it !== 0) {
        it--;
        let [TDV, _, newStartV, vodDurV] = getDurationUpToFirstSegItemWithDisc(
          videoStart,
          videoM3u,
          videoSize,
          TDVSource
        );
        let [TDA, targetIdxA, newStartA, vodDurA] = getDurationUpToFirstSegItemWithDisc(
          audioStart,
          audioM3u,
          audioSize,
          TDASource
        );
        TDVSource = to4Decimals(vodDurV);
        TDASource = to4Decimals(vodDurA);

        const ENABLE_AUDIOSEGMENT_DURATION_ADJUSTMENT = false;

        let total_diff = calcDiff(TDASource, TDVSource);
        let _diff = calcDiff(TDA, TDV);
        const targetItem = audioM3u.items.PlaylistItem[targetIdxA];
        let originalDur = targetItem.get("duration");
        if (ENABLE_AUDIOSEGMENT_DURATION_ADJUSTMENT && audioSize - videoSize > 1) {
          let LastSegmentDuration = audioM3u.items.PlaylistItem[audioSize - 1].get("duration");
          let SecondToLastSegmentDuration = audioM3u.items.PlaylistItem[audioSize - 2].get("duration");
          let poppedDuration = 0;
          while (LastSegmentDuration > 0 && SecondToLastSegmentDuration > 0 && poppedDuration < total_diff) {
            if (poppedDuration + LastSegmentDuration > total_diff) {
              const targetItem = audioM3u.items.PlaylistItem[audioSize - 1];
              let originalDur = targetItem.get("duration");
              total_diff -= poppedDuration;
              let newDur = applyDiff(originalDur, total_diff);
              targetItem.set("duration", newDur);
              break;
            }
            let seg = audioM3u.items.PlaylistItem.pop();
            poppedDuration += seg.get("duration");
            audioSize = audioM3u.items.PlaylistItem.length;
            LastSegmentDuration = audioM3u.items.PlaylistItem[audioSize - 1].get("duration");
            SecondToLastSegmentDuration = audioM3u.items.PlaylistItem[audioSize - 2].get("duration");
          }

          if (_diff !== 0 || targetIdxA === audioSize - 1) {
            let diff;
            if (_diff === 0 && total_diff !== 0) {
              diff = total_diff;
            } else {
              diff = _diff;
            }
            let newDur = applyDiff(originalDur, diff);
            if (newDur < 0) {
              console.log(`WARNING! Negative Duration(${newDur}) for Segment at Index(${targetIdxA})`);
            } else {
              if (TDV > 0 || TDVSource > 0) {
                targetItem.set("duration", newDur);
                let info = {
                  originalDur,
                  newDur,
                  diff,
                  targetIdxA,
                };
                summary.push(info);
              }
            }
          }
        }
        videoStart = newStartV;
        audioStart = newStartA;
      }
      console.log(`Augmented segment duration in VOD Summary: ${JSON.stringify(summary)}`);

      resolve();
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
};

const rewriteIntoSubtitleManifest = async (videoM3u8) => {
  let rewrittenManifest = "";
  const lines = videoM3u8.split("\n");
  try {
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      if (l.match(/^#EXT-X-ENDLIST/)) {
        rewrittenManifest += l + "\n";
        break;
      }
      if (l.match(/^#EXT-X-MAP/)) {
        continue;
      }
      if (!l.match(/^#/)) {
        rewrittenManifest += DUMMY_SUBTITLE_URL + "\n";
      } else {
        rewrittenManifest += l + "\n";
      }
    }
    return rewrittenManifest;
  } catch (err) {
    throw new Error("Failed to rewrite master manifest," + err);
  }
};

const logTrackDurationsAndSegCounts = (bunchOfM3us) => {
  let keys_a;
  let keys_b;
  let logItems = {};
  keys_a = Object.keys(bunchOfM3us);
  if (keys_a.length > 0 && !Number(keys_a)) {
    // This bunch is for extra media. as it has groudId and langs
    keys_b = Object.keys(bunchOfM3us[keys_a[0]]);
  }
  console.log(`keys_b=${keys_b};keys_a=${keys_a}`);
  if (!keys_b) {
    // Treat as Video only
    for (let i = 0; i < keys_a.length; i++) {
      const key = keys_a[i];
      const m3u = bunchOfM3us[key];
      let dur = 0;
      let count = 0;
      m3u.items.PlaylistItem.forEach((seg) => {
        if (seg.properties.duration) {
          dur += seg.properties.duration;
        }
        count++;
      });
      logItems[key] = { totalDur: dur, size: count };
    }
    console.log("_video_" + JSON.stringify(logItems, null, 2));
    return logItems;
  }
  if (keys_a.length > 0 && keys_b.length > 0) {
    // Treat as Extra Media
    for (let i = 0; i < keys_a.length; i++) {
      const key = keys_a[i];
      const keys_b = Object.keys(bunchOfM3us[key]);
      for (let j = 0; j < keys_b.length; j++) {
        const other_key = keys_b[j];
        const m3u = bunchOfM3us[key][other_key];
        let dur = 0;
        let count = 0;
        m3u.items.PlaylistItem.forEach((seg) => {
          if (seg.properties.duration) {
            dur += seg.properties.duration;
          }
          count++;
        });
        if (!logItems[key]) {
          logItems[key] = {};
        }
        logItems[key][other_key] = { totalDur: dur, size: count };
      }
    }
  }
  console.log("_xtra media_" + JSON.stringify(logItems, null, 2));
  return logItems;
};

const insertSegmentPaddingForSubs = (hlsVod) => {
  // logTrackDurationsAndSegCounts(hlsVod.playlists);
  // logTrackDurationsAndSegCounts(hlsVod.playlistsSubtitle);
  const bw = Object.keys(hlsVod.playlists)[0];
  const groups = Object.keys(hlsVod.playlistsSubtitle);
  const langs = Object.keys(hlsVod.playlistsSubtitle[groups[0]]);
  const videoM3u = hlsVod.playlists[bw];
  const subsM3u = hlsVod.playlistsSubtitle[groups[0]][langs[0]];
  const videoSize = videoM3u.items.PlaylistItem.length;
  const subsSize = subsM3u.items.PlaylistItem.length;
  let videoDur = 0;
  let subsDur = 0;
  videoM3u.items.PlaylistItem.forEach((seg) => {
    if (seg.get("duration")) {
      videoDur += seg.get("duration");
    }
  });
  subsM3u.items.PlaylistItem.forEach((seg) => {
    if (seg.get("duration")) {
      subsDur += seg.get("duration");
    }
  });
  if (videoDur > subsDur && videoSize === subsSize) {
    const lastSubIdx = subsSize - 1;
    const endSegSub = subsM3u.items.PlaylistItem[lastSubIdx];
    const diff = videoDur - subsDur;
    const segDur = endSegSub.get("duration");
    endSegSub.set("duration", segDur + diff);
    console.log("Updated Final Subtitle-Segment with dur=", diff);
  } else if (videoDur > subsDur && videoSize > subsSize) {
    const lastSubIdx = subsSize - 1;
    const endSegSub = subsM3u.items.PlaylistItem[lastSubIdx];
    const segVideo = videoM3u.items.PlaylistItem[lastSubIdx];
    const segVideoDuration = segVideo.get("duration");
    endSegSub.set("duration", segVideoDuration);
    for (let i = lastSubIdx + 1; i < videoSize; i++) {
      const segVideo = videoM3u.items.PlaylistItem[i];
      const fakeSubtileSegment = {
        duration: segVideo.get("duration"),
        uri: DUMMY_SUBTITLE_URL,
      };
      subsM3u.addPlaylistItem(fakeSubtileSegment);
    }
    console.log("Added Extra Subtitle-Segments");
  } else if (videoDur > subsDur && videoSize < subsSize) {
    // get the avg sub dur
    const sortedDurations = subsM3u.items.PlaylistItem.map((seg) => seg.get("duration")).sort((a, b) => a - b);
    const mid = Math.floor(sortedDurations.length / 2);
    const medianSubDur =
      sortedDurations.length % 2 !== 0 ? sortedDurations[mid] : (sortedDurations[mid - 1] + sortedDurations[mid]) / 2;
    // try ro calculate how many extra segments are needed if each segment is avgSubDur in duration
    const diff = videoDur - subsDur;
    const extraSegs = Math.floor(diff / medianSubDur);
    let totalExtraDur = diff;
    while (totalExtraDur > 0) {
      const fakeSubtileSegment = {
        duration: medianSubDur < totalExtraDur ? medianSubDur : totalExtraDur,
        uri: DUMMY_SUBTITLE_URL,
      };
      totalExtraDur -= medianSubDur;
      if (totalExtraDur < medianSubDur) {
        totalExtraDur = totalExtraDur < 0 ? 0 : totalExtraDur;
        fakeSubtileSegment.duration += totalExtraDur;
        subsM3u.addPlaylistItem(fakeSubtileSegment);
        break;
      }
      subsM3u.addPlaylistItem(fakeSubtileSegment);
    }
    console.log("Added Single Extra Remainder Subtitle-Segment");
  }
};

const getAudioManifest = async (event) => {
  try {
    const groupid = event.queryStringParameters.groupid;
    const language = event.queryStringParameters.language;
    const encodedPayload = event.queryStringParameters.payload;
    const override = event.queryStringParameters.o === "1" ? true : false;
    console.log(
      `Received request /audio.m3u8 (groupid=${groupid}, language=${language}, payload=${encodedPayload}, override=${override})`
    );
    const hlsVod = await createVodFromPayload(encodedPayload, {
      baseUrlFromSource: true,
      // subdir: event.queryStringParameters.subdir,
      // overrideHostname: override ? "director.streaming.cmore.se" : null,
      overrideHostname: OVERRIDE_HOSTNAME,
      targetGroupId: groupid,
      targetLanguage: language,
      clearCueTagsInSource: true,
    });
    if (Object.keys(hlsVod.playlists).length !== 0 && Object.keys(hlsVod.playlistsAudio).length !== 0) {
      await rewriteEndingSegmentDurations(hlsVod);
    }
    const audioManifest = (await hlsVod).getAudioManifest(groupid, language);
    return audioManifest;
  } catch (exc) {
    console.error("getAudioManifest:", exc);
    return;
  }
};

const getSubtitleManifest = async (event) => {
  try {
    const groupid = event.queryStringParameters.groupid;
    const language = event.queryStringParameters.language;
    const encodedPayload = event.queryStringParameters.payload;
    const override = event.queryStringParameters.o === "1" ? true : false;
    console.log(
      `Received request /subtitle.m3u8 (groupid=${groupid}, language=${language}, payload=${encodedPayload}, override=${override})`
    );
    const hlsVod = await createVodFromPayload(encodedPayload, {
      baseUrlFromSource: true,
      // subdir: event.queryStringParameters.subdir,
      // overrideHostname: override ? "director.streaming.cmore.se" : null,
      overrideHostname: OVERRIDE_HOSTNAME,
      targetGroupId: groupid,
      targetLanguage: language,
      clearCueTagsInSource: true,
    });

    insertSegmentPaddingForSubs(hlsVod);

    const subtitleManifest = (await hlsVod).getSubtitleManifest(groupid, language);
    return subtitleManifest;
  } catch (exc) {
    console.error("getSubtitleManifest:", exc);
    return;
  }
};

const handleMasterManifestRequest = async (event) => {
  try {
    for (let i = 0; i <= NUM_RETRIES; i++) {
      const rewrittenManifest = await getRewrittenMasterManifest(event);
      // if rewritten manifest contains "TYPE=SUBTITLES" then log a message
      if (rewrittenManifest && rewrittenManifest.includes("TYPE=SUBTITLES")) {
        console.log("[infoinfo] Master Manifest contains Subtitles");
      }
      if (rewrittenManifest) {
        return generateManifestResponse(rewrittenManifest);
      }
      if (i < NUM_RETRIES) {
        await sleep(100);
      }
    }
    // none of the tries worked, return error
    return generateErrorResponse(500);
  } catch (exc) {
    console.error(exc);
    return generateErrorResponse(500);
  }
};

const deserialize = (base64data) => {
  const buff = Buffer.from(base64data, "base64");
  return JSON.parse(buff.toString("ascii"));
};

const serialize = (payload) => {
  const buff = Buffer.from(JSON.stringify(payload));
  return buff.toString("base64");
};

const getRewrittenMasterManifest = async (event, opts) => {
  try {
    const encodedPayload = event.queryStringParameters.payload;
    const forceSubtitles = event.queryStringParameters.fs === "true";
    const noSubtitles = event.queryStringParameters.ns === "true";

    const override = event.queryStringParameters.o === "1" ? true : false; // override hostname
    const useInterstitial = event.queryStringParameters.i && event.queryStringParameters.i === "1";
    const combineInterstitial = event.queryStringParameters.c && event.queryStringParameters.c === "1";

    console.log(`Received request /master.m3u8 (payload=${encodedPayload}, override=${override}, useInterstitial=${useInterstitial}, combineInterstitial=${combineInterstitial}, forceSubtitles=${forceSubtitles}, noSubtitles=${noSubtitles})`);

    const payload = deserialize(encodedPayload);

    const response = await fetch(payload.uri);
    const manifest = await response.text();
    const rewrittenManifest = await rewriteMasterManifest(manifest, payload, override, payload.uri, {
      useInterstitial,
      combineInterstitial,
      forceSubtitles,
      noSubtitles
    });
    return rewrittenManifest;
  } catch (exc) {
    console.error("getRewrittenMasterManifest:", exc);
    return;
  }
};

const createVodFromPayload = async (encodedPayload, opts) => {
  const payload = deserialize(encodedPayload);
  let targetVodBw = null;
  const uri = payload.uri;
  let vodOpts = {
    merge: true,
    log: true,
    dummySubtitleEndpoint: DUMMY_SUBTITLE_URL,
  };
  if (opts && opts.baseUrlFromSource) {
    const m = uri.match("^(.*)/.*?");
    if (m) {
      vodOpts.baseUrl = m[1] + "/";
    }
  }
  if (opts && opts.overrideHostname && vodOpts.baseUrl) {
    vodOpts.baseUrl = vodOpts.baseUrl.replace(/:\/\/.*?\//, "://" + opts.overrideHostname + "/");
  }
  if (opts && opts.clearCueTagsInSource) {
    vodOpts.clearCueTagsInSource = opts.clearCueTagsInSource;
  }
  const hlsVod = new HLSSpliceVod(uri, vodOpts);
  if (opts && opts.targetBandwidth) {
    targetVodBw = opts.targetBandwidth;
    try {
      await hlsVod.load();
    } catch (e) {
      if (e === "Error: Source is Not a Multivariant Manifest") {
        await hlsVod.loadMediaManifest(uri, targetVodBw);
      } else {
        throw new Error(e);
      }
    }
  } else if (opts && opts.targetGroupId && opts.targetLanguage) {
    targetVodGL = `${opts.targetGroupId}:${opts.targetLanguage}`;
    try {
      await hlsVod.load();
    } catch (e) {
      if (e === "Error: Source is Not a Multivariant Manifest") {
        if (payload.videoUri) {
          await hlsVod.loadMediaManifest(payload.videoUri, 100000);
        }
        await hlsVod.loadAudioManifest(uri, opts.targetGroupId, opts.targetLanguage);
        await hlsVod.loadSubtitleManifest(uri, opts.targetGroupId, opts.targetLanguage);
      } else {
        console.error("Could Not Load URI:", uri);
        throw new Error(e);
      }
    }
  } else {
    await hlsVod.load();
  }

  if (payload.bumper) {
    if (ADSM3U_CACHE[payload.bumper] && hasM3UinCache(ADSM3U_CACHE[payload.bumper], targetVodBw)) {
      const cachedAd = ADSM3U_CACHE[payload.bumper];
      console.log("Fetching bumper from cache!");
      const targetBumperBw = findNearestBw(targetVodBw, cachedAd.bandwidths);

      let injectMaster;
      let injectVideo;
      let injectAudio;
      let injectSubs;
      if (cachedAd.master) {
        injectMaster = () => {
          return createTextStreamFromString(cachedAd.master);
        };
      }
      if (cachedAd[targetBumperBw]) {
        injectVideo = () => {
          return createTextStreamFromString(cachedAd[targetBumperBw]);
        };
      }
      if (cachedAd.audio) {
        injectAudio = () => {
          return createTextStreamFromString(cachedAd.audio);
        };
      }
      if (cachedAd.subs) {
        injectSubs = () => {
          return createTextStreamFromString(cachedAd.subs);
        };
      }
      await hlsVod.insertBumper(payload.bumper, injectMaster, injectVideo, injectAudio, injectSubs);
    } else {
      await hlsVod.insertBumper(payload.bumper);
      const loadedBumper = hlsVod.bumper;
      const groupsA = Object.keys(loadedBumper.playlistAudio);
      let langsA;
      if (groupsA.length > 0) {
        langsA = Object.keys(loadedBumper.playlistAudio[groupsA[0]]);
      }
      const groupsS = Object.keys(loadedBumper.playlistSubtitle);
      let langsS;
      if (groupsS.length > 0) {
        langsS = Object.keys(loadedBumper.playlistSubtitle[groupsS[0]]);
      }
      const loadedBumperBws = Object.keys(loadedBumper.playlist);
      let cacheItem;
      if (ADSM3U_CACHE[payload.bumper]) {
        cacheItem = ADSM3U_CACHE[payload.bumper];
        console.log(`Added new Bumper (${loadedBumperBws[0]}) in cache (uri=${payload.bumper})`);
        cacheItem[loadedBumperBws[0]] = loadedBumper.playlist[loadedBumperBws[0]]
          ? loadedBumper.playlist[loadedBumperBws[0]].toString()
          : null;
        ADSM3U_CACHE[payload.bumper] = cacheItem;
      } else {
        ADSM3U_CACHE[payload.bumper] = {
          master: loadedBumper.master.toString(),
          bandwidths: loadedBumper.bandwidths,
          video: loadedBumper.playlist[loadedBumperBws[0]]
            ? loadedBumper.playlist[loadedBumperBws[0]].toString()
            : null,
          audio: groupsA.length > 0 ? loadedBumper.playlistAudio[groupsA[0]][langsA[0]].toString() : null,
          subs: groupsS.length > 0 ? loadedBumper.playlistSubtitle[groupsS[0]][langsS[0]].toString() : null,
        };
      }
      let vidInfo = Object.keys(loadedBumper.playlist)[0] ? Object.keys(loadedBumper.playlist)[0] : null;
      let audioInfo = groupsA[0] ? `${groupsA[0]}:${langsA[0]}` : null;
      let subsInfo = groupsA[0] ? `${groupsA[0]}:${langsA[0]}` : null;
      console.log(
        `Cache-miss. Fetched real Ad m3u8. Store in cache m3u8 for ${vidInfo
          ? `bw=${vidInfo}`
          : audioInfo
            ? `audio gl=${audioInfo}`
            : subsInfo
              ? `subs gl=${subsInfo}`
              : "undefined"
        }`
      );
    }
  }

  const breaks = payload.breaks;
  for (let i = breaks.length - 1; i >= 0; i--) {
    const b = breaks[i];
    try {
      const breakUrl = b.url;
      if (ADSM3U_CACHE[breakUrl] && hasM3UinCache(ADSM3U_CACHE[breakUrl], targetVodBw)) {
        const cachedAd = ADSM3U_CACHE[breakUrl];
        const targetAdBw = findNearestBw(targetVodBw, cachedAd.bandwidths);
        console.log("Ad M3U8 found in Cache:", JSON.stringify({ uri: breakUrl, vodBw: targetVodBw, adBw: targetAdBw }));
        let injectMaster;
        let injectVideo;
        let injectAudio;
        let injectSubs;
        if (cachedAd.master) {
          injectMaster = () => {
            return createTextStreamFromString(cachedAd.master);
          };
        }
        if (cachedAd[targetAdBw]) {
          injectVideo = () => {
            return createTextStreamFromString(cachedAd[targetAdBw]);
          };
        }
        if (cachedAd.audio) {
          injectAudio = () => {
            return createTextStreamFromString(cachedAd.audio);
          };
        }
        if (cachedAd.subs) {
          injectSubs = () => {
            return createTextStreamFromString(cachedAd.subs);
          };
        }
        await hlsVod.insertAdAt(b.pos, breakUrl, b.type, injectMaster, injectVideo, injectAudio, injectSubs);
      } else {
        await hlsVod.insertAdAt(b.pos, breakUrl, b.type, null, null, null, null);
        const loadedAd = hlsVod.ad;
        const groupsA = Object.keys(loadedAd.playlistAudio);
        let langsA;
        if (groupsA.length > 0) {
          langsA = Object.keys(loadedAd.playlistAudio[groupsA[0]]);
        }
        const groupsS = Object.keys(loadedAd.playlistSubtitle);
        let langsS;
        if (groupsS.length > 0) {
          langsS = Object.keys(loadedAd.playlistSubtitle[groupsS[0]]);
        }
        const loadedAdBws = Object.keys(loadedAd.playlist);
        let cacheItem;
        if (ADSM3U_CACHE[breakUrl]) {
          cacheItem = ADSM3U_CACHE[breakUrl];
          console.log(`Added new Ad (${loadedAdBws[0]}) in cache (uri=${breakUrl})`);
          cacheItem[loadedAdBws[0]] = loadedAd.playlist[loadedAdBws[0]]
            ? loadedAd.playlist[loadedAdBws[0]].toString()
            : null;
          ADSM3U_CACHE[breakUrl] = cacheItem;
        } else {
          ADSM3U_CACHE[breakUrl] = {
            master: loadedAd.master.toString(),
            bandwidths: loadedAd.bandwidths,
            video: loadedAd.playlist[loadedAdBws[0]] ? loadedAd.playlist[loadedAdBws[0]].toString() : null,
            audio: groupsA.length > 0 ? loadedAd.playlistAudio[groupsA[0]][langsA[0]].toString() : null,
            subs: groupsS.length > 0 ? loadedAd.playlistSubtitle[groupsS[0]][langsS[0]].toString() : null,
          };
        }
        let vidInfo = Object.keys(loadedAd.playlist)[0] ? Object.keys(loadedAd.playlist)[0] : null;
        let audioInfo = groupsA[0] ? `${groupsA[0]}:${langsA[0]}` : null;
        let subsInfo = groupsA[0] ? `${groupsA[0]}:${langsA[0]}` : null;
        console.log(
          `Cache-miss. Fetched real Ad m3u8. Store in cache m3u8 for ${vidInfo
            ? `bw=${vidInfo}`
            : audioInfo
              ? `audio gl=${audioInfo}`
              : subsInfo
                ? `subs gl=${subsInfo}`
                : "undefined"
          }`
        );
      }
    } catch (err) {
      console.error("Failed to insert Ad at position", b.pos, "url", b.url, "Error:", err);
    }
  }

  return hlsVod;
};

const rewriteMasterManifest = async (manifest, payload, override, masterUri, opts) => {
  let rewrittenManifest = "";
  let subtitleCount = 0;
  const NOSUBTITLES = opts.noSubtitles;
  const FORCE_SUBTITLES = opts.forceSubtitles;
  const lines = manifest.split("\n");
  let bw = null;
  try {
    let video_uri;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.includes(`#EXT-X-STREAM-INF:BANDWIDTH=`)) {
        const urlLine = lines[i + 1];
        const httpsUrlPattern = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
        if (httpsUrlPattern.test(urlLine)) {
          video_uri = urlLine;
        } else {
          video_uri = new URL(urlLine, new URL(masterUri)).href;
        }
        break;
      }
    }
    let streamInfoString;
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      if (l.includes("#EXT-X-MEDIA") && l.includes("TYPE=AUDIO") && l.includes("GROUP-ID")) {
        const newLine = rewriteAudioTrackLine(l, payload, override, masterUri, video_uri, opts);
        if (newLine) {
          rewrittenManifest += newLine;
          continue;
        }
      }
      if (l.includes("#EXT-X-MEDIA") && l.includes("TYPE=SUBTITLES") && l.includes("GROUP-ID")) {
        if (NOSUBTITLES) {
          continue;
        }
        const newLine = rewriteSubtitleTrackLine(l, payload, override, masterUri, opts);
        if (newLine) {
          rewrittenManifest += newLine;
          subtitleCount++;
          continue;
        }
      }

      if (l.includes(`#EXT-X-STREAM-INF:BANDWIDTH=`)) {
        l = modifyBandwidth(l);
      }

      if ((m = l.match(/BANDWIDTH=(.*?)\D+/))) {
        bw = m[1];
        if (NOSUBTITLES) {
          if (l.includes("SUBTITLES")) {
            // delete subs
            l = l.replace(/,\s*SUBTITLES="[^"]*"/, "");
          }
        } else {
          if (l.includes("SUBTITLES")) {
            //l = l.replace(/,\s*SUBTITLES="[^"]*"/, "");
          } else if (FORCE_SUBTITLES) {
            l += `,SUBTITLES="textstream"`;
          }
        }
        if (!l.match(/^#EXT-X-I-FRAME-STREAM-INF/)) {
          streamInfoString = l + "\n";
        }
      } else if ((m = l.match(/^[^#]/))) {
        let subdir = "";
        let n = l.match("^(.*)/.*?");
        if (n) {
          subdir = n[1];
        }
        const httpsUrlPattern = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
        if (httpsUrlPattern.test(l)) {
          payload.uri = l;
        } else {
          payload.uri = new URL(l, new URL(masterUri)).href;
        }
        if (!bw) {
          continue;
        }
        if (FORCE_SUBTITLES && subtitleCount === 0) {
          const dummy_url =
            "/stitch/dummy-subtitle.m3u8?bw=" + bw + "&payload=" + serialize(payload) + (override ? "&o=1" : "");
          rewrittenManifest += `\n## Dummy Subtitle Track\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="textstream",LANGUAGE="sv",NAME="Svenska",DEFAULT=YES,AUTOSELECT=YES,URI="${dummy_url}"\n\n`;
          subtitleCount++;
        }
        rewrittenManifest += streamInfoString;
        rewrittenManifest +=
          "/stitch/media.m3u8?bw=" + bw + "&payload=" + serialize(payload) +
          (override ? "&o=1" : "") +
          (opts && opts.useInterstitial ? "&i=1" : "") +
          (opts && opts.combineInterstitial ? "&c=1" : "") +
          "\n";
        ("\n");
      } else {
        rewrittenManifest += l + "\n";
      }
    }
    return rewrittenManifest;
  } catch (err) {
    throw new Error("Failed to rewrite master manifest," + err);
  }
};

const rewriteAudioTrackLine = (l, payload, override, masterUri, videoUri, opts) => {
  return rewriteLine(l, "audio", payload, override, masterUri, videoUri, opts);
};

const rewriteSubtitleTrackLine = (l, payload, override, masterUri, opts) => {
  return rewriteLine(l, "subtitle", payload, override, masterUri, null, opts);
};

const rewriteLine = (l, mediaType, payload, override, masterUri, videoUri, opts) => {
  let group = null;
  let grouplang = null;
  let trackname = null;
  let splitLines = l.split(",");
  let extraMediaUri = splitLines.filter((s) => s.includes("URI="));
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
  if (extraMediaUri.length > 0) {
    let eUri;
    const match = extraMediaUri[0].match(/=\s*"(.+?)"/);
    if (match) {
      eUri = match[1];
    }
    const httpsUrlPattern = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
    if (httpsUrlPattern.test(eUri)) {
      payload.uri = eUri;
    } else {
      payload.uri = new URL(eUri, new URL(masterUri)).href;
    }
    if (videoUri) {
      payload.videoUri = videoUri;
    }
    let newUri = "";
    newUri = `/stitch/${mediaType}.m3u8?groupid=${group}&language=${grouplang}&payload=${serialize(payload) + (override ? "&o=1" : "") + (opts && opts.useInterstitial ? "&i=1" : "") + (opts && opts.combineInterstitial ? "&c=1" : "")
      }`;
    let withoutUri = splitLines.filter((s) => !s.includes("URI="));
    withoutUri.push(`URI="${newUri}"\n`);
    const fixedline = withoutUri.join(",");
    return fixedline;
  }
  return null;
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

const handleAssetListRequest = async (event) => {
  try {
    let encodedPayload;
    const path = event.path || event.rawPath;
    const m = path.match(/\/assetlist\/(.*)$/);
    if (m) {
      encodedPayload = m[1];
    }
    console.log(`Received request /assetlist (payload=${encodedPayload})`);
    if (!encodedPayload) {
      console.error("Request missing payload");
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
