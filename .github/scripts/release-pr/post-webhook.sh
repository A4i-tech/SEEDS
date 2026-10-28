#!/usr/bin/env bash
jq -nc --arg text "$1" '{
  type: "message",
  attachments: [{
    contentType: "application/vnd.microsoft.card.adaptive",
    content: {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.5",
      msteams: {width: "Full"},
      body: [{type: "TextBlock", text: $text, wrap: true}]
    }
  }]
}' | curl --fail-with-body -sS -X POST -H 'Content-Type: application/json' -d @- "$WEBHOOK_URL"
