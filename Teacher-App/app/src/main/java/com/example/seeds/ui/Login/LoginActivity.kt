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
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.credentials.Credential
import com.google.android.gms.auth.api.credentials.Credentials
import com.google.android.gms.auth.api.credentials.HintRequest
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import javax.inject.Inject
import android.util.Log


class LoginActivity : AppCompatActivity() {

    companion object {
        private const val PHONE_NUMBER_LENGTH = 10
    }
    private lateinit var binding: ActivityLoginBinding
    private var organizations = mutableListOf<String>()

    private lateinit var phoneHintLauncher: ActivityResultLauncher<IntentSenderRequest>

    @Inject
    lateinit var teacherRepository: TeacherRepository

    private val viewModel: CallViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val phoneField = binding.editTextPhone
        val passwordField = binding.editTextPassword
        val orgDropdown = binding.organizationDropdown
        val loginBtn = binding.emailLoginBtn
        val registerBtn = binding.emailRegisterBtn

        // Hint launcher
        phoneHintLauncher =
            registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
                if (result.resultCode == RESULT_OK) {
                    val credential = result.data?.getParcelableExtra<Credential>(Credential.EXTRA_KEY)
                    val phoneNumber = credential?.id?.let {
                        // Normalize the phone number to get the last 10 digits
                        val digitsOnly = it.replace(Regex("[^0-9]"), "")
                        digitsOnly.takeLast(PHONE_NUMBER_LENGTH)
                    }
                    // Set the retrieved and cleaned phone number in the EditText
                    phoneField.setText(phoneNumber)
                } else {
                    // This block runs if the user closes the hint picker without choosing a number.
                    Log.d("LoginActivity", "Phone number hint was not selected.")
                }
            }

        phoneField.setOnClickListener {
            requestPhoneNumberHint()
        }

        phoneField.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                requestPhoneNumberHint()
            }
        }


        // Fetch organizations safely
        fetchOrganizations { orgList ->
            organizations = orgList.toMutableList()
            val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line,
             organizations)
            runOnUiThread {
                orgDropdown.setAdapter(adapter)
            }
        }

        // Login click
        loginBtn.setOnClickListener {
            val phone = phoneField.text.toString().trim()
            val password = passwordField.text.toString().trim()
            var organization = orgDropdown.text.toString().trim()
            if (organization.isEmpty()) organization = "none"

            if (phone.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            loginWithEmail(phone, password, organization)
        }

        // Register click
        registerBtn.setOnClickListener {
            val phone = phoneField.text.toString().trim()
            val password = passwordField.text.toString().trim()
            var organization = orgDropdown.text.toString().trim()
            if (organization.isEmpty()) organization = "none"

            if (phone.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            registerTenant(phone, password, organization)
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
                    Toast.makeText(this@LoginActivity,
                     "Failed to load organizations", Toast.LENGTH_SHORT).show()
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

    private fun requestPhoneNumberHint() {
        val hintRequest = HintRequest.Builder()
            .setPhoneNumberIdentifierSupported(true)
            .build()
        
        val credentialsClient = Credentials.getClient(this)
        val intent = credentialsClient.getHintPickerIntent(hintRequest)

        try {
            val intentSenderRequest = IntentSenderRequest.Builder(intent.intentSender).build()
            phoneHintLauncher.launch(intentSenderRequest)
        } catch (e: Exception) {
            Log.e("LoginActivity", "Could not start hint picker", e)
        }
    }

    
    private fun registerTenant(phone: String, password: String, organization: String) {
        val client = OkHttpClient()
        val json = JSONObject().apply {
            put("phoneNumber", "$phone")
            put("password", password)
            put("tenantName", organization)
        }

        val body = RequestBody.create(
            MediaType.get("application/json; charset=utf-8"),
            json.toString()
        )

        val registerRequest = Request.Builder()
            .url(Constants.BASE_URL + "/tenant/register")
            .post(body)
            .build()

        client.newCall(registerRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity,
                     "Network error during registration", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                runOnUiThread {
                    if (response.isSuccessful) {
                        Toast.makeText(this@LoginActivity,
                         "Registration successful! Please login.", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@LoginActivity,
                         "Registration failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    private fun loginWithEmail(phone: String, password: String, organization: String) {
        val client = OkHttpClient()
        val json = JSONObject().apply {
            put("phoneNumber", "$phone")
            put("password", password)
            put("tenantName", organization)
        }

        val body = RequestBody.create(
            MediaType.get("application/json; charset=utf-8"),
            json.toString()
        )

        val loginRequest = Request.Builder()
            .url(Constants.BASE_URL + "/tenant/login") 
            .post(body)
            .build()

        client.newCall(loginRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@LoginActivity, "Network error",
                     Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Invalid credentials",
                         Toast.LENGTH_SHORT).show()
                    }
                    return
                }

                val responseBody = response.body()?.string() ?: "{}"
                val json = JSONObject(responseBody)
                val token = json.optString("token", "")

                if (token.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Failed to retrieve token",
                         Toast.LENGTH_SHORT).show()
                    }
                    return
                }
                
                Log.d("LoginActivity", "teacher phone number: $phone")
                val prefs = getSharedPreferences("sharedPref", MODE_PRIVATE).edit()
                prefs.putString("auth_token", token)
                prefs.putString("teacher_phone",phone)
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
                    Toast.makeText(this@LoginActivity, "Failed to fetch teacher ID",
                     Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Failed to get teacher info",
                         Toast.LENGTH_SHORT).show()
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
