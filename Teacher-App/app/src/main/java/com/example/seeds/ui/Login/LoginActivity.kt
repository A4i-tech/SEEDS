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
import com.example.seeds.utils.Encryptor
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
import com.example.seeds.utils.KeyManager
import android.util.Base64
import java.security.SecureRandom
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.credentials.Credential
import com.google.android.gms.auth.api.credentials.Credentials
import com.google.android.gms.auth.api.credentials.HintRequest
import android.util.Log

class LoginActivity : AppCompatActivity() {

    // Data class to hold both the ID and the name of an organization
    data class Organization(val id: String, val name: String) {
        override fun toString(): String = name
    }

    companion object {
        private const val PHONE_NUMBER_LENGTH = 10
    }

    private lateinit var binding: ActivityLoginBinding
    private lateinit var phoneHintLauncher: ActivityResultLauncher<IntentSenderRequest>
    private var organizations = mutableListOf<Organization>()

    @Inject
    lateinit var teacherRepository: TeacherRepository

    private val viewModel: CallViewModel by viewModels()

    private val LOGIN_URL = Constants.BASE_URL + "/teacher/login"
    private val ORGANIZATIONS_URL = Constants.BASE_URL + "/tenant/names"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val phoneNumberField = binding.editTextPhoneNumber
        val passwordField = binding.editTextPassword
        val orgDropdown = binding.organizationDropdown
        val loginBtn = binding.phoneNumberLoginBtn

        // Hint launcher initialization
        phoneHintLauncher =
            registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
                if (result.resultCode == RESULT_OK) {
                    val credential = result.data?.getParcelableExtra<Credential>(Credential.EXTRA_KEY)
                    credential?.id?.let {
                        val digitsOnly = it.replace(Regex("[^0-9]"), "")
                        val phoneNumber = digitsOnly.takeLast(PHONE_NUMBER_LENGTH)
                        phoneNumberField.setText(phoneNumber)
                    }
                } else {
                    Log.d("LoginActivity", "Phone number hint was not selected.")
                }
            }

        // Listeners
        phoneNumberField.setOnClickListener { requestPhoneNumberHint() }
        phoneNumberField.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) requestPhoneNumberHint() }

        // Fetch organizations and populate the dropdown
        fetchOrganizations { orgList ->
            organizations = orgList.toMutableList()
            val adapter = ArrayAdapter(this, simple_dropdown_item_1line, organizations)
            runOnUiThread {
                orgDropdown.setAdapter(adapter)
            }
        }

        // Login click listener
        loginBtn.setOnClickListener {
            val phoneNumber = phoneNumberField.text.toString().trim()
            val password = passwordField.text.toString().trim()
            val organizationName = orgDropdown.text.toString().trim()

            if (phoneNumber.isEmpty() || password.isEmpty() || organizationName.isEmpty()) {
                Toast.makeText(this, "Please fill all fields and select an organization", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Find the selected organization from our list to get its ID
            val selectedOrganization = organizations.find { it.name == organizationName }
            if (selectedOrganization == null) {
                Toast.makeText(this, "Please select a valid organization from the list", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Call the login function with the ID
            loginWithPhoneNumber(phoneNumber, password, selectedOrganization.id)
        }

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

    private fun fetchOrganizations(onResult: (List<Organization>) -> Unit) {
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
                    val orgs = mutableListOf<Organization>()
                    val jsonArray = JSONArray(body)
                    for (i in 0 until jsonArray.length()) {
                        val obj = jsonArray.getJSONObject(i)
                        val orgId = obj.optString("id", "")
                        val orgName = obj.optString("tenantName", "")
                        if (orgId.isNotEmpty() && orgName.isNotEmpty()) {
                            orgs.add(Organization(orgId, orgName))
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

    private fun loginWithPhoneNumber(phoneNumber: String, password: String, organizationId: String) {
        val client = OkHttpClient()
        val json = JSONObject().apply {
            put("phoneNumber", phoneNumber)
            put("password", password)
            put("tenantId", organizationId)
        }

        val body = RequestBody.create(
            MediaType.parse("application/json; charset=utf-8"),
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

                // Encrypt the auth token
                val (encryptedToken, iv) = Encryptor.encrypt(token)

                try {
                    val prefs = getSharedPreferences("sharedPref", MODE_PRIVATE).edit()
                    prefs.putString("auth_token", encryptedToken)
                    prefs.putString("auth_iv",iv)
                    prefs.putString("teacher_phone", phoneNumber)
                    prefs.putBoolean("is_logged_in", true)
                    prefs.apply()

                } catch (e: Exception) {
                    e.printStackTrace()
                    runOnUiThread {
                        Toast.makeText(this@LoginActivity, "Could not save token", Toast.LENGTH_SHORT).show()
                    }
                    return
                }
                startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                finish()
            }
        })
    }
}