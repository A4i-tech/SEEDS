
# pullMenuMainUrl = ""
pullMenuMainUrl = "https://seedsblobstaging.blob.core.windows.net/pull-model-menus/"
content_url = "https://seedsblobstaging.blob.core.windows.net/output-container/"
url = 'https://seeds-teacherapp.azurewebsites.net/content'
headers = {
    'authToken': 'postman'
}

languageDialogUrls = {
  'english':'languageDialog/english/For%20English/{speechRate}.mp3',
  'kannada':'languageDialog/kannada/For%20Kannada/{speechRate}.mp3',
  'bengali':'languageDialog/bengali/For%20Bengali/{speechRate}.mp3'
}

speechRate = "1.0"

readingContentTitlesDialogUrl = {
  'story':'readingContentTitlesDialog/{language}/story/{speechRate}.mp3',
  'poem':'readingContentTitlesDialog/{language}/poetry/{speechRate}.mp3',
  'song':'readingContentTitlesDialog/{language}/music/{speechRate}.mp3',
  'snippet':'readingContentTitlesDialog/{language}/snippet/{speechRate}.mp3',
  'riddle':'readingContentTitlesDialog/{language}/riddle/{speechRate}.mp3',
  'quiz':'readingContentTitlesDialog/{language}/quiz/{speechRate}.mp3',
  'scramble':'readingContentTitlesDialog/{language}/scramble/{speechRate}.mp3',
  'theme':'readingContentTitlesDialog/{language}/theme/{speechRate}.mp3'
}

next4MessageUrls = {
  'story':'next4Dialog/{language}/story/{speechRate}.mp3',
  'poem':'next4Dialog/{language}/poetry/{speechRate}.mp3',
  'song':'next4Dialog/{language}/music/{speechRate}.mp3',
  'scramble':'next4Dialog/{language}/scramble/{speechRate}.mp3',
  'quiz':'next4Dialog/{language}/quiz/{speechRate}.mp3',
  'snippet':'next4Dialog/{language}/snippet/{speechRate}.mp3',
  'riddle':'next4Dialog/{language}/riddle/{speechRate}.mp3',
  'experience':'next4Dialog/{language}/experience/{speechRate}.mp3',
  'theme':'next4Dialog/{language}/theme/{speechRate}.mp3'
}

prev4MessageUrls = {
  'story':'prev4Dialog/{language}/story/{speechRate}.mp3',
  'poem':'prev4Dialog/{language}/poetry/{speechRate}.mp3',
  'song':'prev4Dialog/{language}/music/{speechRate}.mp3',
  'scramble':'prev4Dialog/{language}/scramble/{speechRate}.mp3',
  'quiz':'prev4Dialog/{language}/quiz/{speechRate}.mp3',
  'snippet':'prev4Dialog/{language}/snippet/{speechRate}.mp3',
  'riddle':'prev4Dialog/{language}/riddle/{speechRate}.mp3',
  'experience':'prev4Dialog/{language}/experience/{speechRate}.mp3',
  'theme':'prev4Dialog/{language}/theme/{speechRate}.mp3'
}

experienceNames = {
  'english':[
    'story',
    'poem',
    'song',
    'snippet',
    'riddle'
  ]
}

experienceDialogAudioUrls = {
  'story':pullMenuMainUrl + 'experiencesDialog/{language}/story/For%20Stories/{speechRate}.mp3',
  'poem':pullMenuMainUrl + 'experiencesDialog/{language}/poetry/For%20Rhymes/{speechRate}.mp3',
  'song':pullMenuMainUrl + 'experiencesDialog/{language}/music/For%20Songs/{speechRate}.mp3',
  'keyLearning':pullMenuMainUrl + 'experiencesDialog/{language}/keyLearning/to%20learn%20phone%20keys/{speechRate}.mp3',
  'scramble':pullMenuMainUrl + 'experiencesDialog/{language}/scramble/to%20play%20Scramble%20Game/{speechRate}.mp3',
  'quiz':pullMenuMainUrl + 'experiencesDialog/{language}/quiz/to%20play%20quiz/{speechRate}.mp3',
  'snippet': pullMenuMainUrl + 'experiencesDialog/{language}/snippet/For%20Snippets/{speechRate}.mp3',
  'riddle': pullMenuMainUrl + 'experiencesDialog/{language}/riddle/For%20Riddles/{speechRate}.mp3'
}

repeatCurrentMenuUrl = 'repeatMenuDialog/{language}/To%20repeat%20Current%20Menu/{speechRate}.mp3'
repeatContentUrl = 'contentPlayingDialogs/{language}/toRepeatContent/{speechRate}.mp3'
exitContentUrl = 'contentPlayingDialogs/{language}/toExitContent/{speechRate}.mp3'
goToPreviousMenuMessageUrl = 'previousMenuDialog/{language}/To%20go%20to%20Previous%20Menu/{speechRate}.mp3'


pressKeyMessageUrl = 'pressKeysDialog/{language}/{key}/{speechRate}.mp3'

audioGoingTobePlayedDialogUrl = 'audioDialogs/{language}/audioGoingToBePlayedDialog/{speechRate}.mp3'
audioFinishedMessageUrl = 'audioDialogs/{language}/audioFinishedDialog/{speechRate}.mp3' #includes 'to repeat, press 8 and to go back press 9'


number_of_categories_listed_in_one_state = 4
next_n_categories_key = "5"
previous_n_categories_key = "7"
repeat_current_categories_key = "8"
previous_category_level_key = "9"

content_attributes = [
    {'category': 'language', 'level': 0, 'id': 'LA'},
    {'category': 'theme', 'level': 1, 'id': 'TH'},
    {'category': 'type', 'level': 2, 'id': 'EX'},
    {'category': 'title', 'level': 3, 'id': 'TI'}
]


quiz_new = {
  "id": "e3d1db09-f5fd-44b2-8244-86ea61619175",
  "language": "kannada",
  "theme": "water",
  "themeAudio": "https://seedsblobstaging.blob.core.windows.net/theme-titles/Water/kannada",
  "title": "Punyakoti",
  "titleAudio": "https://seedsblobstaging.blob.core.windows.net/experience-titles/quiz/12f77743-4255-48a8-855b-2f4d7b635c95/1.0.mp3",
  "localTitle": "ಮೊಲದ ಮರಿ",
  "positiveMarks": 1,
  "negativeMarks": 0,
  "type": "quiz",
  "questions": [
    {
      "question": {
        "id": "f8210aca-d2e0-445e-bb92-9e673bb92158",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_1/1.0.mp3",
        "text": "ಪುಣ್ಯಕೋಟಿಗೂ ತನ್ನ ಕರುವಿಗೂ ಏನು ಸಂಬಂಧ? "
      },
      "options": [
        {
          "id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_1/1/1.0.mp3",
          "text": " ತಾಯಿ"
        },
        {
          "id": "614c161e-a0b0-426f-913c-fc8adba39f8b",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_1/2/1.0.mp3",
          "text": " ಒಡಹುಟ್ಟಿದವರು"
        },
        {
          "id": "f34e920d-78a5-4230-9bd0-d603acc941d5",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_1/3/1.0.mp3",
          "text": " ಸ್ನೇಹಿತ"
        },
        {
          "id": "e8ba0f72-bf17-47b2-ba4b-6bd53615604a",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_1/4/1.0.mp3",
          "text": " ಚಿಕ್ಕಮ್ಮ "
        }
      ],
      "correct_option_id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0"
    },
    {
      "question": {
        "id": "973d0720-ada8-4193-9708-6c0191c47971",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_2/1.0.mp3",
        "text": "ಪುಣ್ಯಕೋಟಿ ತನ್ನ ಸ್ನೇಹಿತರೊಂದಿಗೆ ಹುಲ್ಲು ತಿನ್ನುತ್ತಿರುವಾಗ ಯಾವ ಪ್ರಾಣಿ ತಡೆಯುತ್ತದೆ? "
      },
      "options": [
        {
          "id": "a66288f0-f09d-4510-b747-26660b6dac8d",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_2/1/1.0.mp3",
          "text": " ಹುಲಿ "
        },
        {
          "id": "d79f2970-e8a6-4b19-95a4-15c49db89886",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_2/2/1.0.mp3",
          "text": " ಸಿಂಹ"
        },
        {
          "id": "1e4756b0-684b-48d0-9168-b544b3ad2396",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_2/3/1.0.mp3",
          "text": " ಬೇಟೆಗಾರ"
        },
        {
          "id": "2f1a696e-7857-43fe-973f-50b599224946",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_2/4/1.0.mp3",
          "text": " ತೋಳ"
        }
      ],
      "correct_option_id": "a66288f0-f09d-4510-b747-26660b6dac8d"
    },
    {
      "question": {
        "id": "fee0d467-7360-4b67-b022-2f5f2a857527",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_3/1.0.mp3",
        "text": "ಪುಣ್ಯಕೋಟಿಯು ಹುಲಿಯನ್ನು ಭೇಟಿಯಾದಾಗ ಏನು ಮಾಡಬೇಕೆಂದು ಕೇಳಿದಳು? "
      },
      "options": [
        {
          "id": "f2762f67-8ae1-4829-a802-94dc05ede9c7",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_3/1/1.0.mp3",
          "text": " ಅವಳು ಮನೆಗೆ ಹೋಗಲಿ"
        },
        {
          "id": "8e14b74e-856e-4f1c-b420-ab2cb6a64414",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_3/2/1.0.mp3",
          "text": " ಅವಳ ಜೀವವನ್ನು ಉಳಿಸಿ"
        },
        {
          "id": "35ab28b3-6af7-41ac-945b-1c0c2976b001",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_3/3/1.0.mp3",
          "text": " ಅವಳನ್ನು ಬೇಗನೆ ತಿನ್ನಿರಿ"
        },
        {
          "id": "e7a8047e-22ce-4593-be4e-acd698a59854",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_3/4/1.0.mp3",
          "text": " ಅವಳನ್ನು ಬಿಟ್ಟುಬಿಡಿ "
        }
      ],
      "correct_option_id": "f2762f67-8ae1-4829-a802-94dc05ede9c7"
    },
    {
      "question": {
        "id": "c791fe18-fb7b-4818-a067-bbd7fb176b08",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_4/1.0.mp3",
        "text": "ಪುಣ್ಯಕೋಟಿ ತನ್ನ ಕರುವನ್ನು ಏನು ಮಾಡಬೇಕೆಂದು ತನ್ನ ಸ್ನೇಹಿತರನ್ನು ಕೇಳಿದಳು? "
      },
      "options": [
        {
          "id": "642c6e83-116f-45a4-b4b4-872d623bb7e4",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_4/1/1.0.mp3",
          "text": " ಅವಳನ್ನು ನೋಡಿಕೊಳ್ಳಿ"
        },
        {
          "id": "42fee7a7-c05d-43cb-bb87-9d63fb0a7bef",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_4/2/1.0.mp3",
          "text": " ಅವಳೊಂದಿಗೆ ಆಟವಾಡಿ"
        },
        {
          "id": "90c089e9-79cd-43cd-92c5-207adcf414fc",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_4/3/1.0.mp3",
          "text": " ಅವಳಿಗೆ ಆಹಾರ ನೀಡಿ"
        },
        {
          "id": "6db0e624-0eb7-4750-99d3-5839a1b7a496",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_4/4/1.0.mp3",
          "text": " ಅವಳನ್ನು ನಿರ್ಲಕ್ಷಿಸಿ "
        }
      ],
      "correct_option_id": "642c6e83-116f-45a4-b4b4-872d623bb7e4"
    },
    {
      "question": {
        "id": "a6311ab0-0f8f-400f-bf5d-b015ba0a401c",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_5/1.0.mp3",
        "text": "ಸತ್ಯದ ಬಗ್ಗೆ ಪುಣ್ಯಕೋಟಿ ಹೇಳಿದ್ದೇನು? "
      },
      "options": [
        {
          "id": "5a72b87a-f7fe-4e19-9099-dabe763e6fc8",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_5/1/1.0.mp3",
          "text": " ಇದು ನಮ್ಮ ತಾಯಿ ಮತ್ತು ತಂದೆ"
        },
        {
          "id": "79df7b0e-6ec2-4882-913f-33f1cac8f9d9",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_5/2/1.0.mp3",
          "text": " ಇದು ಮುಖ್ಯವಲ್ಲ"
        },
        {
          "id": "0600e6e2-1055-4702-8396-8a331db133f3",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_5/3/1.0.mp3",
          "text": " ಇದು ಮೂರ್ಖರಿಗೆ"
        },
        {
          "id": "3b27625b-9b25-442a-9adf-1727dd77165d",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_5/4/1.0.mp3",
          "text": " ಇದು ಶ್ರೀಮಂತರಿಗೆ "
        }
      ],
      "correct_option_id": "5a72b87a-f7fe-4e19-9099-dabe763e6fc8"
    },
    {
      "question": {
        "id": "92e20030-83c9-43ad-9b4a-ba8561104e14",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_6/1.0.mp3",
        "text": "ಹುಲಿಯು ಪುಣ್ಯಕೋಟಿಯನ್ನು ತಿನ್ನುವ ಆಲೋಚನೆಯನ್ನು ಏಕೆ ಬದಲಾಯಿಸಿತು? "
      },
      "options": [
        {
          "id": "56c874b1-ae12-4aac-8ad5-f73db7920145",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_6/1/1.0.mp3",
          "text": " ಅವನು ಅವಳ ಪ್ರಾಮಾಣಿಕತೆಯಿಂದ ಪ್ರಭಾವಿತನಾದನು"
        },
        {
          "id": "3dd7cf7c-4968-4c9a-8d97-598be6e10e76",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_6/2/1.0.mp3",
          "text": " ಅವನು ಅವಳಿಗೆ ಹೆದರುತ್ತಿದ್ದನು"
        },
        {
          "id": "e7ca0e4e-c4f8-4276-84df-0ddea5dd6e98",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_6/3/1.0.mp3",
          "text": " ಅವನು ಇತರ ಆಹಾರವನ್ನು ಕಂಡುಕೊಂಡನು"
        },
        {
          "id": "1b775566-ffdc-4d52-8e80-6bc534985a6c",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_6/4/1.0.mp3",
          "text": " ಅವನ ಹೊಟ್ಟೆ ತುಂಬಿತ್ತು "
        }
      ],
      "correct_option_id": "56c874b1-ae12-4aac-8ad5-f73db7920145"
    },
    {
      "question": {
        "id": "fba9ecc2-23e2-42e0-ab84-b05bd6c03fa4",
        "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/question_7/1.0.mp3",
        "text": "ಪುಣ್ಯಕೋಟಿ ಮನೆಗೆ ಹಿಂದಿರುಗಿದಾಗ ಏನಾಯಿತು? "
      },
      "options": [
        {
          "id": "d94ce54d-09b5-432e-842d-e3a84ad62caa",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_7/1/1.0.mp3",
          "text": " ಅವಳು ತನ್ನ ಕರುವನ್ನು ತಬ್ಬಿಕೊಂಡಳು"
        },
        {
          "id": "aa0993af-ef17-4024-ba50-3eee8eaa0c79",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_7/2/1.0.mp3",
          "text": " ಹುಲಿ ಅವಳನ್ನು ತಿನ್ನಿತು"
        },
        {
          "id": "59a485ab-5d91-4a17-93c9-0a62a32acaab",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_7/3/1.0.mp3",
          "text": " ಅವಳು ಓಡಿಹೋದಳು"
        },
        {
          "id": "0dd73d31-9cd2-4c08-b33b-1134c0c86860",
          "url": "https://seedsblobstaging.blob.core.windows.net/output-container/Quiz/Punyakoti/option_7/4/1.0.mp3",
          "text": " ಅವಳು ಆಕಾಶದಲ್ಲಿ ನಕ್ಷತ್ರವಾದಳು "
        }
      ],
      "correct_option_id": "d94ce54d-09b5-432e-842d-e3a84ad62caa"
    }
  ]
}