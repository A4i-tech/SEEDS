package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable 

@JsonSerializable 
data class GetStudentsRequest(
    val phoneNumber: String
)