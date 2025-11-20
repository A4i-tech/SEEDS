package com.example.seeds.ui.Login

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.example.seeds.MainActivity
import com.example.seeds.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class SplashScreenActivity : AppCompatActivity() {

    companion object{
        private const val SPLASH_SCREEN_DURATION_MS = 1500L
    }
    private lateinit var requestPermissionLauncher: ActivityResultLauncher<String>
    private var activityContext = this

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        setContentView(R.layout.activity_splash_screen)
        supportActionBar?.hide()

//        requestPermissionLauncher = registerForActivityResult(
//            ActivityResultContracts.RequestPermission()
//        ) { isGranted: Boolean ->
//            if(isGranted) {
//                checkAndNavigate()
//            } else {
//                showPermissionExplanationDialog()
//            }
//        }

        requestPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { isGranted: Boolean ->
            if (isGranted) {
                checkAndNavigate()
            } else {
//                showPermissionExplanationDialog()
//                // Handle the case where permission is denied
                if (!shouldShowRequestPermissionRationale(Manifest.permission.READ_CONTACTS)) {
                    // Permission denied and shouldn't show rationale
                    // Show a toast and close the app or redirect to a permission settings page
                    Toast.makeText(this, "Permission denied", Toast.LENGTH_SHORT).show()
                    showPermissionDeniedDialog()
                } else {
                    // Show permission explanation dialog
                    showPermissionExplanationDialog()
                }
            }
        }

        // Check for permission or request it
        when {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED -> {
                checkAndNavigate()
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
            }
        }

//        when {
//            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED -> {
//                checkAndNavigate()
//            }
//            shouldShowRequestPermissionRationale(Manifest.permission.READ_CONTACTS) -> {
//                showPermissionExplanationDialog()
//            }
//            else -> {
//                requestPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
//            }
//        }
    }

// This has been commented out to allow the app to run without a login
//    private fun checkAndNavigate() {
//        lifecycleScope.launch {
//            val user = Firebase.auth.currentUser
//            var intent: Intent
//            if (user == null) {
//                intent = Intent(activityContext, LoginActivity::class.java)
//                intent.flags = intent.flags or Intent.FLAG_ACTIVITY_NO_HISTORY
//            } else {
//                intent = Intent(activityContext, MainActivity::class.java)
//            }
//            startActivity(intent)
//        }
//    }

    private fun checkAndNavigate() {
        lifecycleScope.launch {
            // Optional splash delay
            delay(SPLASH_SCREEN_DURATION_MS)

            val sharedPref = getSharedPreferences("sharedPref", MODE_PRIVATE)
            val isLoggedIn = sharedPref.getBoolean("is_logged_in", false)
            val intent = if (isLoggedIn) {
                Intent(this@SplashScreenActivity, MainActivity::class.java)
            } else {
                Intent(this@SplashScreenActivity, LoginActivity::class.java)
            }
            startActivity(intent)
            finish()
        }
    }



    private fun showPermissionExplanationDialog() {
        val logmessage = """This app needs to read your contacts to function properly. 
                                    Without this permission, the app cannot operate."""
        AlertDialog.Builder(this)
            .setTitle("Permission Required")
            .setMessage(logmessage)
            .setPositiveButton("Try Again") { dialog, which ->
                requestPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
            }
            .setNegativeButton("Exit") { dialog, which ->
                dialog.dismiss()
                finishAndRemoveTask() // This will close the current activity
            }
            .setCancelable(false) // Prevents dismissing the dialog without making a choice
            .create()
            .show()
    }

    private fun showPermissionDeniedDialog() {
        AlertDialog.Builder(this)
            .setTitle("Permission Required")
            .setMessage("""This app needs to read your contacts to function properly. 
            Without this permission, the app cannot operate. Enable it from settings""")
            .setPositiveButton("OKAY") { dialog, which ->
                dialog.dismiss()
                finishAndRemoveTask() // This will close the current activity
            }
            .setCancelable(false) // Prevents dismissing the dialog without making a choice
            .create()
            .show()
    }
}