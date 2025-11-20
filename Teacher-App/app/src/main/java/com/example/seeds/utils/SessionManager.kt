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
        val storedEncryptedJwt = prefs.getString(KEY_AUTH_TOKEN, null)
        val storedIv = prefs.getString(IV, null)

        return storedEncryptedJwt?.let { encryptedJwt ->
        storedIv?.let { iv ->
            Encryptor.decrypt(encryptedJwt, iv)
        }
    }
        
    }

    /**
     * Clears all stored data in SharedPreferences to log out the user.
     */
    fun clearSession() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val IV = "auth_iv"
    }
}