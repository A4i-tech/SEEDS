export const getLanguageName = (code) => {
  if (!code) return code;
  return Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "language" }).of(code) : code;
};
