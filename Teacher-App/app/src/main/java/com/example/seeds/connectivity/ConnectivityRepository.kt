package com.example.seeds.connectivity

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.example.seeds.network.SeedsService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConnectivityRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val service: SeedsService
) {
    companion object {
        private const val PING_INTERVAL_MS = 10_000L
        private const val PING_THRESHOLD_MS = 2_000L
        private const val ABORT_TIMEOUT_MS = 5_000L
        private const val DEBOUNCE_MS = 1_000L
    }

    private val _status = MutableStateFlow(ConnectivityStatus.ONLINE)
    val status: StateFlow<ConnectivityStatus> = _status.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pingJob: Job? = null
    private var debounceJob: Job? = null

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onLost(network: Network) {
            applyStatus(ConnectivityStatus.OFFLINE)
        }

        override fun onAvailable(network: Network) {
            scope.launch { ping() }
        }
    }

    init {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    fun startSessionMonitoring() {
        if (pingJob?.isActive == true) return
        pingJob = scope.launch {
            while (isActive) {
                ping()
                delay(PING_INTERVAL_MS)
            }
        }
    }

    fun stopSessionMonitoring() {
        pingJob?.cancel()
        pingJob = null
    }

    private fun applyStatus(next: ConnectivityStatus) {
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(DEBOUNCE_MS)
            _status.value = next
        }
    }

    private suspend fun ping() {
        val start = System.currentTimeMillis()
        try {
            val response = withTimeout(ABORT_TIMEOUT_MS) {
                service.healthPing()
            }
            if (!response.isSuccessful) {
                applyStatus(ConnectivityStatus.OFFLINE)
                return
            }
            val elapsed = System.currentTimeMillis() - start
            applyStatus(
                if (elapsed >= PING_THRESHOLD_MS) ConnectivityStatus.DEGRADED
                else ConnectivityStatus.ONLINE
            )
        } catch (e: Exception) {
            applyStatus(ConnectivityStatus.OFFLINE)
        }
    }
}
