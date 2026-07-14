package com.example.seeds

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.drawerlayout.widget.DrawerLayout
import androidx.lifecycle.lifecycleScope
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import androidx.navigation.ui.NavigationUI
import androidx.work.WorkManager
import com.example.seeds.dao.LogDao
import com.example.seeds.databinding.ActivityMainBinding
import com.example.seeds.network.SeedsService
import com.example.seeds.ui.Login.LoginActivity
import com.example.seeds.utils.Constants
import com.example.seeds.utils.SessionManager
import com.example.seeds.utils.TimberInitializer
import com.example.seeds.workers.UploadLogsWorker
import com.example.seeds.ui.voiceCommand.VoiceCommandBottomSheet
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.navigation.NavigationView
import dagger.hilt.android.AndroidEntryPoint
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject

const val PHONE_NUMBER_LENGTH = 12
const val LOG_UPLOAD_INTERVAL_MS = 30_000L

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var sessionManager: SessionManager
    private lateinit var appBarConfiguration: AppBarConfiguration 

    @Inject
    lateinit var database: LogDao

    @Inject
    lateinit var network: SeedsService

    @Inject
    lateinit var ttsPlayer: com.example.seeds.audio.TtsPlayer

    private var mainActivityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    var mainActivitySessionId = UUID.randomUUID().toString()

    // Voice command activation (Phase 7): long-press anywhere + orb + volume-up.
    private var voiceSheet: VoiceCommandBottomSheet? = null

    private val gestureDetector by lazy {
        GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onLongPress(e: MotionEvent) { onLongPressActivate() }
        })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.mainToolbar)

        sessionManager = SessionManager(applicationContext)
        drawerLayout = binding.drawerLayout
        val navViewDrawer: NavigationView = binding.navViewDrawer

        navViewDrawer.setNavigationItemSelectedListener { menuItem ->
            handleDrawerItemClick(menuItem)
            true
        }

        val sharedPreferences = getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
        var teacherPhoneNumber = sharedPreferences.getString("phone", null) ?: ""
        teacherPhoneNumber = "+91$teacherPhoneNumber"
        Log.d("MainActivity", "teacherPhoneNumber: $teacherPhoneNumber")

        if (teacherPhoneNumber.length == PHONE_NUMBER_LENGTH)
            TimberInitializer.plantTimberTree(database, teacherPhoneNumber)
        else
            TimberInitializer.plantTimberTree(database, "Unknown")

        val navView: BottomNavigationView = binding.navView
        val navController = findNavController(R.id.nav_host_fragment_activity_main)

        logMessage("PhoneModel ${Build.MANUFACTURER} ${Build.MODEL} ${Build.PRODUCT}")

        WorkManager.getInstance(applicationContext)
            .getWorkInfosForUniqueWorkLiveData(UploadLogsWorker.WORK_NAME)
            .observe(this) { list ->
                list?.forEach { workInfo ->
                    WorkManager.getInstance(applicationContext).cancelWorkById(workInfo.id)
                }
            }

        appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.homeFragment,
                R.id.classroomFragment
            ),
            drawerLayout
        )
        setupActionBarWithNavController(navController, appBarConfiguration)

        navController.addOnDestinationChangedListener { _, destination, _ ->
            if (destination.id == R.id.callFragment) {
                supportActionBar?.setDisplayHomeAsUpEnabled(false)
                supportActionBar?.setHomeButtonEnabled(false)
                binding.mainToolbar.navigationIcon = null
                drawerLayout.setDrawerLockMode(DrawerLayout.LOCK_MODE_LOCKED_CLOSED)
            } else {
                drawerLayout.setDrawerLockMode(DrawerLayout.LOCK_MODE_UNLOCKED)
            }
        }
        navView.setupWithNavController(navController)

        binding.voiceOrb.setOnClickListener { showVoiceSheet(autoRecord = false) }

        maybePlayWelcome()
    }

    // Welcome TTS once per login session (web: sessionStorage "seeds_welcomed"). Flag lives in
    // "sharedPref" and is cleared on logout, so backgrounding/recreate does not replay it.
    private fun maybePlayWelcome() {
        val prefs = getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
        if (prefs.getBoolean("seeds_welcomed", false)) return
        prefs.edit().putBoolean("seeds_welcomed", true).apply()
        lifecycleScope.launch {
            delay(300)  // let the UI settle first, mirroring web
            try { ttsPlayer.playWelcome() } catch (e: Exception) { Timber.w(e, "Welcome TTS failed") }
        }
    }

    private fun showVoiceSheet(autoRecord: Boolean) {
        // Guard: ignore while a sheet is already up (covers shake-during-recording and in-flight command).
        if (voiceSheet?.isAdded == true) return
        val sheet = VoiceCommandBottomSheet.newInstance(currentClassId = null, autoRecord = autoRecord)
        voiceSheet = sheet
        sheet.show(supportFragmentManager, "voice_command")
    }

    private fun onLongPressActivate() {
        if (voiceSheet?.isAdded == true) return
        vibrate()
        showVoiceSheet(autoRecord = true)
    }

    // Long-press anywhere activates voice AI. Feed all touches to the detector, then let them
    // continue normally so buttons/scrolling still work.
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    private fun vibrate() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        vibrator?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    // Volume-up stops an in-progress recording; when idle, let it fall through to normal volume control.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP && event.action == KeyEvent.ACTION_UP) {
            val sheet = voiceSheet
            if (sheet?.isAdded == true && sheet.isRecording()) {
                sheet.stopRecording()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun handleDrawerItemClick(item: MenuItem) {
        when (item.itemId) {
            R.id.nav_logout -> {
                performLogout()
            }
        }
        drawerLayout.closeDrawers()
    }

    private fun performLogout() {
        lifecycleScope.launch {
            try {
                val token = sessionManager.getAuthToken()
                if (!token.isNullOrEmpty()) {
                    val bearerToken = "Bearer $token"
                    val response = network.logout(bearerToken)
                    if (response.isSuccessful) {
                        Timber.d("Successfully notified backend of logout (Status Code: 200).")
                    } else {
                        Timber.w("Backend logout notification failed with code: ${response.code()}")
                    }
                } else {
                    Timber.w("No auth token found, cannot notify backend of logout.")
                }
            } catch (e: Exception) {
                Timber.e(e, "Network error during logout notification.")
            } finally {
                withContext(Dispatchers.Main) {
                    sessionManager.clearSession()
                    // Clear the welcome flag so it replays on the next login (web parity).
                    getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
                        .edit().remove("seeds_welcomed").apply()

                    mainActivityScope.cancel()
                    WorkManager.getInstance(applicationContext).cancelAllWork()

                    val intent = Intent(this@MainActivity, LoginActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    }
                    startActivity(intent)
                    finish()
                }
            }
        }
    }

    private suspend fun uploadLogs() {
        withContext(Dispatchers.IO) {
            val logs = database.getAll()
            if (logs.isNotEmpty()) {
                try {
                    network.uploadLogs(logs)
                    database.delete(logs.map { it.id })
                } catch (e: Exception) {
                    Timber.e(e, "Failed to upload logs")
                }
            }
        }
    }

    fun setBottomNavigationVisibility(visibility: Int) {
        binding.navView.visibility = visibility
    }

    override fun onSupportNavigateUp(): Boolean {
        val navController = findNavController(R.id.nav_host_fragment_activity_main)
        return NavigationUI.navigateUp(navController, appBarConfiguration)|| super.onSupportNavigateUp()}

    override fun onBackPressed() {
        if (drawerLayout.isDrawerOpen(binding.navViewDrawer)) {
            drawerLayout.closeDrawers()
        } else {
            val navController = findNavController(R.id.nav_host_fragment_activity_main)
            if (navController.currentDestination?.id == R.id.classroomFragment) {
                navController.navigate(R.id.homeFragment)
            } else {
                super.onBackPressed()
            }
        }
    }

    private fun startLogUploadLoop() {
        mainActivityScope.cancel()
        mainActivityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        mainActivityScope.launch {
            while (isActive) {
                uploadLogs()
                delay(LOG_UPLOAD_INTERVAL_MS)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        startLogUploadLoop()
    }

    override fun onStop() {
        super.onStop()
        mainActivityScope.cancel()
        lifecycleScope.launch(Dispatchers.IO) { uploadLogs() }
    }

    override fun onRestart() {
        mainActivitySessionId = UUID.randomUUID().toString()
        super.onRestart()
    }

    fun logMessage(msg: String) {
        Timber.tag(this.javaClass.simpleName)
            .d("Appv${Constants.APP_VERSION} $mainActivitySessionId $msg")
    }
}