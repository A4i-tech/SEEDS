package com.example.seeds.ui.Login

import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.example.seeds.MainActivity
import com.example.seeds.R
import android.R.layout.simple_dropdown_item_1line
import com.example.seeds.databinding.ActivityLoginBinding
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.ui.call.CallViewModel
import com.example.seeds.utils.Constants
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import javax.inject.Inject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import com.example.seeds.utils.NativeEncryptor
import com.example.seeds.utils.KeyManager
import android.util.Base64
import java.security.SecureRandom


class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private var organizations = mutableListOf<String>()

    @Inject
    lateinit var teacherRepository: TeacherRepository

    private val viewModel: CallViewModel by viewModels()

    private val LOGIN_URL = Constants.BASE_URL + "/tenant/teacher/login"
    private val REGISTER_URL = Constants.BASE_URL + "/tenant/teacher/register"
    private val ORGANIZATIONS_URL = Constants.BASE_URL + "/tenant/list"

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
            val adapter = ArrayAdapter(this, simple_dropdown_item_1line, organizations)
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
            .url(ORGANIZATIONS_URL)
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
            .url(REGISTER_URL)
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
            .url(LOGIN_URL) 
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

                 try {
                    // val secretKey = KeyManager.getOrCreateSecretKey()

                    // val iv = ByteArray(16) 
                    // SecureRandom().nextBytes(iv)
                    // val encryptedTokenBytes = NativeEncryptor.encrypt(token, secretKey.encoded, iv)
                    // val encryptedTokenBase64 = Base64.encodeToString(encryptedTokenBytes, Base64.DEFAULT)
                    // val ivBase64 = Base64.encodeToString(iv, Base64.DEFAULT)
                    val prefs = getSharedPreferences("sharedPref", MODE_PRIVATE).edit()
                    prefs.putString("auth_token", token)
                    // prefs.putString("encryption_iv", ivBase64) 
                    // prefs.putBoolean("is_logged_in", true)
                    prefs.apply()

                } catch (e: Exception) {
                    e.printStackTrace()
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Could not encrypt token", Toast.LENGTH_SHORT).show()
                    }
                    return
                }
                startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                finish()                
            }
        })

    }
}