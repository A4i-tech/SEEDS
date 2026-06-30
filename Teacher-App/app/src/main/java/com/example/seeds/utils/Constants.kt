package com.example.seeds.utils
import com.example.seeds.BuildConfig

class Constants {
    companion object {
        val BASE_URL: String = BuildConfig.BASE_URL
        val CONTENT_URL: String = BuildConfig.CONTENT_URL
        val TENANT_NAME: String = BuildConfig.TENANT_NAME
        const val APP_VERSION = "2025.11.2"
        
        // History Configuration
        const val DEFAULT_CONTENT_HISTORY_SIZE = 5  // Number of recent content items to display
        const val DEFAULT_SESSION_HISTORY_SIZE = 10  // Number of conference sessions to track
    }
}

