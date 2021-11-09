const main = require('../index.js');

const deserialize = base64data => {
  const buff = Buffer.from(base64data, 'base64');
  return JSON.parse(buff.toString('ascii'))
};

const serialize = payload => {
  const buff = Buffer.from(JSON.stringify(payload));
  return buff.toString('base64');
};

describe("Lambda Stitcher", () => {
  it("can create a request to insert an ad in the beginning of a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/F1_SUZUKA_APR13.mov/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" }
      ]
    };
    const event = { path: "/stitch/", body: JSON.stringify(payload), httpMethod: "POST" };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual('{"uri":"/stitch/master.m3u8?payload=eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0="}');
    done();
  });

  it("can handle a master playlist request", async (done) => {
    const event = { path: "/stitch/master.m3u8", queryStringParameters: { payload: "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=" } };
    let response = await main.handler(event);
    expect(response.body.match(/subdir=1000/)).not.toBeNull();
    done();
  });

  it("can handle a master playlist request with interstitial", async (done) => {
    const event = { path: "/stitch/master.m3u8", queryStringParameters: { payload: "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=", i: "1" } };
    let response = await main.handler(event);
    expect(response.body.match(/subdir=1000/)).not.toBeNull();
    expect(response.body.match(/i=1/)).not.toBeNull();
    done();
  });

  it("can handle a request to insert an ad in the beginning of a VOD", async (done) => {
    const event = { path: "/stitch/media.m3u8", queryStringParameters: { bw: 1753000, subdir: '1000', payload: "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=" } };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    // Due to a bad test ad asset the duration is on the floating point not the same for all variants.
    // Until test ad asset has been fixed we match on the integer...
    expect(lines[7]).toContain("#EXT-X-CUE-OUT:DURATION=15");
    done();
  });

  it("can handle a request to insert an assetlist interstitial in the beginning of a VOD", async (done) => {
    const payload = {
      uri: "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
      breaks: [
        { pos: 0, duration: 15000, url: "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" }
      ],
    };
    const encodedPayload = serialize(payload);
    const event = { path: "/stitch/media.m3u8", queryStringParameters: { 
      bw: 1252000,
      subdir: '1000',
      payload: encodedPayload,
      i: "1",
    }};
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual('#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.000Z",X-ASSET-LIST="/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D"');
    done();
  });

  it("can handle a master playlist request without payload", async (done) => {
    const event = { path: "/stitch/master.m3u8", queryStringParameters: {  } };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(400);
    done();
  });

  it("can return an assetlist from a payload", async (done) => {
    const event = { path: "/stitch/assetlist/ewogICJhc3NldHMiOiBbCiAgICB7CiAgICAgICJ1cmkiOiAiaHR0cHM6Ly9tYWl0di12b2QubGFiLmV5ZXZpbm4udGVjaG5vbG9neS9hZHMvYXBvdGVhLTE1cy5tcDQvbWFzdGVyLm0zdTgiLAogICAgICAiZHVyIjogMTUKICAgIH0sCiAgIHsKICAgICAgInVyaSI6ICJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCIsCiAgICAgICJkdXIiOiAxNQogICB9CiAgXQp9" };
    let response = await main.handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual('{"ASSETS":[{"URI":"https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8","DURATION":15},{"URI":"https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8","DURATION":15}]}');
    done();
  });
});
