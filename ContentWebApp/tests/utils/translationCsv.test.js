import Papa from "papaparse";
import {
  ENCODING_ERROR,
  buildImportRows as buildRows,
  buildTranslationCsv,
  countQuestionMarkTranslations,
  parseTranslationCsv,
  questionMarkError,
  selectTargetColumn,
} from "../../src/utils/translationCsv";

const Q = "\u0022";

const buildImportRows = (table, index) => buildRows(table, index).map(({ row, ...rest }) => rest);

const doc = (key, route, sourceText, kn) => ({
  key,
  route,
  sourceText,
  translations: { kn: { text: kn, status: "pending" } },
});

describe("buildTranslationCsv", () => {
  test("starts with a UTF-8 BOM and the Loco-style header", () => {
    const csv = buildTranslationCsv({ docs: [], lang: "kn", languageName: "Kannada" });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}`
    );
  });

  test("quotes every field, escapes quotes, keeps commas, multiline values and Unicode", () => {
    const csv = buildTranslationCsv({
      docs: [
        doc("k1", "/", "Welcome, friend", "ಸ್ವಾಗತ, ಸ್ನೇಹಿತ"),
        doc("k2", "/", `Say ${Q}hi${Q} now`, `ಹೇ ${Q}ಹಾಯ್${Q} ಈಗ`),
        doc("k3", "/", "Line one\nLine two", "ಸಾಲು ೧\nಸಾಲು ೨"),
      ],
      lang: "kn",
      languageName: "Kannada",
    });

    expect(csv).toContain(`${Q}k1${Q},${Q}/${Q},${Q}Welcome, friend${Q},${Q}ಸ್ವಾಗತ, ಸ್ನೇಹಿತ${Q}`);
    expect(csv).toContain(
      `${Q}k2${Q},${Q}/${Q},${Q}Say ${Q}${Q}hi${Q}${Q} now${Q},${Q}ಹೇ ${Q}${Q}ಹಾಯ್${Q}${Q} ಈಗ${Q}`
    );
    expect(csv).toContain(`${Q}k3${Q},${Q}/${Q},${Q}Line one\nLine two${Q},${Q}ಸಾಲು ೧\nಸಾಲು ೨${Q}`);
  });

  test("includes blank-target rows and uses the selected language only", () => {
    const docs = [
      {
        ...doc("k1", "/", "Hello", "ಹಲೋ"),
        translations: { kn: { text: "ಹಲೋ" }, te: { text: "హలో" } },
      },
      doc("k2", "/", "No translation yet", ""),
      {
        ...doc("k3", "/about", "Other language only", ""),
        translations: { kn: { text: "" }, te: { text: "తెలుగు" } },
      },
    ];

    const { data } = Papa.parse(
      buildTranslationCsv({ docs, lang: "kn", languageName: "Kannada" }).slice(1)
    );

    expect(data).toEqual([
      ["Asset ID", "Route", "English, en", "Kannada, kn"],
      ["k1", "/", "Hello", "ಹಲೋ"],
      ["k2", "/", "No translation yet", ""],
      ["k3", "/about", "Other language only", ""],
    ]);
  });

  test("keeps one row per route and key, sorted by route then key", () => {
    const csv = buildTranslationCsv({
      docs: [doc("b", "/z", "S", "x"), doc("a", "/z", "S", "x"), doc("a", "/a", "S", "x")],
      lang: "kn",
    });

    const { data } = Papa.parse(csv.slice(1));
    expect(data.slice(1).map((r) => `${r[1]}|${r[0]}`)).toEqual(["/a|a", "/z|a", "/z|b"]);
  });

  test("falls back to the language code when no language name is given", () => {
    expect(buildTranslationCsv({ docs: [], lang: "kn" })).toContain(`${Q}kn, kn${Q}`);
  });
});

describe("parseTranslationCsv", () => {
  test("round-trips an exported file", () => {
    const docs = [
      doc("k1", "/", "Welcome, friend", "ಸ್ವಾಗತ, ಸ್ನೇಹಿತ"),
      doc("k2", "/about", `Say ${Q}hi${Q}`, ""),
      doc("k3", "/", "Line one\nLine two", "ಸಾಲು ೧\nಸಾಲು ೨"),
    ];

    const table = parseTranslationCsv(
      buildTranslationCsv({ docs, lang: "kn", languageName: "Kannada" })
    );
    const target = selectTargetColumn(table, "kn");

    expect(table.error).toBeUndefined();
    expect(buildImportRows(table, target.index)).toEqual([
      { route: "/", key: "k1", source: "Welcome, friend", text: "ಸ್ವಾಗತ, ಸ್ನೇಹಿತ" },
      { route: "/", key: "k3", source: "Line one\nLine two", text: "ಸಾಲು ೧\nಸಾಲು ೨" },
      { route: "/about", key: "k2", source: `Say ${Q}hi${Q}`, text: "" },
    ]);
  });

  test("tolerates leading Localise-style comment rows and a BOM", () => {
    const text =
      `\uFEFF${Q}'Loco csv export: Comma separated values${Q}\n` +
      `${Q}'Project: Untitled project${Q}\n` +
      `${Q}'Locale: kn, Kannada${Q}\n` +
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q},${Q}Context${Q},${Q}Notes${Q}\n` +
      `${Q}hello${Q},${Q}/${Q},${Q}Hello World${Q},${Q}ಹಲೋ${Q},${Q}${Q},${Q}${Q}\n`;

    const table = parseTranslationCsv(text);

    expect(table.error).toBeUndefined();
    expect(table.targets).toEqual([{ index: 3, label: "Kannada, kn", code: "kn" }]);
    expect(buildImportRows(table, 3)).toEqual([
      { route: "/", key: "hello", source: "Hello World", text: "ಹಲೋ" },
    ]);
  });

  test("reads an Excel re-saved file: padded comment rows, CRLF, unquoted fields, multiline cells", () => {
    const text =
      "\uFEFF'Loco csv export: Comma separated values,,,\r\n" +
      "'Project: Untitled project,,,\r\n" +
      `${Q}'Exported at: Mon, 21 Sep 2026 12:58:50 +0530${Q},,,\r\n` +
      `Asset ID,Route,${Q}English, en${Q},${Q}Kannada, kn${Q}\r\n` +
      "hello,/,Hello World,ಹೊಸ ಮೌಲ್ಯ (Excel-edit)\r\n" +
      `comma,/,${Q}Welcome, friend${Q},${Q}ಒಂದು, ಎರಡು, ಮೂರು${Q}\r\n` +
      `quote,/,${Q}Say ${Q}${Q}hi${Q}${Q} now${Q},${Q}ಅವರು ${Q}${Q}ನಮಸ್ಕಾರ${Q}${Q} ಎಂದರು${Q}\r\n` +
      `newline,/,${Q}Multi\nline${Q},${Q}ಸಾಲು ೧\nಸಾಲು ೨${Q}\r\n` +
      ",,,\r\n" +
      "untranslated,/,Untranslated one,\r\n";

    const table = parseTranslationCsv(text);
    const rows = buildImportRows(table, selectTargetColumn(table, "kn").index);

    expect(rows).toEqual([
      { route: "/", key: "hello", source: "Hello World", text: "ಹೊಸ ಮೌಲ್ಯ (Excel-edit)" },
      { route: "/", key: "comma", source: "Welcome, friend", text: "ಒಂದು, ಎರಡು, ಮೂರು" },
      {
        route: "/",
        key: "quote",
        source: `Say ${Q}hi${Q} now`,
        text: `ಅವರು ${Q}ನಮಸ್ಕಾರ${Q} ಎಂದರು`,
      },
      { route: "/", key: "newline", source: "Multi\nline", text: "ಸಾಲು ೧\nಸಾಲು ೨" },
      { route: "/", key: "untranslated", source: "Untranslated one", text: "" },
    ]);
  });

  test("reads semicolon-delimited files saved by Excel in other locales", () => {
    const table = parseTranslationCsv("Asset ID;Route;English, en;Kannada, kn\nk1;/;Hello;ಹಲೋ\n");

    expect(table.error).toBeUndefined();
    expect(buildImportRows(table, 3)).toEqual([
      { route: "/", key: "k1", source: "Hello", text: "ಹಲೋ" },
    ]);
  });

  test("throws on a row missing one of the required columns", () => {
    const table = parseTranslationCsv(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}\n${Q}k1${Q},${Q}/${Q},${Q}Hello${Q}\n`
    );

    expect(() => buildImportRows(table, 3)).toThrow();
  });

  test("an empty file or one without an Asset ID header is an error", () => {
    expect(parseTranslationCsv("").error).toMatch(/Asset ID/);
    expect(parseTranslationCsv("key,source,translation\nk1,Hello,ಹಲೋ\n").error).toMatch(/Asset ID/);
  });

  test("a header-only file has no rows", () => {
    const table = parseTranslationCsv(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}\n`
    );

    expect(table.error).toBeUndefined();
    expect(table.rows).toEqual([]);
  });

  test("requires a Route column and a source plus target column", () => {
    expect(
      parseTranslationCsv(
        `${Q}Asset ID${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}\n${Q}k${Q},${Q}a${Q},${Q}b${Q}\n`
      ).error
    ).toMatch(/Route/);
    expect(
      parseTranslationCsv(
        `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q}\n${Q}k${Q},${Q}/${Q},${Q}a${Q}\n`
      ).error
    ).toMatch(/target language/);
  });

  test.each([
    [
      "an unclosed quote is reported with its row instead of swallowing the rest of the file",
      `${Q}k1${Q},${Q}/${Q},${Q}Hello${Q},${Q}ಹಲೋ${Q}\n${Q}k2${Q},${Q}/${Q},${Q}Unclosed,ಹಲೋ\n${Q}k3${Q},${Q}/${Q},${Q}After${Q},${Q}ನಂತರ${Q}\n`,
      /could not be parsed.*\(row 3\)/,
    ],
    [
      "a stray quote inside a quoted value",
      `${Q}k1${Q},${Q}/${Q},${Q}Hel${Q}lo${Q},${Q}ಹಲೋ${Q}\n`,
      /could not be parsed/,
    ],
  ])("%s is rejected", (_name, body, message) => {
    const result = parseTranslationCsv(`"Asset ID","Route","English, en","Kannada, kn"\n${body}`);

    expect(result.error).toMatch(message);
    expect(result.rows).toBeUndefined();
  });

  test("numbers rows as a spreadsheet would, counting comment rows and blank lines", () => {
    const table = parseTranslationCsv(
      "'Loco csv export,,,\r\n" +
        "'Project: x,,,\r\n" +
        `Asset ID,Route,${Q}English, en${Q},${Q}Kannada, kn${Q}\r\n` +
        "k1,/,One,ಒಂದು\r\n" +
        ",,,\r\n" +
        "\r\n" +
        "k2,/,Two,ಎರಡು\r\n"
    );

    expect(buildRows(table, 3).map((r) => [r.row, r.key])).toEqual([
      [4, "k1"],
      [7, "k2"],
    ]);
  });

  test("a CSV with only an Asset ID, Route, source and one target column is accepted", () => {
    const table = parseTranslationCsv(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}\n${Q}k1${Q},${Q}/${Q},${Q}Hello${Q},${Q}ಹಲೋ${Q}\n`
    );

    expect(table.error).toBeUndefined();
    expect(table.targets).toHaveLength(1);
    expect(selectTargetColumn(table, "kn")).toEqual({ index: 3, code: "kn" });
  });

  test("Context and Notes columns do not change which column is the target", () => {
    const table = parseTranslationCsv(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q},${Q}Context${Q},${Q}Notes${Q}\n${Q}k1${Q},${Q}/${Q},${Q}Hello${Q},${Q}ಹಲೋ${Q},${Q}ctx${Q},${Q}note${Q}\n`
    );

    expect(selectTargetColumn(table, "kn")).toEqual({ index: 3, code: "kn" });
    expect(buildImportRows(table, 3)).toEqual([
      { route: "/", key: "k1", source: "Hello", text: "ಹಲೋ" },
    ]);
  });

  test("a metadata column without a language code before the target is not read as a language", () => {
    const table = parseTranslationCsv(
      `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Screenshot${Q},${Q}Kannada, kn${Q}\n${Q}k1${Q},${Q}/${Q},${Q}Hello${Q},${Q}img${Q},${Q}ಹಲೋ${Q}\n`
    );

    expect(table.targets).toHaveLength(1);
    expect(selectTargetColumn(table, "kn")).toEqual({ index: 4, code: "kn" });
  });
});

describe("selectTargetColumn", () => {
  const table = (headers) =>
    parseTranslationCsv(
      `"Asset ID","Route",${headers.map((h) => `"${h}"`).join(",")}\n"k","/","Hello","x","y"\n`
    );

  test("accepts the column whose locale code matches the selected language", () => {
    expect(selectTargetColumn(table(["English, en", "Kannada, kn"]), "kn")).toEqual({
      index: 3,
      code: "kn",
    });
  });

  test("blocks a column that is for a different language", () => {
    const result = selectTargetColumn(table(["English, en", "Telugu, te"]), "kn");

    expect(result.error).toMatch(/"te"/);
    expect(result.index).toBeUndefined();
  });

  test("allows a target column without a locale code and warns", () => {
    const result = selectTargetColumn(table(["English, en", "Translation"]), "kn");

    expect(result.index).toBe(3);
    expect(result.warning).toMatch(/no language code/);
  });

  test("picks the matching column from a multi-language Loco file and ignores the others", () => {
    const multi = table(["English, en", "Kannada, kn", "Telugu, te"]);

    expect(selectTargetColumn(multi, "te")).toEqual({ index: 4, code: "te" });
    expect(selectTargetColumn(multi, "hi").error).toMatch(/no target column for "hi"/);
  });
});

describe("formula injection protection", () => {
  const risky = [
    `=HYPERLINK(${Q}http://evil.example${Q},${Q}click${Q})`,
    "+1 offer",
    "-5% off",
    "@user",
    "\tTabbed",
    "\rCarriage return",
    "'=already apostrophe",
    "''+two apostrophes",
  ];
  const safe = [
    "normal text",
    "'quoted' word",
    "'hello",
    "a=b",
    "x+y",
    "ಕನ್ನಡ తెలుగు",
    " =leading space",
  ];

  const exportCells = (docs) => {
    const csv = buildTranslationCsv({ docs, lang: "kn", languageName: "Kannada" });
    return Papa.parse(csv.slice(1)).data.slice(1);
  };

  test("risky cells are prefixed with an apostrophe in every column", () => {
    const cells = exportCells(risky.map((value, i) => doc(`k${i}`, "/", value, value)));

    cells.forEach(([, , source, target], i) => {
      expect(source).toBe(`'${risky[i]}`);
      expect(target).toBe(`'${risky[i]}`);
    });
  });

  test("the key and route are protected too, because the public extract endpoint accepts anything", () => {
    const [[key, route]] = exportCells([doc("=cmd|' /C calc'!A0", "=1+1", "Hello", "ಹಲೋ")]);

    expect(key).toBe("'=cmd|' /C calc'!A0");
    expect(route).toBe("'=1+1");
  });

  test("safe cells are exported unchanged", () => {
    const cells = exportCells(safe.map((value, i) => doc(`k${i}`, "/", value, value)));

    cells.forEach(([, , source, target], i) => {
      expect(source).toBe(safe[i]);
      expect(target).toBe(safe[i]);
    });
  });

  test("export then import returns the original values, so source comparison is unaffected", () => {
    const docs = [...risky, ...safe].map((value, i) => doc(`k${i}`, "/", value, value));
    docs.push(doc("=evilkey", "=evilroute", "=source", "=target"));

    const table = parseTranslationCsv(
      buildTranslationCsv({ docs, lang: "kn", languageName: "Kannada" })
    );
    const rows = buildImportRows(table, selectTargetColumn(table, "kn").index);

    expect(rows).toEqual(
      docs
        .map((d) => ({
          route: d.route,
          key: d.key,
          source: d.sourceText,
          text: d.translations.kn.text,
        }))
        .sort((a, b) => a.route.localeCompare(b.route) || a.key.localeCompare(b.key))
    );
  });

  test("an Excel re-saved file keeps the apostrophe as text and still imports the original value", () => {
    const table = parseTranslationCsv(
      `Asset ID,Route,${Q}English, en${Q},${Q}Kannada, kn${Q}\r\nk1,/,'=SUM(1+1),'+91 ಹಲೋ\r\n`
    );

    expect(buildImportRows(table, 3)).toEqual([
      { route: "/", key: "k1", source: "=SUM(1+1)", text: "+91 ಹಲೋ" },
    ]);
  });
});

describe("encoding corruption", () => {
  const replacement = String.fromCharCode(0xfffd);
  const header = `${Q}Asset ID${Q},${Q}Route${Q},${Q}English, en${Q},${Q}Kannada, kn${Q}`;

  test.each([
    ["replacement characters", `${replacement}${replacement}`],
    ["NUL characters, as left by a UTF-16 file read as UTF-8,", String.fromCharCode(0)],
  ])("a file with %s is rejected with CSV UTF-8 instructions", (_name, cell) => {
    const result = parseTranslationCsv(`${header}\n"k1","/","Hello","${cell}"\n`);

    expect(result.error).toBe(ENCODING_ERROR);
    expect(result.error).toMatch(/CSV UTF-8/);
  });

  test("valid Kannada, Telugu, quotes, commas, multiline values, BOM and CRLF are not mistaken for corruption", () => {
    const text =
      String.fromCharCode(0xfeff) +
      `${header}\r\n` +
      `${Q}k1${Q},${Q}/${Q},${Q}Welcome, friend${Q},${Q}ಸ್ವಾಗತ, ${Q}${Q}ಸ್ನೇಹಿತ${Q}${Q}${Q}\r\n` +
      `${Q}k2${Q},${Q}/about${Q},${Q}Line one\nLine two${Q},${Q}తెలుగు\nవచనం${Q}\r\n`;

    const table = parseTranslationCsv(text);

    expect(table.error).toBeUndefined();
    expect(buildImportRows(table, 3)).toHaveLength(2);
  });

  test("translations that are only question marks are counted, legitimate ones are not", () => {
    const rows = [
      { source: "Hello", text: "?????" },
      { source: "Home page", text: "??" },
      { source: "What?", text: "ಏಕೆ?" },
      { source: "???", text: "???" },
      { source: "Why", text: "?" },
      { source: "Blank", text: "" },
      { source: "Spaced", text: "  ???  " },
    ];

    expect(countQuestionMarkTranslations(rows)).toBe(3);
  });

  test("the question mark message names the count and CSV UTF-8", () => {
    expect(questionMarkError(1)).toMatch(/^1 translation contains only "\?"/);
    expect(questionMarkError(3)).toMatch(/^3 translations contain only/);
    expect(questionMarkError(2)).toMatch(/CSV UTF-8/);
  });
});
