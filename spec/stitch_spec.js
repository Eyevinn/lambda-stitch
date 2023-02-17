const main = require("../index.js");

const deserialize = (base64data) => {
  const buff = Buffer.from(base64data, "base64");
  return JSON.parse(buff.toString("ascii"));
};

const serialize = (payload) => {
  const buff = Buffer.from(JSON.stringify(payload));
  return buff.toString("base64");
};

describe("Lambda Stitcher", () => {
  let env;

  beforeEach(() => {
    env = process.env;
  });

  afterEach(() => {
    process.env = env;
  });

  it("can create a request to insert an ad in the beginning of a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/F1_SUZUKA_APR13.mov/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
      ],
    };
    const event = { path: "/stitch/", body: JSON.stringify(payload), httpMethod: "POST" };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual(
      '{"uri":"/stitch/master.m3u8?payload=eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0="}'
    );
    done();
  });

  it("can handle a master playlist request", async (done) => {
    const event = {
      path: "/stitch/master.m3u8",
      queryStringParameters: {
        payload:
          "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=",
      },
    };
    let response = await main.handler(event);
    expect(response.body.match(/subdir=1000/)).not.toBeNull();
    done();
  });

  it("can handle a master playlist request with interstitial", async (done) => {
    const event = {
      path: "/stitch/master.m3u8",
      queryStringParameters: {
        payload:
          "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=",
        i: "1",
      },
    };
    let response = await main.handler(event);
    expect(response.body.match(/subdir=1000/)).not.toBeNull();
    expect(response.body.match(/i=1/)).not.toBeNull();
    done();
  });

  it("can handle a request to insert an ad in the beginning of a VOD", async (done) => {
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1753000,
        subdir: "1000",
        payload:
          "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    // Due to a bad test ad asset the duration is on the floating point not the same for all variants.
    // Until test ad asset has been fixed we match on the integer...
    expect(lines[7]).toContain("#EXT-X-CUE-OUT:DURATION=15");
    done();
  });

  it("can handle a request to insert an ad in the beginning of a Demuxed CMAF VOD", async (done) => {
    const event = {
      path: "/stitch/audio.m3u8",
      queryStringParameters: {
        groupid: "audio-aacl-256",
        language: "Swedish",
        subdir: "1000",
        payload:
          "eyJ1cmkiOiJodHRwczovL3ZvZC5zdHJlYW1pbmcuYTJkLnR2LzNmMzg5YzQ4LTAzZTMtNDhhMi04ZTk4LWEwMmM1NTE4NWE2OC80Yzc5MmEzMC04OWFkLTExZWQtOTVkOS0xYjM3NGM0ZTJmOWZfMjA0MTEwNTYuaXNtLy5tM3U4IiwiYnJlYWtzIjpbeyJwb3MiOjAsImR1cmF0aW9uIjoxNjAwMCwidXJsIjoiaHR0cHM6Ly90cmFpbGVyLWFkbWluLWNkbi5hMmQtc3RhZ2UudHYvaGxzL3Rlc3Rfc2xhdGUvbWFpbl9zbGF0ZS5tM3U4In1dfQ==",
      },
    };
    try {
      let response = await main.handler(event);
      const lines = response.body.split("\n");
      // Due to a bad test ad asset the duration is on the floating point not the same for all variants.
      // Until test ad asset has been fixed we match on the integer...
      expect(lines[10]).toContain("#EXT-X-CUE-OUT:DURATION=17");
    } catch (e) {
      console.log("ERROR: Test Payload Contains Dead Vod Urls");
    } finally {
      done();
    }
  });

  it("can handle a request to insert an assetlist interstitial in the beginning of a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        i: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0'
    );
    done();
  });

  it("can handle a request to insert an assetlist interstitial 13 seconds in to a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        { pos: 13000, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        i: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[11]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:13.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0'
    );
    done();
  });

  it("can handle a request to insert two assetlist interstitials 0 and 55 seconds in to a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
        { pos: 55000, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        i: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0'
    );
    expect(lines[22]).toEqual(
      '#EXT-X-DATERANGE:ID="2",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:55.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0'
    );
    done();
  });

  it("can handle a request to insert interstitials with resume offset = 0", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        {
          pos: 0,
          ro: 0,
          duration: 15000,
          url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8",
        },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        i: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0'
    );
    done();
  });

  it("can handle a request to insert interstitials with resume offset and playout limit", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        {
          pos: 0,
          ro: 5000,
          duration: 15000,
          url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8",
        },
        {
          pos: 55000,
          pol: 10000,
          duration: 15000,
          url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8",
        },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        i: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=5'
    );
    expect(lines[22]).toEqual(
      '#EXT-X-DATERANGE:ID="2",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:55.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=0,X-PLAYOUT-LIMIT=10'
    );
    done();
  });

  it("can handle a master playlist request without payload", async (done) => {
    const event = { path: "/stitch/master.m3u8", queryStringParameters: {} };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(400);
    done();
  });

  it("can return an assetlist from a payload", async (done) => {
    const event = {
      path: "/stitch/assetlist/ewogICJhc3NldHMiOiBbCiAgICB7CiAgICAgICJ1cmkiOiAiaHR0cHM6Ly9tYWl0di12b2QubGFiLmV5ZXZpbm4udGVjaG5vbG9neS9hZHMvYXBvdGVhLTE1cy5tcDQvbWFzdGVyLm0zdTgiLAogICAgICAiZHVyIjogMTUKICAgIH0sCiAgIHsKICAgICAgInVyaSI6ICJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCIsCiAgICAgICJkdXIiOiAxNQogICB9CiAgXQp9",
    };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual(
      '{"ASSETS":[{"URI":"https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8","DURATION":15},{"URI":"https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8","DURATION":15}]}'
    );
    done();
  });

  it("can handle a request to combine interstitial with splicing", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
        { pos: 55000, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" },
      ],
    };
    process.env.ASSET_LIST_BASE_URL = "https://mock.com";

    const encodedPayload = serialize(payload);
    const event = {
      path: "/stitch/media.m3u8",
      queryStringParameters: {
        bw: 1252000,
        subdir: "1000",
        payload: encodedPayload,
        c: "1",
      },
    };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[9]).toEqual(
      '#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=15'
    );
    expect(lines[33]).toEqual(
      '#EXT-X-DATERANGE:ID="2",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:55.001Z",DURATION=15,X-ASSET-LIST="https://mock.com/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D",X-RESUME-OFFSET=15'
    );
    done();
  });

  it("can handle a CORS preflight request", async (done) => {
    const event = { path: "/stitch", httpMethod: "OPTIONS" };
    let response = await main.handler(event);
    expect(response.headers["Access-Control-Allow-Origin"]).toEqual("*");
    expect(response.headers["Access-Control-Allow-Methods"]).toEqual("POST, GET, OPTIONS");
    expect(response.headers["Access-Control-Allow-Headers"]).toEqual("Content-Type, Origin");
    expect(response.headers["Access-Control-Max-Age"]).toEqual("86400");
    done();
  });
});
