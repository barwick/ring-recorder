import fs from "fs";
import { RingApi } from "ring-client-api";
import dotenv from "dotenv";
import path from "path";
import dateTime from "node-datetime";

dotenv.config();
const { RING_REFRESH_TOKEN } = process.env;

const now = (format) => {
  let date = dateTime.create();
  return date.format(format);
};

async function listen() {
  const ringApi = new RingApi({
    refreshToken: RING_REFRESH_TOKEN,
    debug: true,
  });

  const cameras = await ringApi.getCameras();
  const locations = await ringApi.getLocations();
  console.log(
    `Found ${locations.length} location(s) with ${cameras.length} camera(s).`
  );

  if (!cameras) {
    console.log("No cameras found.");
    return;
  }

  // Refresh auth
  ringApi.onRefreshTokenUpdated.subscribe(async ({ newRefreshToken }) => {
    console.log("Access token refreshed");
    fs.writeFileSync(".env", `RING_REFRESH_TOKEN=${newRefreshToken}`);
  });

  // Setup motion listeners for each camera
  cameras.forEach((camera) => {
    console.log("Subscribed to motion for", camera.name);
    let stream;
    camera.onMotionDetected.subscribe(async (motion) => {
      if (motion) {
        console.log(
          `[${now("Y/m/d - H:M:S")}] Motion detected on camera: ${
            camera.name
          }. Recording.`
        );
        stream = await camera.streamVideo({
          output: [
            "-flags",
            "+global_header",
            "-f",
            "segment",
            "-segment_time",
            "31", // 31 seconds
            "-segment_format_options",
            "movflags=+faststart",
            "-reset_timestamps",
            "1",
            path.join("/tmp", `${camera.name}-${now("Ymd-HMS")}-%d.mp4`),
          ],
        });
      } else {
        console.log(
          `[${now("Y/m/d - H:M:S")}] Motion finished on camera: ${
            camera.name
          }. Stopped recording.`
        );
        if (stream) {
          stream.stop();
        } else {
          console.log(
            `[${now(
              "Y/m/d - H:M:S"
            )}] Motion finished but recording never started.`
          );
        }
      }
    });
  });
}

// Start
listen().catch((e) => {
  console.error(e);
  process.exit(1);
});
