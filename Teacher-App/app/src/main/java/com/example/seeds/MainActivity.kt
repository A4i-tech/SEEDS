package com.example.seeds

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.MenuItem
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AppCompatActivity
import androidx.drawerlayout.widget.DrawerLayout
import androidx.lifecycle.lifecycleScope
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import androidx.work.WorkManager
import com.example.seeds.dao.LogDao
import com.example.seeds.databinding.ActivityMainBinding
import com.example.seeds.network.SeedsService
import com.example.seeds.ui.Login.LoginActivity
import com.example.seeds.utils.Constants
import com.example.seeds.utils.SessionManager
import com.example.seeds.utils.TimberInitializer
import com.example.seeds.workers.UploadLogsWorker
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.navigation.NavigationView
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import timber.log.Timber
import java.util.*
import javax.inject.Inject

const val PHONE_NUMBER_LENGTH = 13
const val LOG_UPLOAD_INTERVAL_MS = 30_000L

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var sessionManager: SessionManager

    @Inject
    lateinit var database: LogDao

    @Inject
    lateinit var network: SeedsService

    private var mainActivityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    var mainActivitySessionId = UUID.randomUUID().toString()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.mainToolbar)

        sessionManager = SessionManager(applicationContext)
        drawerLayout = binding.drawerLayout
        val navViewDrawer: NavigationView = binding.navViewDrawer

        val toggle = ActionBarDrawerToggle(
            this, drawerLayout, binding.mainToolbar,
            R.string.navigation_drawer_open,
            R.string.navigation_drawer_close
        )
        drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

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

        val appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.homeFragment,
                R.id.callSettingsFragment,
                R.id.contactsFragment,
                R.id.addStudentsFragment,
                R.id.addContentToCallFragment2,
                R.id.callFragment,
                R.id.classroomFragment
            ),
            drawerLayout
        )
        setupActionBarWithNavController(navController, appBarConfiguration)
        navView.setupWithNavController(navController)
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
        return navController.navigateUp() || drawerLayout.isDrawerOpen(binding.navViewDrawer) || super.onSupportNavigateUp()
    }

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