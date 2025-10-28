package com.example.seeds.utils

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private var prefs: SharedPreferences = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)

    /**
     * Retrieves the stored auth token.
     * Returns null if the token is not found.
     */
    fun getAuthToken(): String? {
        return prefs.getString(KEY_AUTH_TOKEN, null)
    }

    /**
     * Clears all stored data in SharedPreferences to log out the user.
     */
    fun clearSession() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
    }
}