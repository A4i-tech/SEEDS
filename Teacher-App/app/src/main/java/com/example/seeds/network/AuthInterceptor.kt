package com.example.seeds.network

import android.content.Context
import android.content.Intent
import com.example.seeds.ui.Login.LoginActivity 
import com.example.seeds.utils.SessionManager
import okhttp3.Interceptor
import okhttp3.Response

const val FORBIDDEN = 403

class AuthInterceptor(private val context: Context) : Interceptor {

    private val sessionManager = SessionManager(context)
    

    override fun intercept(chain: Interceptor.Chain): Response {
        // Proceed with the original request
        val response = chain.proceed(chain.request())

        // Check the response code
         if (response.code() == FORBIDDEN) {
            // If we receive a 403 Forbidden response, clear the session...
            sessionManager.clearSession()

            // ...and redirect to the LoginActivity.
            val intent = Intent(context, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            context.startActivity(intent)
        }

        return response
    }
}