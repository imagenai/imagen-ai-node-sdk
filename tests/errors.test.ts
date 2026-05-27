import {
  ImagenError,
  AuthenticationError,
  ProjectError,
  UploadError,
  DownloadError,
} from "../src/errors";

describe("Error hierarchy", () => {
  it("ImagenError extends Error", () => {
    const err = new ImagenError("base");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("base");
    expect(err.name).toBe("ImagenError");
  });

  it("AuthenticationError extends ImagenError", () => {
    const err = new AuthenticationError("bad key");
    expect(err).toBeInstanceOf(ImagenError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AuthenticationError");
  });

  it("ProjectError extends ImagenError", () => {
    const err = new ProjectError("project failed");
    expect(err).toBeInstanceOf(ImagenError);
    expect(err.name).toBe("ProjectError");
  });

  it("UploadError extends ImagenError", () => {
    const err = new UploadError("upload failed");
    expect(err).toBeInstanceOf(ImagenError);
    expect(err.name).toBe("UploadError");
  });

  it("DownloadError extends ImagenError", () => {
    const err = new DownloadError("download failed");
    expect(err).toBeInstanceOf(ImagenError);
    expect(err.name).toBe("DownloadError");
  });
});
