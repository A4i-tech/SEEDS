"""
Test fixtures for comprehension data.
Provides sample MongoDB documents for testing.
"""

from typing import Dict, Any


# Full comprehension document matching MongoDB structure
SAMPLE_COMPREHENSION_DOC: Dict[str, Any] = {
    "_id": "692564322dabc989a8c86d72",
    "comprehension_id": "12345678",
    "id": "45",
    "language": "kannada",
    "title": "Punyakoti",
    "localTitle": "ಮೊಲದ ಮರಿ",
    "theme": "water",
    "isPullModel": "true",
    "isProcessed": "true",
    "isTeacherApp": "true",
    "__v": 0,
    "type": "comprehension",
    "isDeleted": "false",
    "positiveMarks": 1,
    "negativeMarks": 0,
    "questions": [
        {
            "question": {
                "id": "f8210aca-d2e0-445e-bb92-9e673bb92158",
                "text": "ಪುಣ್ಯಕೋಟಿಗೂ ತನ್ನ ಕರುವಿಗೂ ಏನು ಸಂಬಂಧ? ",
                "audio_path": "Quiz/Punyakoti/question_1/1.0.mp3",
            },
            "options": [
                {
                    "id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0",
                    "text": " ತಾಯಿ",
                    "audio_path": "Quiz/Punyakoti/option_1/1/1.0.mp3",
                },
                {
                    "id": "614c161e-a0b0-426f-913c-fc8adba39f8b",
                    "text": " ಒಡಹುಟ್ಟಿದವರು",
                    "audio_path": "Quiz/Punyakoti/option_1/2/1.0.mp3",
                },
                {
                    "id": "f34e920d-78a5-4230-9bd0-d603acc941d5",
                    "text": " ಸ್ನೇಹಿತ",
                    "audio_path": "Quiz/Punyakoti/option_1/3/1.0.mp3",
                },
                {
                    "id": "e8ba0f72-bf17-47b2-ba4b-6bd53615604a",
                    "text": " ಚಿಕ್ಕಮ್ಮ ",
                    "audio_path": "Quiz/Punyakoti/option_1/4/1.0.mp3",
                },
            ],
            "correct_option_id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0",
        },
        {
            "question": {
                "id": "973d0720-ada8-4193-9708-6c0191c47971",
                "text": "ಪುಣ್ಯಕೋಟಿ ತನ್ನ ಸ್ನೇಹಿತರೊಂದಿಗೆ ಹುಲ್ಲು ತಿನ್ನುತ್ತಿರುವಾಗ ಯಾವ ಪ್ರಾಣಿ ತಡೆಯುತ್ತದೆ? ",
                "audio_path": "Quiz/Punyakoti/question_2/1.0.mp3",
            },
            "options": [
                {
                    "id": "a66288f0-f09d-4510-b747-26660b6dac8d",
                    "text": " ಹುಲಿ ",
                    "audio_path": "Quiz/Punyakoti/option_2/1/1.0.mp3",
                },
                {
                    "id": "d79f2970-e8a6-4b19-95a4-15c49db89886",
                    "text": " ಸಿಂಹ",
                    "audio_path": "Quiz/Punyakoti/option_2/2/1.0.mp3",
                },
                {
                    "id": "1e4756b0-684b-48d0-9168-b544b3ad2396",
                    "text": " ಬೇಟೆಗಾರ",
                    "audio_path": "Quiz/Punyakoti/option_2/3/1.0.mp3",
                },
                {
                    "id": "2f1a696e-7857-43fe-973f-50b599224946",
                    "text": " ತೋಳ",
                    "audio_path": "Quiz/Punyakoti/option_2/4/1.0.mp3",
                },
            ],
            "correct_option_id": "a66288f0-f09d-4510-b747-26660b6dac8d",
        },
        {
            "question": {
                "id": "fee0d467-7360-4b67-b022-2f5f2a857527",
                "text": "ಪುಣ್ಯಕೋಟಿಯು ಹುಲಿಯನ್ನು ಭೇಟಿಯಾದಾಗ ಏನು ಮಾಡಬೇಕೆಂದು ಕೇಳಿದಳು? ",
                "audio_path": "Quiz/Punyakoti/question_3/1.0.mp3",
            },
            "options": [
                {
                    "id": "f2762f67-8ae1-4829-a802-94dc05ede9c7",
                    "text": " ಅವಳು ಮನೆಗೆ ಹೋಗಲಿ",
                    "audio_path": "Quiz/Punyakoti/option_3/1/1.0.mp3",
                },
                {
                    "id": "8e14b74e-856e-4f1c-b420-ab2cb6a64414",
                    "text": " ಅವಳ ಜೀವವನ್ನು ಉಳಿಸಿ",
                    "audio_path": "Quiz/Punyakoti/option_3/2/1.0.mp3",
                },
                {
                    "id": "35ab28b3-6af7-41ac-945b-1c0c2976b001",
                    "text": " ಅವಳನ್ನು ಬೇಗನೆ ತಿನ್ನಿರಿ",
                    "audio_path": "Quiz/Punyakoti/option_3/3/1.0.mp3",
                },
                {
                    "id": "e7a8047e-22ce-4593-be4e-acd698a59854",
                    "text": " ಅವಳನ್ನು ಬಿಟ್ಟುಬಿಡಿ ",
                    "audio_path": "Quiz/Punyakoti/option_3/4/1.0.mp3",
                },
            ],
            "correct_option_id": "f2762f67-8ae1-4829-a802-94dc05ede9c7",
        },
        {
            "question": {
                "id": "c791fe18-fb7b-4818-a067-bbd7fb176b08",
                "text": "ಪುಣ್ಯಕೋಟಿ ತನ್ನ ಕರುವನ್ನು ಏನು ಮಾಡಬೇಕೆಂದು ತನ್ನ ಸ್ನೇಹಿತರನ್ನು ಕೇಳಿದಳು? ",
                "audio_path": "Quiz/Punyakoti/question_4/1.0.mp3",
            },
            "options": [
                {
                    "id": "642c6e83-116f-45a4-b4b4-872d623bb7e4",
                    "text": " ಅವಳನ್ನು ನೋಡಿಕೊಳ್ಳಿ",
                    "audio_path": "Quiz/Punyakoti/option_4/1/1.0.mp3",
                },
                {
                    "id": "42fee7a7-c05d-43cb-bb87-9d63fb0a7bef",
                    "text": " ಅವಳೊಂದಿಗೆ ಆಟವಾಡಿ",
                    "audio_path": "Quiz/Punyakoti/option_4/2/1.0.mp3",
                },
                {
                    "id": "90c089e9-79cd-43cd-92c5-207adcf414fc",
                    "text": " ಅವಳಿಗೆ ಆಹಾರ ನೀಡಿ",
                    "audio_path": "Quiz/Punyakoti/option_4/3/1.0.mp3",
                },
                {
                    "id": "6db0e624-0eb7-4750-99d3-5839a1b7a496",
                    "text": " ಅವಳನ್ನು ನಿರ್ಲಕ್ಷಿಸಿ ",
                    "audio_path": "Quiz/Punyakoti/option_4/4/1.0.mp3",
                },
            ],
            "correct_option_id": "642c6e83-116f-45a4-b4b4-872d623bb7e4",
        },
        {
            "question": {
                "id": "a6311ab0-0f8f-400f-bf5d-b015ba0a401c",
                "text": "ಸತ್ಯದ ಬಗ್ಗೆ ಪುಣ್ಯಕೋಟಿ ಹೇಳಿದ್ದೇನು? ",
                "audio_path": "Quiz/Punyakoti/question_5/1.0.mp3",
            },
            "options": [
                {
                    "id": "5a72b87a-f7fe-4e19-9099-dabe763e6fc8",
                    "text": " ಇದು ನಮ್ಮ ತಾಯಿ ಮತ್ತು ತಂದೆ",
                    "audio_path": "Quiz/Punyakoti/option_5/1/1.0.mp3",
                },
                {
                    "id": "79df7b0e-6ec2-4882-913f-33f1cac8f9d9",
                    "text": " ಇದು ಮುಖ್ಯವಲ್ಲ",
                    "audio_path": "Quiz/Punyakoti/option_5/2/1.0.mp3",
                },
                {
                    "id": "0600e6e2-1055-4702-8396-8a331db133f3",
                    "text": " ಇದು ಮೂರ್ಖರಿಗೆ",
                    "audio_path": "Quiz/Punyakoti/option_5/3/1.0.mp3",
                },
                {
                    "id": "3b27625b-9b25-442a-9adf-1727dd77165d",
                    "text": " ಇದು ಶ್ರೀಮಂತರಿಗೆ ",
                    "audio_path": "Quiz/Punyakoti/option_5/4/1.0.mp3",
                },
            ],
            "correct_option_id": "5a72b87a-f7fe-4e19-9099-dabe763e6fc8",
        },
        {
            "question": {
                "id": "92e20030-83c9-43ad-9b4a-ba8561104e14",
                "text": "ಹುಲಿಯು ಪುಣ್ಯಕೋಟಿಯನ್ನು ತಿನ್ನುವ ಆಲೋಚನೆಯನ್ನು ಏಕೆ ಬದಲಾಯಿಸಿತು? ",
                "audio_path": "Quiz/Punyakoti/question_6/1.0.mp3",
            },
            "options": [
                {
                    "id": "56c874b1-ae12-4aac-8ad5-f73db7920145",
                    "text": " ಅವನು ಅವಳ ಪ್ರಾಮಾಣಿಕತೆಯಿಂದ ಪ್ರಭಾವಿತನಾದನು",
                    "audio_path": "Quiz/Punyakoti/option_6/1/1.0.mp3",
                },
                {
                    "id": "3dd7cf7c-4968-4c9a-8d97-598be6e10e76",
                    "text": " ಅವನು ಅವಳಿಗೆ ಹೆದರುತ್ತಿದ್ದನು",
                    "audio_path": "Quiz/Punyakoti/option_6/2/1.0.mp3",
                },
                {
                    "id": "e7ca0e4e-c4f8-4276-84df-0ddea5dd6e98",
                    "text": " ಅವನು ಇತರ ಆಹಾರವನ್ನು ಕಂಡುಕೊಂಡನು",
                    "audio_path": "Quiz/Punyakoti/option_6/3/1.0.mp3",
                },
                {
                    "id": "1b775566-ffdc-4d52-8e80-6bc534985a6c",
                    "text": " ಅವನ ಹೊಟ್ಟೆ ತುಂಬಿತ್ತು ",
                    "audio_path": "Quiz/Punyakoti/option_6/4/1.0.mp3",
                },
            ],
            "correct_option_id": "56c874b1-ae12-4aac-8ad5-f73db7920145",
        },
        {
            "question": {
                "id": "fba9ecc2-23e2-42e0-ab84-b05bd6c03fa4",
                "text": "ಪುಣ್ಯಕೋಟಿ ಮನೆಗೆ ಹಿಂದಿರುಗಿದಾಗ ಏನಾಯಿತು? ",
                "audio_path": "Quiz/Punyakoti/question_7/1.0.mp3",
            },
            "options": [
                {
                    "id": "d94ce54d-09b5-432e-842d-e3a84ad62caa",
                    "text": " ಅವಳು ತನ್ನ ಕರುವನ್ನು ತಬ್ಬಿಕೊಂಡಳು",
                    "audio_path": "Quiz/Punyakoti/option_7/1/1.0.mp3",
                },
                {
                    "id": "aa0993af-ef17-4024-ba50-3eee8eaa0c79",
                    "text": " ಹುಲಿ ಅವಳನ್ನು ತಿನ್ನಿತು",
                    "audio_path": "Quiz/Punyakoti/option_7/2/1.0.mp3",
                },
                {
                    "id": "59a485ab-5d91-4a17-93c9-0a62a32acaab",
                    "text": " ಅವಳು ಓಡಿಹೋದಳು",
                    "audio_path": "Quiz/Punyakoti/option_7/3/1.0.mp3",
                },
                {
                    "id": "0dd73d31-9cd2-4c08-b33b-1134c0c86860",
                    "text": " ಅವಳು ಆಕಾಶದಲ್ಲಿ ನಕ್ಷತ್ರವಾದಳು ",
                    "audio_path": "Quiz/Punyakoti/option_7/4/1.0.mp3",
                },
            ],
            "correct_option_id": "d94ce54d-09b5-432e-842d-e3a84ad62caa",
        },
    ],
    "titleAudioPath": "Quiz/Punyakoti/titleAudio.mp3",
    "themeAudioPath": "Quiz/Punyakoti/themeAudio.mp3",
}


# Minimal comprehension document for simple tests
MINIMAL_COMPREHENSION_DOC: Dict[str, Any] = {
    "_id": "minimal_1",
    "comprehension_id": "minimal_test",
    "id": "1",
    "language": "english",
    "title": "Test Comprehension",
    "theme": "test",
    "type": "comprehension",
    "questions": [
        {
            "question": {
                "id": "q1",
                "text": "Test question?",
                "audio_path": "test/question.mp3",
            },
            "options": [
                {"id": "opt1", "text": "Option 1", "audio_path": "test/option1.mp3"},
                {"id": "opt2", "text": "Option 2", "audio_path": "test/option2.mp3"},
            ],
            "correct_option_id": "opt1",
        }
    ],
    "titleAudioPath": "test/title.mp3",
    "themeAudioPath": "test/theme.mp3",
}
