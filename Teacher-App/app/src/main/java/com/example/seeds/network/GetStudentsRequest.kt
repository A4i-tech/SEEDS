package com.example.seeds.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import se.ansman.kotshi.JsonSerializable

@JsonSerializable
@JsonClass(generateAdapter = true)
data class GetStudentsRequest(
    @Json(name = "phone_number") val phoneNumber: String
)