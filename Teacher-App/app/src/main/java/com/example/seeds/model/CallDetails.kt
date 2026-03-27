package com.example.seeds.model

import com.squareup.moshi.Json

data class CallDetails (
    val confId: String,
    val phoneNumbers: List<String>,
    val names: List<String>,
    @Json(name = "leader_phone") val leaderPhone: String? = null
)
