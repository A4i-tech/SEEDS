export function isMp3File(file) {
  if (!file) return false;
  const nameOk = file.name && file.name.toLowerCase().endsWith(".mp3");
  const typeOk = file.type === "audio/mpeg" || file.type === "audio/mp3";
  return nameOk && typeOk;
}

export function isBrfFile(file) {
  return file.name.toLowerCase().endsWith(".brf");
}

