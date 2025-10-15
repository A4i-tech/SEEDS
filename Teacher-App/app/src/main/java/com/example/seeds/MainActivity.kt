package com.example.seeds

import android.content.Context
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import androidx.lifecycle.lifecycleScope
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import androidx.work.WorkManager
import com.example.seeds.dao.LogDao
import com.example.seeds.databinding.ActivityMainBinding
import com.example.seeds.network.SeedsService
import com.example.seeds.utils.Constants
import com.example.seeds.utils.TimberInitializer
import com.example.seeds.workers.UploadLogsWorker
import com.google.android.material.bottomnavigation.BottomNavigationView
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import timber.log.Timber
import java.util.*
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

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

        val sharedPreferences = getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
        var teacherPhoneNumber = sharedPreferences.getString("phone", null) ?: ""
        teacherPhoneNumber = "+91$teacherPhoneNumber"
        Log.d("MainActivity", "teacherPhoneNumber: $teacherPhoneNumber")
        if (teacherPhoneNumber.length == 13) TimberInitializer.plantTimberTree(database, teacherPhoneNumber)
        else TimberInitializer.plantTimberTree(database, "Unknown")

        val navView: BottomNavigationView = binding.navView
        val navController = findNavController(R.id.nav_host_fragment_activity_main)

        logMessage("PhoneModel ${Build.MANUFACTURER} ${Build.MODEL} ${Build.PRODUCT}")

        WorkManager.getInstance(applicationContext).getWorkInfosForUniqueWorkLiveData(
            UploadLogsWorker.WORK_NAME).observe(this, androidx.lifecycle.Observer {
            it?.let {
                if (it.isNotEmpty()) {
                    it.forEach { workInfo ->
                        WorkManager.getInstance(applicationContext).cancelWorkById(workInfo.id)
                    }
                }
            }
        })

        val appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.homeFragment,
                R.id.callSettingsFragment,
                R.id.contactsFragment,
                R.id.addStudentsFragment,
                R.id.addContentToCallFragment2,
                R.id.callFragment,
                R.id.classroomFragment,
            )
        )
        setupActionBarWithNavController(navController, appBarConfiguration)
        navView.setupWithNavController(navController)
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
        onBackPressedDispatcher.onBackPressed()
        return super.onSupportNavigateUp()
    }

    private fun startLogUploadLoop() {
        mainActivityScope.cancel()
        mainActivityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        mainActivityScope.launch {
            while (isActive) { // safe cancellation
                uploadLogs()
                delay(30_000)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        startLogUploadLoop()
    }

    override fun onStop() {
        super.onStop()
        mainActivityScope.cancel() // stop loop safely
        lifecycleScope.launch(Dispatchers.IO) { uploadLogs() } // final log upload in background
    }

    override fun onRestart() {
        mainActivitySessionId = UUID.randomUUID().toString()
        super.onRestart()
    }

    fun logMessage(msg: String) {
        Timber.tag(this.javaClass.simpleName).d("Appv${Constants.APP_VERSION} $mainActivitySessionId $msg")
    }
}
