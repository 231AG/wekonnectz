import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_DIMENSION,
  MAX_UPLOAD_BYTES,
  PhotoRejectedError,
  processPhoto,
  sniffImageType,
} from "@/lib/images/process-photo";

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } });

async function jpegWithGps(width = 800, height = 600): Promise<Buffer> {
  return photo(width, height)
    .withExif({
      IFD0: { Make: "FictionalPhone", Model: "Test 1", Copyright: "Musu Kollie" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 18/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "10/1 48/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

async function rejection(input: Uint8Array) {
  try {
    await processPhoto(input);
  } catch (e) {
    if (e instanceof PhotoRejectedError) return e.reason;
    throw e;
  }
  return null;
}

describe("BR-12: uploads have EXIF metadata stripped", () => {
  it("BR-12 removes EXIF, including GPS, from a JPEG", async () => {
    const input = await jpegWithGps();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined(); // the fixture really carries EXIF + GPS

    const out = await processPhoto(input);
    const outMeta = await sharp(out).metadata();
    expect(outMeta.format).toBe("webp");
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
    expect(outMeta.icc).toBeUndefined();
    const raw = out.toString("latin1");
    for (const marker of ["Exif", "GPS", "FictionalPhone", "Musu Kollie"]) expect(raw).not.toContain(marker);
  });

  it("BR-12 applies the camera orientation before dropping it", async () => {
    const input = await photo(400, 800).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const outMeta = await sharp(await processPhoto(input)).metadata();
    expect([outMeta.width, outMeta.height]).toEqual([800, 400]);
    expect(outMeta.orientation).toBeUndefined();
  });

  it("BR-12 strips metadata from PNG and WebP uploads too", async () => {
    for (const input of [
      await photo(500, 500).withExif({ IFD0: { Copyright: "Musu Kollie" } }).png().toBuffer(),
      await photo(500, 500).withExif({ IFD0: { Copyright: "Musu Kollie" } }).webp().toBuffer(),
    ]) {
      const out = await processPhoto(input);
      expect((await sharp(out).metadata()).exif).toBeUndefined();
      expect(out.toString("latin1")).not.toContain("Musu Kollie");
    }
  });
});

describe("type is decided by magic bytes, not the file name (spec §4)", () => {
  it("recognises JPEG, PNG and WebP signatures", async () => {
    expect(sniffImageType(await photo(10, 10).jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImageType(await photo(10, 10).png().toBuffer())).toBe("png");
    expect(sniffImageType(await photo(10, 10).webp().toBuffer())).toBe("webp");
  });

  it.each([
    ["a text file renamed .jpg", Buffer.from("this is not a photo, just text pretending to be photo.jpg")],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>')],
    ["a GIF", Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00", "latin1")],
    ["a PDF", Buffer.from("%PDF-1.7\n1 0 obj\n")],
    ["an empty file", Buffer.alloc(0)],
    ["a JPEG header followed by junk", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)])],
  ])("rejects %s", async (_label, input) => {
    expect(await rejection(input)).toBe("NOT_AN_IMAGE");
  });

  it("rejects a PNG whose bytes are relabelled as JPEG by name only (decoder must agree)", async () => {
    const png = await photo(500, 500).png().toBuffer();
    expect(sniffImageType(png)).toBe("png");
    expect(await rejection(png)).toBeNull(); // a real PNG is fine whatever it is called
  });
});

describe("size limits", () => {
  it("rejects uploads over the size cap", async () => {
    expect(await rejection(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toBe("TOO_LARGE");
  });

  it("rejects photos too small to show a face", async () => {
    expect(await rejection(await photo(200, 600).jpeg().toBuffer())).toBe("TOO_SMALL");
  });

  it("resizes large photos to fit the maximum dimension and never enlarges small ones", async () => {
    const big = await sharp(await processPhoto(await photo(4000, 3000).jpeg().toBuffer())).metadata();
    expect(Math.max(big.width!, big.height!)).toBe(MAX_DIMENSION);
    const small = await sharp(await processPhoto(await photo(640, 480).jpeg().toBuffer())).metadata();
    expect([small.width, small.height]).toEqual([640, 480]);
  });
});
