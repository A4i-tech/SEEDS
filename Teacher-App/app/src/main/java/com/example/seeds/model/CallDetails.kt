package com.example.seeds.model

data class CallDetails (
    val confId: String,
    val phoneNumbers: List<String>,
    val names: List<String>,
    val leader_phone: String? = null
)