import { getProfiles, getProfile, checkFilesMatchProfileType } from "../src/convenience";
import { UploadError } from "../src/errors";
import type { Profile } from "../src/models";

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  imageType: "RAW",
  profileKey: 5700,
  profileName: "Test Profile",
  profileType: "premium",
  ...overrides,
});

describe("checkFilesMatchProfileType", () => {
  it("passes when all files match RAW profile", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.cr2", "b.nef", "c.arw"], makeProfile({ imageType: "RAW" }))
    ).not.toThrow();
  });

  it("passes when all files match JPG profile", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.jpg", "b.jpeg"], makeProfile({ imageType: "JPG" }))
    ).not.toThrow();
  });

  it("throws UploadError when RAW profile receives JPG files", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.jpg"], makeProfile({ imageType: "RAW" }))
    ).toThrow(UploadError);
  });

  it("throws UploadError when JPG profile receives RAW files", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.cr2"], makeProfile({ imageType: "JPG" }))
    ).toThrow(UploadError);
  });

  it("throws UploadError on unsupported file types with RAW profile", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.png"], makeProfile({ imageType: "RAW" }))
    ).toThrow(UploadError);
  });

  it("throws UploadError on unsupported file types with JPG profile", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.txt"], makeProfile({ imageType: "JPG" }))
    ).toThrow(UploadError);
  });

  it("throws UploadError on unknown profile image type", () => {
    expect(() =>
      checkFilesMatchProfileType(["a.cr2"], makeProfile({ imageType: "HEIC" }))
    ).toThrow(UploadError);
  });

  it("error message includes the offending file list", () => {
    try {
      checkFilesMatchProfileType(["a.jpg", "b.jpg"], makeProfile({ imageType: "RAW" }));
    } catch (e) {
      expect(String(e)).toContain("a.jpg");
    }
  });
});

describe("getProfile", () => {
  it("throws UploadError when profile key not found", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ data: { profiles: [] } }),
    } as unknown as Response);

    await expect(getProfile("api-key", 9999)).rejects.toThrow(UploadError);
  });

  it("returns matching profile by key", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({
        data: {
          profiles: [
            { image_type: "RAW", profile_key: 5700, profile_name: "Wedding", profile_type: "premium" },
            { image_type: "JPG", profile_key: 1234, profile_name: "Portraits", profile_type: "standard" },
          ],
        },
      }),
    } as unknown as Response);

    const profile = await getProfile("api-key", 5700);
    expect(profile.profileKey).toBe(5700);
    expect(profile.profileName).toBe("Wedding");
  });

  it("throws UploadError when key does not match any profile", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({
        data: {
          profiles: [
            { image_type: "RAW", profile_key: 5700, profile_name: "Wedding", profile_type: "premium" },
          ],
        },
      }),
    } as unknown as Response);

    await expect(getProfile("api-key", 9999)).rejects.toThrow(UploadError);
  });
});

describe("getProfiles (standalone)", () => {
  it("returns all profiles", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({
        data: {
          profiles: [
            { image_type: "RAW", profile_key: 5700, profile_name: "Wedding", profile_type: "premium" },
          ],
        },
      }),
    } as unknown as Response);

    const profiles = await getProfiles("api-key");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.profileKey).toBe(5700);
  });
});
