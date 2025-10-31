package com.example.seeds.ui.Login

import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.example.seeds.MainActivity
import com.example.seeds.R
import com.example.seeds.databinding.ActivityLoginBinding
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.ui.call.CallViewModel
import com.example.seeds.utils.Constants
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import javax.inject.Inject

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private var organizations = mutableListOf<String>()

    @Inject
    lateinit var teacherRepository: TeacherRepository

    private val viewModel: CallViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val emailField = binding.editTextEmail
        val passwordField = binding.editTextPassword
        val orgDropdown = binding.organizationDropdown
        val loginBtn = binding.emailLoginBtn
        val registerBtn = binding.emailRegisterBtn

        // Fetch organizations safely
        fetchOrganizations { orgList ->
            organizations = orgList.toMutableList()
            val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, organizations)
            runOnUiThread {
                orgDropdown.setAdapter(adapter)
            }
        }

        // Login click
        loginBtn.setOnClickListener {
            val email = emailField.text.toString().trim()
            val password = passwordField.text.toString().trim()
            var organization = orgDropdown.text.toString().trim()
            if (organization.isEmpty()) organization = "none"

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            loginWithPhoneNumber(email, password, organization)
        }

        // Register click
        registerBtn.setOnClickListener {
            val email = emailField.text.toString().trim()
            val password = passwordField.text.toString().trim()
            var organization = orgDropdown.text.toString().trim()
            if (organization.isEmpty()) organization = "none"

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            registerTenant(email, password, organization)
        }
    }

    private fun fetchOrganizations(onResult: (List<String>) -> Unit) {
        val client = OkHttpClient()
        val request = Request.Builder()
            .url(Constants.BASE_URL + "/tenant/list")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Failed to load organizations", Toast.LENGTH_SHORT).show()
                }
                onResult(emptyList())
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body()?.string() ?: ""
                if (!response.isSuccessful || body.isBlank()) {
                    onResult(emptyList())
                    return
                }

                try {
                    val orgs = mutableListOf<String>()
                    if (body.trim().startsWith("[")) {
                        val jsonArray = JSONArray(body)
                        for (i in 0 until jsonArray.length()) {
                            val obj = jsonArray.getJSONObject(i)
                            orgs.add(obj.optString("organizationName", ""))
                        }
                    }
                    onResult(orgs)
                } catch (e: Exception) {
                    e.printStackTrace()
                    onResult(emptyList())
                }
            }
        })
    }

    private fun registerTenant(email: String, password: String, organization: String) {
        val client = OkHttpClient()
        val json = JSONObject().apply {
            put("phoneNumber", email)
            put("password", password)
            put("tenantName", organization)
        }

        val body = RequestBody.create(
            MediaType.get("application/json; charset=utf-8"),
            json.toString()
        )

        val registerRequest = Request.Builder()
            .url(Constants.BASE_URL + "/tenant/teacher/register")
            .post(body)
            .build()

        client.newCall(registerRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Network error during registration", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                runOnUiThread {
                    if (response.isSuccessful) {
                        Toast.makeText(this@LoginActivity, "Registration successful! Please login.", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@LoginActivity, "Registration failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    private fun loginWithPhoneNumber(email: String, password: String, organization: String) {
        val client = OkHttpClient()
        val json = JSONObject().apply {
            put("phoneNumber", email)
            put("password", password)
            put("tenantName", organization)
        }

        val body = RequestBody.create(
            MediaType.get("application/json; charset=utf-8"),
            json.toString()
        )

        val loginRequest = Request.Builder()
            .url(Constants.BASE_URL + "/tenant/teacher/login") // ✅ login endpoint unchanged
            .post(body)
            .build()

        client.newCall(loginRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Network error", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Invalid credentials", Toast.LENGTH_SHORT).show()
                    }
                    return
                }

                val responseBody = response.body()?.string() ?: "{}"
                val json = JSONObject(responseBody)
                val token = json.optString("token", "")

                if (token.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Failed to retrieve token", Toast.LENGTH_SHORT).show()
                    }
                    return
                }

                val prefs = getSharedPreferences("sharedPref", MODE_PRIVATE).edit()
                prefs.putString("auth_token", token)
                prefs.putBoolean("is_logged_in", true)
                prefs.apply()

                fetchTeacherId(token)
            }
        })
    }

    private fun fetchTeacherId(token: String) {
        val client = OkHttpClient()
        val teacherRequest = Request.Builder()
            .url(Constants.BASE_URL + "/teacher/register")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        client.newCall(teacherRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Failed to fetch teacher ID", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Failed to get teacher info", Toast.LENGTH_SHORT).show()
                    }
                    return
                }

                val responseBody = response.body()?.string() ?: "{}"
                val json = JSONObject(responseBody)
                val teacherId = json.optString("_id", "")

                if (teacherId.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Teacher ID not found", Toast.LENGTH_SHORT).show()
                    }
                    return
                }

                getSharedPreferences("sharedPref", MODE_PRIVATE).edit()
                    .putString("teacher_id", teacherId)
                    .apply()

                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Login & Teacher ID fetched", Toast.LENGTH_SHORT).show()
                    startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                    finish()
                }
            }
        })
    }
}
