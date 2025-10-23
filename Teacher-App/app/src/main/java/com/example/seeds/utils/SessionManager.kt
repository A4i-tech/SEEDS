package com.example.seeds.utils

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private var prefs: SharedPreferences = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)

    fun clearSession() {
        // Clear all stored data in SharedPreferences,
        // Log out the user
        prefs.edit().clear().apply()
    }
}