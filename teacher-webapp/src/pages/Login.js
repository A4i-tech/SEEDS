import React, { useEffect } from "react";
import { useState } from "react";
import axios from "axios";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { STATUS_CODES } from "../constants/statusCodes";
import { useNavigation } from "../hooks/useNavigation";

function Login() {
  const navigate = useNavigation();
  const [showError, setShowError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schools, setSchools] = useState([]);

  useEffect(() => {
    const fetchSchools = async () => {
      setLoadingSchools(true);
      try {
        const response = await axios.get(`${API_ENDPOINTS.GET_SCHOOLS}`);
        if (response.status === STATUS_CODES.SUCCESS) {
          setSchools(response.data);
        } else {
          console.error("Failed to fetch schools");
        }
      } catch (error) {
        console.error("Error fetching schools:", error);
      } finally {
        setLoadingSchools(false);
      }
    };

    fetchSchools();
  }, []);

  const handleLogin = async () => {
    if (!phoneNumber || !password || !schoolName) {
      setShowError("All fields are required.");
      return;
    }

    try {
      const response = await axios.post(`${API_ENDPOINTS.LOGIN}`, {
        phoneNumber,
        password,
        tenantId: schoolName,
      });
      console.log(response);
      if (response.status === STATUS_CODES.SUCCESS) {
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("phoneNumber", response.data.phoneNumber);
        console.log("Login successful!");
        navigate.goToHome(response.data.phoneNumber);
      }
    } catch (error) {
      console.error("Username or password or tenant name incorrect", error);
      setShowError("Username or password or tenant name incorrect");
    }
  };

  const handleRegister = () => {
    navigate.goToRegister();
  };

  const inputStyle = {
    marginBottom: "10px",
    padding: "8px",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "16px",
  };

  const formContainerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "300px",
    gap: "15px",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        flexDirection: "column",
      }}
    >
      <h1>Login</h1>
      <br />
      <div style={formContainerStyle}>
        <input
          type="tel"
          placeholder="Phone Number"
          value={phoneNumber}
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, "");
            setPhoneNumber(digitsOnly);
          }}
          minLength="10"
          maxLength="10"
          pattern="\d{10}"
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <select
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          style={inputStyle}
        >
          <option value="">{loadingSchools ? "Loading Schools..." : "Select School"}</option>
          {schools.map((sch, idx) => {
            const value = sch.id;
            const label = sch.tenantName;
            return (
              <option key={idx} value={value}>
                {label}
              </option>
            );
          })}
        </select>
        <button
          className="btn"
          onClick={handleLogin}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          Login
        </button>
        <span
          style={{
            color: "#28574F",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={handleRegister}
        >
          Signup
        </span>
      </div>
      {showError && <p style={{ color: "red" }}>{showError}</p>}
    </div>
  );
}

export default Login;
