# lambda-stitch

A Lambda function that utilizes the `@eyevinn/hls-splice` library to stitch in another HLS VOD (e.g. ads) into an HLS VOD.

<br/>

<div align="center">

[![Badge OSC](https://img.shields.io/badge/Evaluate-24243B?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTIiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8yODIxXzMxNjcyKSIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI3IiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiLz4KPGRlZnM%2BCjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhcl8yODIxXzMxNjcyIiB4MT0iMTIiIHkxPSIwIiB4Mj0iMTIiIHkyPSIyNCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjQzE4M0ZGIi8%2BCjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzREQzlGRiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM%2BCjwvc3ZnPgo%3D)](https://app.osaas.io/browse/eyevinn-lambda-stitch)

</div>

## Run Locally

To run the lambda locally do:

```
PORT=8000 node server.js
```

## POST `/stitch/`

Example body (application/json):

```
{
  "uri": "https://maitv-vod.lab.eyevinn.technology/VINN.mp4/master.m3u8",
  "breaks": [
    { "pos": 0, "duration": 15000, "url": "https://maitv-vod.lab.eyevinn.technology/ads/apotea-15s.mp4/master.m3u8" }
  ]
}
```

The above will generate a new HLS VOD where an ad is placed at position 0 in the generated VOD (pre-roll). The request will return the following JSON:

```
{
    "uri": "/stitch/master.m3u8?payload=ewogICAgICAidXJpIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvVklOTi5tcDQvbWFzdGVyLm0zdTgiLAogICAgICAiYnJlYWtzIjogWwogICAgICAgIHsgInBvcyI6IDAsICJkdXJhdGlvbiI6IDE1MDAwLCAidXJsIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiB9CiAgICAgIF0KfQ=="
}
```

## HLS Interstitial

Instead of stitching in the ad on the server side this Lambda function can return an HLS with DATERANGE interstitial with an assetlist URI pointing back to the Lambda. Add the query param `i=1` to use interstitial:

```
/stitch/master.m3u8?payload=ewogICAgICAidXJpIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvVklOTi5tcDQvbWFzdGVyLm0zdTgiLAogICAgICAiYnJlYWtzIjogWwogICAgICAgIHsgInBvcyI6IDAsICJkdXJhdGlvbiI6IDE1MDAwLCAidXJsIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiB9CiAgICAgIF0KfQ==&i=1
```

The resulting media playlist will then for example contain the following DATERANGE tag:

```
#EXT-X-DATERANGE:ID="1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.000Z",X-ASSET-LIST="/stitch/assetlist/eyJhc3NldHMiOlt7InVyaSI6Imh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiwiZHVyIjoxNX1dfQ%3D%3D"
```

The assetlist URI contains an escaped base64 encoded payload containing the list of ads to be inserted, and the assetlist endpoint returns a JSON according to the X-ASSET-LIST attribute in the HLS Interstitial specification: https://developer.apple.com/streaming/GettingStartedWithHLSInterstitials.pdf

To both insert HLS interstitial tags and splice in the ad segments you can provide the query param `c=1`:

```
/stitch/master.m3u8?payload=ewogICAgICAidXJpIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvVklOTi5tcDQvbWFzdGVyLm0zdTgiLAogICAgICAiYnJlYWtzIjogWwogICAgICAgIHsgInBvcyI6IDAsICJkdXJhdGlvbiI6IDE1MDAwLCAidXJsIjogImh0dHBzOi8vbWFpdHYtdm9kLmxhYi5leWV2aW5uLnRlY2hub2xvZ3kvYWRzL2Fwb3RlYS0xNXMubXA0L21hc3Rlci5tM3U4IiB9CiAgICAgIF0KfQ==&c=1
```

### 2024 NOV 29 Update!

#### EXAMPLE (A)
You can also use interstitials with any assetList URI of your choice by specifying it in the payload break as such:

```js
{
  "uri": "https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest.m3u8", // SOURCE VOD ASSET
  "breaks": [
    { "pos": 0, "duration": 15000, "assetListUrl": "https://urlto.your.adserving/service/hls/15-seconds-of-ads/assets"},
    { "pos": 75000, "duration": 45000, "assetListUrl": "https://urlto.your.adserving/service/hls/45-seconds-of-ads/assets", "sn": "IN", "re":"SKIP,JUMP"}
  ]
}
```

where each `assetListUrl` is expected to return a json list in this format:

```json
[
  {
    "URI": "https://ad.content.origin/ad1/master.m3u8",
    "DURATION": 30
  },
  {
    "URI": "https://ad.content.origin/ad2/master.m3u8",
    "DURATION": 20
  }
]
```

The final path would look like this:

```
/stitch/master.m3u8?i=1&payload=eyJ1cmkiOiJodHRwczovL2xhYi5jZG4uZXlldmlubi50ZWNobm9sb2d5L1ZJTk4tT3BiWmpyeXhhMy5tcDQvbWFuaWZlc3QubTN1OCIsImJyZWFrcyI6W3sicG9zIjowLCJkdXJhdGlvbiI6MTUwMDAsImFzc2V0TGlzdFVybCI6Imh0dHBzOi8vdXJsdG8ueW91ci5hZHNlcnZpbmcvc2VydmljZS9obHMvMTUtc2Vjb25kcy1vZi1hZHMvYXNzZXRzIn0seyJwb3MiOjc1MDAwLCJkdXJhdGlvbiI6NDUwMDAsImFzc2V0TGlzdFVybCI6Imh0dHBzOi8vdXJsdG8ueW91ci5hZHNlcnZpbmcvc2VydmljZS9obHMvNDUtc2Vjb25kcy1vZi1hZHMvYXNzZXRzIiwic24iOiJJTiIsInJlIjoiU0tJUCxKVU1QIn1dfQ
```

and would result in a HLS with a playlist manifest as such:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-PROGRAM-DATE-TIME:1970-01-01T00:00:00.001Z
#EXT-X-DATERANGE:ID="Ad-Break-1",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:00:00.001Z",DURATION=15,X-ASSET-LIST="https://urlto.your.adserving/service/hls/15-seconds-of-ads/assets",X-RESUME-OFFSET=0
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00001.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00002.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00003.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00004.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00005.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00006.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00007.ts
#EXT-X-DATERANGE:ID="Ad-Break-2",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:01:15.001Z",DURATION=45,X-ASSET-LIST="https://urlto.your.adserving/service/hls/45-seconds-of-ads/assets",X-RESUME-OFFSET=0,X-SNAP="IN",X-RESTRICT="SKIP,JUMP"
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00008.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00009.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00010.ts
#EXTINF:6.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00011.ts
#EXT-X-ENDLIST
```

#### EXAMPLE (B)
You can also combine Splicing with Interstitials using the query parameter `&c=1` with a payload that looks like this:

```js
{
  "uri": "https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest.m3u8", // SOURCE VOD ASSET
  "breaks": [
    { "pos": 60000, "duration": 30000, "assetListUrl": "https://urlto.your.adserving/service/hls/30-seconds-of-dai-ads/assets","sn": "IN", "re":"SKIP,JUMP"},
    { "pos": 60000, "duration": 10000, "url": "https://urlto.your.ad/hls/10seconds-ad-content_A.m3u8"},
    { "pos": 60000, "duration": 10000, "url": "https://urlto.your.ad/hls/10seconds-ad-content_B.m3u8"},
    { "pos": 60000, "duration": 10000, "url": "https://urlto.your.ad/hls/10seconds-ad-content_C.m3u8"},
  ]
}
```
Above we have a payload that will splice in three ad vods at 60 seconds into the source vod, a total break of 30 seconds, and also have a interstitial tag placed above the first ad segment with a duration of 30 seconds with a start-date time at 60 seconds. Also, when in combination mode, the X-RESUME-OFFSET will be set automatically, so make sure that the interstitials effectively play over the spliced ads.
(NOTE: in the cases where the desired position do not line up perfectly with the segment count, the start-date time will be adjusted to accomodate this)

The final path would look like this:

```
/stitch/master.m3u8?c=1&payload=eyJ1cmkiOiJodHRwczovL2xhYi5jZG4uZXlldmlubi50ZWNobm9sb2d5L1ZJTk4tT3BiWmpyeXhhMy5tcDQvbWFuaWZlc3QubTN1OCIsImJyZWFrcyI6W3sicG9zIjo2MDAwMCwiZHVyYXRpb24iOjMwMDAwLCJhc3NldExpc3RVcmwiOiJodHRwczovL3VybHRvLnlvdXIuYWRzZXJ2aW5nL3NlcnZpY2UvaGxzLzE1LXNlY29uZHMtb2YtYWRzL2Fzc2V0cyIsInNuIjoiSU4iLCJyZSI6IlNLSVAsSlVNUCJ9LHsicG9zIjo2MDAwMCwiZHVyYXRpb24iOjEwMDAwLCJ1cmwiOiJodHRwczovL3VybHRvLnlvdXIuYWQvaGxzLzEwc2Vjb25kcy1hZC1jb250ZW50X0EubTN1OCJ9LHsicG9zIjo2MDAwMCwiZHVyYXRpb24iOjEwMDAwLCJ1cmwiOiJodHRwczovL3VybHRvLnlvdXIuYWQvaGxzLzEwc2Vjb25kcy1hZC1jb250ZW50X0IubTN1OCJ9LHsicG9zIjo2MDAwMCwiZHVyYXRpb24iOjEwMDAwLCJ1cmwiOiJodHRwczovL3VybHRvLnlvdXIuYWQvaGxzLzEwc2Vjb25kcy1hZC1jb250ZW50X0MubTN1OCJ9XX0
```
and would result in a HLS with a playlist manifest as such:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-PROGRAM-DATE-TIME:1970-01-01T00:00:00.001Z
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00001.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00002.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00003.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00004.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00005.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00006.ts
#EXT-X-DATERANGE:ID="Ad-Break-2",CLASS="com.apple.hls.interstitial",START-DATE="1970-01-01T00:01:00.001Z",DURATION=30,X-ASSET-LIST="https://urlto.your.adserving/service/hls/30-seconds-of-ads/assets",X-RESUME-OFFSET=30,X-SNAP="IN",X-RESTRICT="SKIP,JUMP"
#EXT-X-DISCONTINUITY
#EXT-X-CUE-OUT:DURATION=30
#EXTINF:6.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_A.mp4/1000/1000-00000.ts
#EXTINF:4.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_A.mp4/1000/1000-00001.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_B.mp4/1000/1000-00000.ts
#EXTINF:4.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_B.mp4/1000/1000-00001.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_C.mp4/1000/1000-00000.ts
#EXTINF:4.0000,
https://maitv-vod.lab.eyevinn.technology/ads/bc55ffdc-d071-4858-a97d-AD_C.mp4/1000/1000-00001.ts
#EXT-X-DISCONTINUITY
#EXT-X-CUE-IN
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00007.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00008.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00009.ts
#EXTINF:10.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00010.ts
#EXTINF:6.0000,
https://lab.cdn.eyevinn.technology/VINN-OpbZjryxa3.mp4/manifest_3_00011.ts
#EXT-X-ENDLIST
```
### Available HLS Interstitial Options

The following attributes are supported for HLS Interstitial tags and can be set in the payload under these keys:

| Key   | Attribute            | Description                                                                                                                                                                                                                                            |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ro`  | X-RESUME-OFFSET      | a decimal value in seconds that indicates where primary playback should resume after an interstitial, typically starting at zero, and if absent, the player uses the interstitial's duration for resuming, suitable for both live and VOD playback.    |
| `pol` | X-PLAYOUT-LIMIT      | a decimal value in seconds that sets a maximum playout time for the interstitial; if present, the player will end the interstitial at this offset, otherwise it will end when the interstitial asset finishes.                                         |
| `sn`  | X-SNAP               | an enumerated-string-list of Snap Identifiers. The defined Snap Identifiers are: OUT and IN.                                                                                                                                                           |
| `re`  | X-RESTRICT           | an enumerated-string-list of Navigation Restriction Identifiers. The defined Navigation Restriction Identifiers are: SKIP and JUMP.                                                                                                                    |
| `cmv` | X-CONTENT-MAY-VARY   | an optional quoted string that can be "YES" (indicating varying interstitial content across clients) or "NO" (indicating uniform content); if absent, it defaults to "YES," and "NO" signals that playback can be coordinated across multiple players. |
| `tlo` | X-TIMELINE-OCCUPIES  | an optional quoted string with valid values "POINT" or "RANGE," indicating how the interstitial should be displayed in a timeline UI; if absent, it defaults to "POINT," but may be "RANGE" if there is a positive non-zero resumption offset          |
| `tls` | X-TIMELINE-STYLE     | an optional quoted string that can be "HIGHLIGHT" or "PRIMARY," indicating whether the interstitial is displayed distinctly in a timeline UI, defaulting to "HIGHLIGHT" if absent.                                                                     |
| `cb`  | X-YOUR-CUSTOM-BEACON | a defined additional attribute for customization, must have "X-" prefix.                                                                                                                                                                               |
| `cue` | X-CUE                | An optional enumerated list of Trigger Identifiers (PRE, POST, ONCE) that indicates when to trigger an action related to the Date Range, which may occur outside the specified START-DATE and duration.                                                |
