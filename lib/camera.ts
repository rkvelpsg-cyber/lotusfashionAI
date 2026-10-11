export type CameraFacingMode = "environment" | "user";

const desktopCameraConstraints: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  { video: true, audio: false },
];

const rearCameraLabel = /\b(back|rear|environment|world)\b/i;
const frontCameraLabel = /\b(front|user|selfie)\b/i;

export function isMobileOrTablet(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  return (
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

export function getCameraConstraints(
  mobile: boolean,
  facingMode: CameraFacingMode = "environment",
): MediaStreamConstraints[] {
  if (!mobile) return desktopCameraConstraints;
  return [
    { video: { facingMode: { ideal: facingMode } }, audio: false },
    { video: true, audio: false },
  ];
}

export function findRearCamera(devices: readonly MediaDeviceInfo[]) {
  return devices.find(
    (device) =>
      device.kind === "videoinput" && rearCameraLabel.test(device.label),
  );
}

export function getCameraFacing(
  stream: MediaStream,
  devices: readonly MediaDeviceInfo[],
  fallback: CameraFacingMode,
): CameraFacingMode {
  const track = stream.getVideoTracks()[0];
  const facingMode = track?.getSettings().facingMode;
  if (facingMode === "user" || facingMode === "environment") return facingMode;

  const deviceId = track?.getSettings().deviceId;
  const label = devices.find((device) => device.deviceId === deviceId)?.label;
  if (label && frontCameraLabel.test(label)) return "user";
  if (label && rearCameraLabel.test(label)) return "environment";
  return fallback;
}

export function stopMediaStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function isPermissionError(error: unknown) {
  return (
    error instanceof Error &&
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(
      error.name,
    )
  );
}

export async function openCameraStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">,
  mobile: boolean,
  facingMode: CameraFacingMode,
  deviceId?: string,
): Promise<{
  stream: MediaStream;
  facingMode: CameraFacingMode;
  notice: string;
}> {
  let lastError: unknown;
  let stream: MediaStream | undefined;

  if (!mobile) {
    for (const constraints of getCameraConstraints(false)) {
      try {
        stream = await mediaDevices.getUserMedia(constraints);
        break;
      } catch (error: unknown) {
        lastError = error;
        if (isPermissionError(error)) break;
      }
    }
    if (!stream) throw lastError;
    return { stream, facingMode: "user", notice: "" };
  }

  if (deviceId) {
    try {
      stream = await mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      return { stream, facingMode, notice: "" };
    } catch (error: unknown) {
      lastError = error;
      if (isPermissionError(error)) throw error;
    }
  }

  try {
    stream = await mediaDevices.getUserMedia(getCameraConstraints(true, facingMode)[0]);
  } catch (error: unknown) {
    lastError = error;
    if (isPermissionError(error)) throw error;
  }

  if (!stream) {
    try {
      stream = await mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (error: unknown) {
      lastError = error;
      if (isPermissionError(error)) throw error;
    }
  }
  if (!stream) throw lastError;

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await mediaDevices.enumerateDevices();
  } catch {
    const selectedFacing = getCameraFacing(stream, devices, facingMode);
    return {
      stream,
      facingMode: selectedFacing,
      notice:
        facingMode === "environment" && selectedFacing !== "environment"
          ? "Camera details are unavailable and the rear camera could not be confirmed. You can use this camera, switch cameras, or upload a photo."
          : "Camera details are unavailable. You can still use this camera or upload a photo.",
    };
  }

  const rearCamera = facingMode === "environment" ? findRearCamera(devices) : undefined;
  const currentTrack = stream.getVideoTracks()[0];
  const currentSettings = currentTrack?.getSettings();
  const currentLabel = devices.find(
    (device) => device.deviceId === currentSettings?.deviceId,
  )?.label;
  const currentIsRear =
    currentSettings?.facingMode === "environment" ||
    currentSettings?.deviceId === rearCamera?.deviceId ||
    Boolean(currentLabel && rearCameraLabel.test(currentLabel));
  if (rearCamera && !currentIsRear) {
    stopMediaStream(stream);
    stream = undefined;
    try {
      stream = await mediaDevices.getUserMedia({
        video: { deviceId: { exact: rearCamera.deviceId } },
        audio: false,
      });
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (!stream) {
    try {
      stream = await mediaDevices.getUserMedia(
        getCameraConstraints(true, facingMode)[0],
      );
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (!stream) {
    try {
      stream = await mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (error: unknown) {
      lastError = error;
    }
  }
  if (!stream) throw lastError;

  const selectedFacing = getCameraFacing(stream, devices, facingMode);
  const selectedSettings = stream.getVideoTracks()[0]?.getSettings();
  const selectedLabel = devices.find(
    (device) => device.deviceId === selectedSettings?.deviceId,
  )?.label;
  const facingWasIdentified =
    selectedSettings?.facingMode === "environment" ||
    selectedSettings?.facingMode === "user" ||
    Boolean(selectedLabel && (rearCameraLabel.test(selectedLabel) || frontCameraLabel.test(selectedLabel)));
  return {
    stream,
    facingMode: selectedFacing,
    notice:
      selectedFacing !== facingMode
        ? facingMode === "environment"
          ? "The rear camera is unavailable. You can use the available camera, switch cameras, or upload a photo."
          : "The selected camera is unavailable. You can use the available camera or upload a photo."
        : facingMode === "environment" &&
            !facingWasIdentified &&
            !rearCamera
          ? "The rear camera could not be identified. You can use the available camera, switch cameras, or upload a photo."
          : "",
  };
}
