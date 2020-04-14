# lambda-stitch

A Lambda function that utilizes the `@eyevinn/hls-splice` library to stitch in another HLS VOD (e.g. ads) into an HLS VOD.

## POST `/stitch/`

Example body (application/json):

```
{
  "uri": "https://maitv-vod.lab.eyevinn.technology/F1_SUZUKA_APR13.mov/master.m3u8",
  "breaks": [
    { "pos": 0, "duration": 15000, "url": "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" }
  ]
}
```

The above will generate a new HLS VOD where an ad is placed at position 0 in the generated VOD (pre-roll). The request will return the following JSON:

```
{
    "uri": "/stitch/master.m3u8?payload=eyJ1cmkiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L0YxX1NVWlVLQV9BUFIxMy5tb3YvbWFzdGVyLm0zdTgiLCJicmVha3MiOlt7InBvcyI6MCwiZHVyYXRpb24iOjE1MDAwLCJ1cmwiOiJodHRwczovL21haXR2LXZvZC5sYWIuZXlldmlubi50ZWNobm9sb2d5L2Fkcy9hcG90ZWEtMTVzLm1wNC9tYXN0ZXIubTN1OCJ9XX0="
}
```
