// azure-cognitiveservices-speech.js

require("dotenv").config();

const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { Buffer } = require("buffer");
const { PassThrough } = require("stream");
const fs = require("fs");
const { DefaultAzureCredential } = require("@azure/identity");

// Global mappings
const translationLanguageCodeToAzureSpeechCode = {
  kn: "kn-IN",
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  bn: "bn-IN",
};

const humanLanguageCodeToTranslationLanguageCode = {
  english: "en",
  kannada: "kn",
  hindi: "hi",
  marathi: "mr",
  tamil: "ta",
  bengali: "bn",
};

const voiceName = {
  "en-IN": "en-IN-NeerjaNeural",
  "kn-IN": "kn-IN-SapnaNeural",
  "hi-IN": "hi-IN-SwaraNeural",
  "ta-IN": "ta-IN-PallaviNeural",
  "mr-IN": "mr-IN-AarohiNeural",
  "bn-IN": "bn-IN-TanishaaNeural",
};

function getTTSAttributes(language) {
  const translationCode = humanLanguageCodeToTranslationLanguageCode[language.toLowerCase()];
  if (!translationCode) return null; // Language not found

  const languageCode = translationLanguageCodeToAzureSpeechCode[translationCode];
  const voice = voiceName[languageCode];

  return languageCode && voice ? { languageCode, voiceName: voice } : null;
}

async function getCognitiveServicesToken(resource) {
  const credential = new DefaultAzureCredential();
  try {
    const accessToken = await credential.getToken(resource);
    return accessToken.token;
  } catch (error) {
    console.error("Error fetching access token for resource: " + resource, error);
    throw error;
  }
}

async function createSpeechConfig() {
  const subscriptionKey = process.env.TTS_SUBSCRIPTION_KEY || process.env.SPEECH_KEY;
  const region = process.env.TTS_REGION;
  let speechConfig;

  if (subscriptionKey && region) {
    speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
  } else {
    const resourceId = process.env.TTS_RESOURCE_ID;
    if (!resourceId || !region) {
      throw new Error(
        "TTS requires either TTS_SUBSCRIPTION_KEY + TTS_REGION, or TTS_RESOURCE_ID + TTS_REGION with Azure credential."
      );
    }
    const token = await getCognitiveServicesToken("https://cognitiveservices.azure.com/.default");
    const authorizationToken = `aad#${resourceId}#${token}`;
    speechConfig = sdk.SpeechConfig.fromAuthorizationToken(authorizationToken, region);
  }

  return speechConfig;
}

/**
 * Convert text to speech asynchronously
 * @param {string} text - Text to convert to speech
 * @param {string} language - Language of speech eg Kannada, english, etc.
 * @param {string} rate - Prosody rate (speech rate)
 * @param {string} filename - Optional file to save audio output
 * @returns {Promise<Stream>} - Returns a readable stream
 */
async function textToSpeech(text, language, rate, filename) {
  try {
    const speechConfig = await createSpeechConfig();
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    let audioConfig = filename ? sdk.AudioConfig.fromAudioFileOutput(filename) : null;

    const { languageCode, voiceName } = getTTSAttributes(language) || {};

    console.log(
      `CONVERTING TEXT : ${text} TO AUDIO OF LANGUAGE CODE: ${languageCode} USING VOICE: ${voiceName} WITH SPEECH RATE: ${rate}...`
    );

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
    const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${languageCode}">
              <voice name="${voiceName}">
                  <prosody rate="${rate}" volume="+100.00%">
                      ${text}
                  </prosody>
                  <mstts:silence type="Leading-exact" value="0ms"/>
                  <mstts:silence type="Tailing-exact" value="0ms"/>
              </voice>
          </speak>
      `;

    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log("TTS synthesis completed successfully.");

            if (filename) {
              resolve(fs.createReadStream(filename));
            } else {
              const bufferStream = new PassThrough();
              bufferStream.end(Buffer.from(result.audioData));
              resolve(bufferStream);
            }
          } else {
            console.error("TTS synthesis failed:", result.errorDetails);
            reject(new Error(result.errorDetails || "Unknown error synthesizing speech"));
          }
          synthesizer.close();
        },
        (error) => {
          console.error("TTS synthesis error:", error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    console.error("Error in textToSpeech:", error);
    throw error;
  }
}

module.exports = {
  textToSpeech,
};
