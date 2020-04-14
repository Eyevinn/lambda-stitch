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

  it("can handle a request to insert an ad in the beginning of a VOD", async (done) => {
    const event = { path: "/stitch/media.m3u8", queryStringParameters: { bw: 1753000, subdir: '1000', payload: "eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0=" } };
    let response = await main.handler(event);
    const lines = response.body.split("\n");
    expect(lines[7]).toEqual("#EXT-X-CUE-OUT:DURATION=15");
    done();
  });
});