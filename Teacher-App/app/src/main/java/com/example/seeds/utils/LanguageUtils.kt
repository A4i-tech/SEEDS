package com.example.seeds.utils

private val LANGUAGE_LABELS = mapOf(
    "en" to "English",
    "kn" to "Kannada",
    "hi" to "Hindi",
    "bn" to "Bengali",
    "ta" to "Tamil",
    "mr" to "Marathi",
    "or" to "Odia",
)

fun getLanguageLabel(iso: String): String =
    LANGUAGE_LABELS[iso.lowercase()] ?: iso.replaceFirstChar { it.uppercaseChar() }
